import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { boatCreateSchema, boatUpdateSchema, parsePositiveInt, BOAT_STATUSES } from '@turmstatus/shared';
import { z } from 'zod';
import { boats, towers } from '../db/schema.js';
import { requireAuth, requireWachfuehrer } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { recordAudit } from '../lib/audit.js';
import { buildBoatViews } from '../lib/views.js';

const boatStatusSchema = z.object({ status: z.enum(BOAT_STATUSES) });

function ownsTower(app: FastifyInstance, towerId: number, ownerId: number): boolean {
  return !!app.db.select({ id: towers.id }).from(towers).where(and(eq(towers.id, towerId), eq(towers.ownerId, ownerId))).get();
}

export async function boatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boats', { preHandler: requireAuth }, async (req) => buildBoatViews(app.db, req.scope));

  app.post('/api/boats', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const body = parseBody(boatCreateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    if (body.towerId != null && !ownsTower(app, body.towerId, uid)) {
      return reply.code(400).send({ error: 'Turm gehört nicht zu deinem Bereich' });
    }
    const row = app.db
      .insert(boats)
      .values({
        name: body.name,
        callSign: body.callSign ?? null,
        towerId: body.towerId ?? null,
        status: body.status ?? 'AT_TOWER',
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        ownerId: uid
      })
      .returning({ id: boats.id })
      .get();
    recordAudit(req, 'boat.create', 'boat', row.id, { name: body.name });
    app.realtime.broadcast('boats-updated');
    app.realtime.broadcast('towers-updated');
    return reply.code(201).send({ id: row.id });
  });

  app.patch('/api/boats/:id', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(boatUpdateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const existing = app.db.select().from(boats).where(and(eq(boats.id, id), eq(boats.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Boot nicht gefunden' });
    if (body.towerId != null && !ownsTower(app, body.towerId, uid)) {
      return reply.code(400).send({ error: 'Turm gehört nicht zu deinem Bereich' });
    }
    app.db
      .update(boats)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.callSign !== undefined && { callSign: body.callSign }),
        ...(body.towerId !== undefined && { towerId: body.towerId }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(boats.id, id))
      .run();
    recordAudit(req, 'boat.update', 'boat', id, body);
    app.realtime.broadcast('boats-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });

  // Boot-Status: Owner-Wachführer ODER ein Bootsführer im selben Mandanten.
  app.patch('/api/boats/:id/status', { preHandler: requireAuth }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(boatStatusSchema, req.body, reply);
    if (!body) return;
    const user = req.session.user!;
    const boat = app.db.select().from(boats).where(eq(boats.id, id)).get();
    const allowed =
      boat &&
      ((user.role === 'WACHFUEHRER' && boat.ownerId === user.id) ||
        (user.role === 'BOOTSFUEHRER' && boat.ownerId === user.ownerId));
    if (!boat || !allowed) return reply.code(404).send({ error: 'Boot nicht gefunden' });

    app.db.update(boats).set({ status: body.status, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(boats.id, id)).run();
    recordAudit(req, 'boat.status', 'boat', id, { status: body.status });
    app.realtime.broadcast('boats-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });

  app.delete('/api/boats/:id', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const uid = req.session.user!.id;
    const existing = app.db.select().from(boats).where(and(eq(boats.id, id), eq(boats.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Boot nicht gefunden' });
    app.db.delete(boats).where(eq(boats.id, id)).run();
    recordAudit(req, 'boat.delete', 'boat', id, { name: existing.name });
    app.realtime.broadcast('boats-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });
}
