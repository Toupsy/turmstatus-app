// ============================================================
// team.ts – Wachführer verwaltet EIGENES Wachpersonal (WACHGAENGER/BOOTSFUEHRER).
// owner_id wird serverseitig zwingend auf den anlegenden Wachführer gesetzt.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  teamMemberCreateSchema,
  teamMemberUpdateSchema,
  resetPasswordSchema,
  parsePositiveInt
} from '@turmstatus/shared';
import { users } from '../db/schema.js';
import { requireAuth, requireWachfuehrer } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { recordAudit } from '../lib/audit.js';
import { hashPassword } from '../auth/password.js';
import { toUserDto } from '../lib/mappers.js';

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  const gate = { preHandler: [requireAuth, requireWachfuehrer] };

  app.get('/api/team/members', gate, async (req) => {
    const uid = req.session.user!.id;
    const rows = app.db
      .select()
      .from(users)
      .where(and(eq(users.ownerId, uid), inArray(users.role, ['WACHGAENGER', 'BOOTSFUEHRER'])))
      .all();
    return rows.map(toUserDto);
  });

  app.post('/api/team/members', gate, async (req, reply) => {
    const body = parseBody(teamMemberCreateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const clash = app.db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).get();
    if (clash) return reply.code(409).send({ error: 'Benutzername vergeben' });

    const passwordHash = await hashPassword(body.password, app.env.bcryptRounds);
    const row = app.db
      .insert(users)
      .values({
        username: body.username,
        passwordHash,
        fullName: body.fullName ?? null,
        role: body.role,
        towerId: body.towerId ?? null,
        ownerId: uid, // Mandant erzwungen
        isAdmin: false,
        isActive: true
      })
      .returning()
      .get();
    recordAudit(req, 'team.create', 'user', row.id, { username: body.username, role: body.role });
    app.realtime.broadcast('users-updated');
    return reply.code(201).send(toUserDto(row));
  });

  app.patch('/api/team/members/:id', gate, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(teamMemberUpdateSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const existing = app.db.select().from(users).where(and(eq(users.id, id), eq(users.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Mitglied nicht gefunden' });

    app.db
      .update(users)
      .set({
        ...(body.fullName !== undefined && { fullName: body.fullName }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.towerId !== undefined && { towerId: body.towerId }),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(users.id, id))
      .run();
    if (body.isActive === false) app.sessionStore.destroyUser(id);
    recordAudit(req, 'team.update', 'user', id, body);
    app.realtime.broadcast('users-updated');
    return { ok: true };
  });

  app.post('/api/team/members/:id/reset-password', gate, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(resetPasswordSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const existing = app.db.select({ id: users.id }).from(users).where(and(eq(users.id, id), eq(users.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Mitglied nicht gefunden' });

    const passwordHash = await hashPassword(body.password, app.env.bcryptRounds);
    app.db.update(users).set({ passwordHash, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, id)).run();
    app.sessionStore.destroyUser(id);
    recordAudit(req, 'team.reset-password', 'user', id);
    return { ok: true };
  });

  app.delete('/api/team/members/:id', gate, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const uid = req.session.user!.id;
    const existing = app.db.select().from(users).where(and(eq(users.id, id), eq(users.ownerId, uid))).get();
    if (!existing) return reply.code(404).send({ error: 'Mitglied nicht gefunden' });
    app.db.delete(users).where(eq(users.id, id)).run();
    app.sessionStore.destroyUser(id);
    recordAudit(req, 'team.delete', 'user', id, { username: existing.username });
    app.realtime.broadcast('users-updated');
    return { ok: true };
  });
}
