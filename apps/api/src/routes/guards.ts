import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { guardCreateSchema, guardStatusSchema, positionSchema, parsePositiveInt } from '@turmstatus/shared';
import { guards, towers } from '../db/schema.js';
import { requireAuth, requireWachfuehrer } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { recordAudit } from '../lib/audit.js';
import { buildGuardViews } from '../lib/views.js';

/** Prüft, ob ein Turm dem Wachführer gehört (für Zuordnungen). */
function ownsTower(app: FastifyInstance, towerId: number, ownerId: number): boolean {
  return !!app.db.select({ id: towers.id }).from(towers).where(and(eq(towers.id, towerId), eq(towers.ownerId, ownerId))).get();
}

export async function guardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/guards', { preHandler: requireAuth }, async (req) => buildGuardViews(app.db, req.scope));

  app.post('/api/guards', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const body = parseBody(guardCreateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    if (body.towerId != null && !ownsTower(app, body.towerId, uid)) {
      return reply.code(400).send({ error: 'Turm gehört nicht zu deinem Bereich' });
    }
    const row = app.db
      .insert(guards)
      .values({
        name: body.name,
        towerId: body.towerId ?? null,
        userId: body.userId ?? null,
        status: body.status ?? 'IN_AREA',
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        ownerId: uid
      })
      .returning({ id: guards.id })
      .get();
    recordAudit(req, 'guard.create', 'guard', row.id, { name: body.name });
    app.realtime.broadcast('guards-updated');
    app.realtime.broadcast('towers-updated');
    return reply.code(201).send({ id: row.id });
  });

  // Status ändern: Owner-Wachführer ODER der verknüpfte Benutzer selbst.
  app.patch('/api/guards/:id/status', { preHandler: requireAuth }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(guardStatusSchema, req.body, reply);
    if (!body) return;
    const user = req.session.user!;
    const guard = app.db.select().from(guards).where(eq(guards.id, id)).get();
    const allowed =
      guard && ((user.role === 'WACHFUEHRER' && guard.ownerId === user.id) || guard.userId === user.id);
    if (!guard || !allowed) return reply.code(404).send({ error: 'Wachgänger nicht gefunden' });

    app.db.update(guards).set({ status: body.status, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(guards.id, id)).run();
    recordAudit(req, 'guard.status', 'guard', id, { status: body.status });
    app.realtime.broadcast('guards-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });

  app.patch('/api/guards/:id/position', { preHandler: requireAuth }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(positionSchema, req.body, reply);
    if (!body) return;
    const user = req.session.user!;
    const guard = app.db.select().from(guards).where(eq(guards.id, id)).get();
    const allowed =
      guard && ((user.role === 'WACHFUEHRER' && guard.ownerId === user.id) || guard.userId === user.id);
    if (!guard || !allowed) return reply.code(404).send({ error: 'Wachgänger nicht gefunden' });

    app.db
      .update(guards)
      .set({ latitude: body.latitude, longitude: body.longitude, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(guards.id, id))
      .run();
    app.realtime.broadcast('guards-updated');
    return { ok: true };
  });

  app.delete('/api/guards/:id', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const uid = req.session.user!.id;
    const existing = app.db.select().from(guards).where(and(eq(guards.id, id), eq(guards.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Wachgänger nicht gefunden' });
    app.db.delete(guards).where(eq(guards.id, id)).run();
    recordAudit(req, 'guard.delete', 'guard', id, { name: existing.name });
    app.realtime.broadcast('guards-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });
}
