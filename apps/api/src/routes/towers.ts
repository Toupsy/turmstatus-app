import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { towerCreateSchema, towerUpdateSchema, parsePositiveInt } from '@turmstatus/shared';
import { towers, boats, guards } from '../db/schema.js';
import { requireAuth, requireWachfuehrer } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { recordAudit } from '../lib/audit.js';
import { buildTowerViews } from '../lib/views.js';

export async function towerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/towers', { preHandler: requireAuth }, async (req) => buildTowerViews(app.db, req.scope));

  app.post('/api/towers', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const body = parseBody(towerCreateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const row = app.db
      .insert(towers)
      .values({
        name: body.name,
        callSign: body.callSign ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        requiredStaff: body.requiredStaff ?? 2,
        presentStaff: body.presentStaff ?? 0,
        ownerId: uid
      })
      .returning({ id: towers.id })
      .get();
    recordAudit(req, 'tower.create', 'tower', row.id, { name: body.name });
    app.realtime.broadcast('towers-updated');
    return reply.code(201).send({ id: row.id });
  });

  app.patch('/api/towers/:id', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(towerUpdateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const existing = app.db.select().from(towers).where(and(eq(towers.id, id), eq(towers.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Turm nicht gefunden' });

    app.db
      .update(towers)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.callSign !== undefined && { callSign: body.callSign }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.requiredStaff !== undefined && { requiredStaff: body.requiredStaff }),
        ...(body.presentStaff !== undefined && { presentStaff: body.presentStaff })
      })
      .where(eq(towers.id, id))
      .run();
    recordAudit(req, 'tower.update', 'tower', id, body);
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });

  app.delete('/api/towers/:id', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const uid = req.session.user!.id;
    const existing = app.db.select().from(towers).where(and(eq(towers.id, id), eq(towers.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Turm nicht gefunden' });

    // Zugeordnete Boote/Wachgänger lösen (nicht löschen).
    app.db.update(boats).set({ towerId: null }).where(and(eq(boats.towerId, id), eq(boats.ownerId, uid))).run();
    app.db.update(guards).set({ towerId: null }).where(and(eq(guards.towerId, id), eq(guards.ownerId, uid))).run();
    app.db.delete(towers).where(eq(towers.id, id)).run();

    recordAudit(req, 'tower.delete', 'tower', id, { name: existing.name });
    app.realtime.broadcast('towers-updated');
    app.realtime.broadcast('boats-updated');
    app.realtime.broadcast('guards-updated');
    return { ok: true };
  });
}
