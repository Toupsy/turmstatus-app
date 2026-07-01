// ============================================================
// plugins/auth.ts – Auth-/Rollen-Gates als Fastify-preHandler.
//
// Kernprinzip (bewusst, siehe altes middleware.js): KEIN Admin-Bypass für
// operative/verwaltende Endpunkte. Der App-Admin ist reine Ansicht + Kontoverwaltung.
// requireWachfuehrer lässt NUR echte Wachführer durch; Owner-Prüfung passiert in den Routen.
// ============================================================

import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Role } from '@turmstatus/shared';
import { users } from '../db/schema.js';
import type { SessionUser, ViewScope } from '../types/fastify.js';

export function computeScope(user: SessionUser): ViewScope {
  if (user.isAdmin || user.role === 'HAUPTWACHE') return { all: true, scopeId: user.id };
  if (user.role === 'WACHFUEHRER') return { all: false, scopeId: user.id };
  if (user.role === 'WACHGAENGER' || user.role === 'BOOTSFUEHRER') {
    return { all: false, scopeId: user.ownerId ?? -1 };
  }
  return { all: false, scopeId: -1 };
}

/** Lädt den aktuellen Benutzer frisch aus der DB (Rolle/Deaktivierung wirken sofort). */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sess = req.session.user;
  if (!sess) {
    await reply.code(401).send({ error: 'Nicht angemeldet' });
    return;
  }
  const row = req.server.db.select().from(users).where(eq(users.id, sess.id)).get();
  if (!row || !row.isActive) {
    req.session.user = undefined;
    await reply.code(401).send({ error: 'Nicht angemeldet' });
    return;
  }
  const fresh: SessionUser = {
    id: row.id,
    username: row.username,
    role: row.role as Role,
    isAdmin: row.isAdmin,
    ownerId: row.ownerId,
    towerId: row.towerId
  };
  req.session.user = fresh;
  req.scope = computeScope(fresh);
}

/** Striktes Wachführer-Gate OHNE Admin-Bypass. */
export async function requireWachfuehrer(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.session.user?.role !== 'WACHFUEHRER') {
    await reply.code(403).send({ error: 'Nur Wachführer' });
  }
}

/** App-Admin-Gate (is_admin). */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.user?.isAdmin) {
    await reply.code(403).send({ error: 'Nur Administrator' });
  }
}

/** Rollen-Mitgliedschaft prüfen (KEIN Admin-Bypass). */
export function requireRole(...roles: Role[]) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const role = req.session.user?.role;
    if (!role || !roles.includes(role)) {
      await reply.code(403).send({ error: 'Keine Berechtigung' });
    }
  };
}
