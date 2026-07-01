import type { FastifyInstance } from 'fastify';
import { eq, sql, and, ne } from 'drizzle-orm';
import { adminUserCreateSchema, adminUserUpdateSchema, resetPasswordSchema, parsePositiveInt } from '@turmstatus/shared';
import { users } from '../../db/schema.js';
import { parseBody } from '../../lib/validate.js';
import { recordAudit } from '../../lib/audit.js';
import { hashPassword } from '../../auth/password.js';
import { toUserDto } from '../../lib/mappers.js';
import { applyTemplates } from '../../lib/templates.js';

function activeAdminCount(app: FastifyInstance, exceptId?: number): number {
  const rows = app.db
    .select({ id: users.id })
    .from(users)
    .where(exceptId ? and(eq(users.isAdmin, true), eq(users.isActive, true), ne(users.id, exceptId)) : and(eq(users.isAdmin, true), eq(users.isActive, true)))
    .all();
  return rows.length;
}

export async function adminUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/users', async () => {
    return app.db.select().from(users).all().map(toUserDto);
  });

  app.post('/api/admin/users', async (req, reply) => {
    const body = parseBody(adminUserCreateSchema, req.body, reply);
    if (!body) return;
    const clash = app.db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).get();
    if (clash) return reply.code(409).send({ error: 'Benutzername vergeben' });

    const isAdmin = body.isAdmin ?? false;
    const passwordHash = await hashPassword(body.password, app.env.bcryptRounds);
    const row = app.db
      .insert(users)
      .values({
        username: body.username,
        passwordHash,
        fullName: body.fullName ?? null,
        role: body.role,
        towerId: body.towerId ?? null,
        ownerId: null,
        isAdmin,
        isActive: true
      })
      .returning()
      .get();

    // Neuer Wachführer → Vorlagen in seinen Scope klonen.
    if (body.role === 'WACHFUEHRER' && !isAdmin) {
      applyTemplates(app.db, row.id);
      app.realtime.broadcast('towers-updated');
      app.realtime.broadcast('boats-updated');
    }
    recordAudit(req, 'admin.user.create', 'user', row.id, { username: body.username, role: body.role });
    app.realtime.broadcast('users-updated');
    return reply.code(201).send(toUserDto(row));
  });

  app.patch('/api/admin/users/:id', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(adminUserUpdateSchema, req.body, reply);
    if (!body) return;
    const existing = app.db.select().from(users).where(eq(users.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Benutzer nicht gefunden' });

    // Letzten aktiven Admin nicht entmachten.
    const wouldDropAdmin =
      existing.isAdmin && (body.isAdmin === false || body.isActive === false) && activeAdminCount(app, id) === 0;
    if (wouldDropAdmin) return reply.code(409).send({ error: 'Der letzte aktive Administrator kann nicht entfernt werden' });

    app.db
      .update(users)
      .set({
        ...(body.fullName !== undefined && { fullName: body.fullName }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.towerId !== undefined && { towerId: body.towerId }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.isAdmin !== undefined && { isAdmin: body.isAdmin }),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(users.id, id))
      .run();
    if (body.isActive === false) app.sessionStore.destroyUser(id);
    recordAudit(req, 'admin.user.update', 'user', id, body);
    app.realtime.broadcast('users-updated');
    return { ok: true };
  });

  app.post('/api/admin/users/:id/reset-password', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(resetPasswordSchema, req.body, reply);
    if (!body) return;
    const existing = app.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Benutzer nicht gefunden' });
    const passwordHash = await hashPassword(body.password, app.env.bcryptRounds);
    app.db.update(users).set({ passwordHash, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, id)).run();
    app.sessionStore.destroyUser(id);
    recordAudit(req, 'admin.user.reset-password', 'user', id);
    return { ok: true };
  });

  app.delete('/api/admin/users/:id', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const existing = app.db.select().from(users).where(eq(users.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Benutzer nicht gefunden' });
    if (existing.isAdmin && activeAdminCount(app, id) === 0) {
      return reply.code(409).send({ error: 'Der letzte Administrator kann nicht gelöscht werden' });
    }
    app.db.delete(users).where(eq(users.id, id)).run();
    app.sessionStore.destroyUser(id);
    recordAudit(req, 'admin.user.delete', 'user', id, { username: existing.username });
    app.realtime.broadcast('users-updated');
    return { ok: true };
  });
}
