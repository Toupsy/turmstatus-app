import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { loginSchema, initSchema, registerSchema, passwordChangeSchema, type Role } from '@turmstatus/shared';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { isBlocked, registerFailure, clearFailures } from '../auth/rate-limit.js';
import { parseBody } from '../lib/validate.js';
import { toCurrentUser } from '../lib/mappers.js';
import { recordAudit } from '../lib/audit.js';
import { requireAuth } from '../plugins/auth.js';
import type { SessionUser } from '../types/fastify.js';

function sessionSnapshot(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role as Role,
    isAdmin: row.isAdmin,
    ownerId: row.ownerId,
    towerId: row.towerId
  };
}

async function regenerate(req: FastifyRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err?: Error) => (err ? reject(err) : resolve()));
  });
}

function adminExists(app: FastifyInstance): boolean {
  return !!app.db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).get();
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/me', async (req) => {
    const sess = req.session.user;
    if (!sess) return { user: null };
    const row = app.db.select().from(users).where(eq(users.id, sess.id)).get();
    if (!row || !row.isActive) {
      req.session.user = undefined;
      return { user: null };
    }
    return { user: toCurrentUser(row) };
  });

  app.get('/api/auth/needs-setup', async () => ({ needsSetup: !adminExists(app) }));

  app.get('/api/auth/registration-status', async () => ({
    mode: app.env.registrationMode,
    enabled: app.env.registrationMode !== 'disabled',
    requiresCode: app.env.registrationMode === 'code'
  }));

  app.post('/api/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(loginSchema, req.body, reply);
    if (!body) return;

    const ipKey = `ip:${req.ip}`;
    const userKey = `u:${body.username.toLowerCase()}`;
    if (isBlocked(ipKey) || isBlocked(userKey)) {
      return reply.code(429).send({ error: 'Zu viele Versuche. Bitte später erneut.' });
    }

    const row = app.db.select().from(users).where(eq(users.username, body.username)).get();
    const ok = row && row.isActive && (await verifyPassword(body.password, row.passwordHash));
    if (!row || !ok) {
      registerFailure(ipKey);
      registerFailure(userKey);
      return reply.code(401).send({ error: 'Benutzername oder Passwort falsch' });
    }

    clearFailures(ipKey);
    clearFailures(userKey);
    await regenerate(req);
    req.session.user = sessionSnapshot(row);
    if (body.rememberMe) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

    app.db.update(users).set({ lastLogin: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, row.id)).run();
    recordAudit(req, 'auth.login', 'user', row.id);
    return { user: toCurrentUser(row) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const userId = req.session.user?.id ?? null;
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    if (userId !== null) app.log.info({ userId }, 'logout');
    return reply.send({ ok: true });
  });

  // Erst-Setup: erster App-Admin (nur wenn noch keiner existiert).
  app.post('/api/auth/init', async (req, reply) => {
    if (adminExists(app)) return reply.code(409).send({ error: 'Setup bereits abgeschlossen' });
    const body = parseBody(initSchema, req.body, reply);
    if (!body) return;
    const clash = app.db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).get();
    if (clash) return reply.code(409).send({ error: 'Benutzername vergeben' });

    const passwordHash = await hashPassword(body.password, app.env.bcryptRounds);
    const inserted = app.db
      .insert(users)
      .values({
        username: body.username,
        passwordHash,
        fullName: body.fullName ?? 'Hauptwache',
        role: 'HAUPTWACHE',
        isAdmin: true,
        isActive: true
      })
      .returning()
      .get();

    await regenerate(req);
    req.session.user = sessionSnapshot(inserted);
    recordAudit(req, 'auth.init', 'user', inserted.id);
    return { user: toCurrentUser(inserted) };
  });

  // Selbst-Registrierung (falls REGISTRATION_MODE=open|code) → neuer Wachführer (eigener Mandant).
  app.post('/api/auth/register', async (req, reply) => {
    if (app.env.registrationMode === 'disabled') {
      return reply.code(403).send({ error: 'Registrierung deaktiviert' });
    }
    const body = parseBody(registerSchema, req.body, reply);
    if (!body) return;
    if (app.env.registrationMode === 'code' && body.code !== app.env.registrationCode) {
      return reply.code(403).send({ error: 'Ungültiger Registrierungscode' });
    }
    const clash = app.db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).get();
    if (clash) return reply.code(409).send({ error: 'Benutzername vergeben' });

    const passwordHash = await hashPassword(body.password, app.env.bcryptRounds);
    const inserted = app.db
      .insert(users)
      .values({
        username: body.username,
        passwordHash,
        fullName: body.fullName ?? null,
        role: 'WACHFUEHRER',
        isAdmin: false,
        isActive: true
      })
      .returning()
      .get();

    await regenerate(req);
    req.session.user = sessionSnapshot(inserted);
    recordAudit(req, 'auth.register', 'user', inserted.id);
    return { user: toCurrentUser(inserted) };
  });

  // Eigenes Passwort ändern.
  app.post('/api/auth/password', { preHandler: requireAuth }, async (req, reply) => {
    const body = parseBody(passwordChangeSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const row = app.db.select().from(users).where(eq(users.id, uid)).get();
    if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
      return reply.code(403).send({ error: 'Aktuelles Passwort falsch' });
    }
    const passwordHash = await hashPassword(body.newPassword, app.env.bcryptRounds);
    app.db.update(users).set({ passwordHash, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, uid)).run();
    recordAudit(req, 'auth.password-change', 'user', uid);
    return { ok: true };
  });
}
