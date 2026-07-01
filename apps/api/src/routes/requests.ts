import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  minusOneSchema,
  kFahrtRequestSchema,
  rejectSchema,
  parsePositiveInt,
  type RequestView,
  type RequestStatus,
  type RequestKind,
  type Reason
} from '@turmstatus/shared';
import { minusOneRequests, guards, towers, users } from '../db/schema.js';
import { requireAuth, requireWachfuehrer, requireRole } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { recordAudit } from '../lib/audit.js';
import type { ViewScope } from '../types/fastify.js';

function listRequests(app: FastifyInstance, scope: ViewScope, status?: string): RequestView[] {
  const conds = [];
  if (!scope.all) conds.push(eq(guards.ownerId, scope.scopeId));
  if (status) conds.push(eq(minusOneRequests.status, status));
  const where = conds.length ? and(...conds) : undefined;

  const rows = app.db
    .select({
      r: minusOneRequests,
      guardName: guards.name,
      guardOwner: guards.ownerId,
      towerId: guards.towerId,
      towerName: towers.name,
      requesterName: users.fullName,
      requesterUser: users.username
    })
    .from(minusOneRequests)
    .leftJoin(guards, eq(minusOneRequests.guardId, guards.id))
    .leftJoin(towers, eq(guards.towerId, towers.id))
    .leftJoin(users, eq(minusOneRequests.requestedBy, users.id))
    .where(where)
    .orderBy(sql`${minusOneRequests.createdAt} DESC`)
    .all();

  return rows.map((row): RequestView => ({
    id: row.r.id,
    guardId: row.r.guardId,
    guardName: row.guardName,
    towerId: row.towerId,
    towerName: row.towerName,
    requestedBy: row.r.requestedBy,
    requestedByName: row.requesterName ?? row.requesterUser,
    kind: (row.r.kind ?? 'MINUS_ONE') as RequestKind,
    reason: (row.r.reason ?? null) as Reason | null,
    note: row.r.note,
    status: row.r.status as RequestStatus,
    rejectionReason: row.r.rejectionReason,
    createdAt: row.r.createdAt,
    decidedAt: row.r.decidedAt,
    decidedBy: row.r.decidedBy,
    returnedAt: row.r.returnedAt,
    ownerId: row.guardOwner
  }));
}

export async function requestRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/requests', { preHandler: requireAuth }, async (req) => {
    const status = (req.query as { status?: string }).status;
    return listRequests(app, req.scope, status);
  });

  // -1 beantragen.
  app.post(
    '/api/requests/minus-one',
    { preHandler: [requireAuth, requireRole('WACHGAENGER', 'BOOTSFUEHRER', 'WACHFUEHRER')] },
    async (req, reply) => {
      const body = parseBody(minusOneSchema, req.body, reply);
      if (!body) return;
      const scope = req.scope;
      const guard = app.db.select().from(guards).where(eq(guards.id, body.guardId)).get();
      const inScope = guard && (scope.all || guard.ownerId === scope.scopeId);
      if (!guard || !inScope) return reply.code(404).send({ error: 'Wachgänger nicht gefunden' });

      const open = app.db
        .select({ id: minusOneRequests.id })
        .from(minusOneRequests)
        .where(and(eq(minusOneRequests.guardId, body.guardId), inArray(minusOneRequests.status, ['PENDING', 'APPROVED'])))
        .get();
      if (open) return reply.code(409).send({ error: 'Es gibt bereits eine offene/aktive -1-Anfrage' });

      const row = app.db
        .insert(minusOneRequests)
        .values({
          guardId: body.guardId,
          requestedBy: req.session.user!.id,
          reason: body.reason,
          note: body.note ?? null,
          status: 'PENDING'
        })
        .returning({ id: minusOneRequests.id })
        .get();
      recordAudit(req, 'request.minus-one', 'request', row.id, { guardId: body.guardId, reason: body.reason });
      app.realtime.broadcast('requests-updated');
      return reply.code(201).send({ id: row.id });
    }
  );

  // K-Fahrt (Kontrollfahrt) beantragen – Bootsführer (oder Wachführer).
  app.post(
    '/api/requests/k-fahrt',
    { preHandler: [requireAuth, requireRole('BOOTSFUEHRER', 'WACHFUEHRER')] },
    async (req, reply) => {
      const body = parseBody(kFahrtRequestSchema, req.body, reply);
      if (!body) return;
      const scope = req.scope;
      const guard = app.db.select().from(guards).where(eq(guards.id, body.guardId)).get();
      const inScope = guard && (scope.all || guard.ownerId === scope.scopeId);
      if (!guard || !inScope) return reply.code(404).send({ error: 'Wachgänger nicht gefunden' });

      const open = app.db
        .select({ id: minusOneRequests.id })
        .from(minusOneRequests)
        .where(
          and(
            eq(minusOneRequests.guardId, body.guardId),
            eq(minusOneRequests.kind, 'K_FAHRT'),
            inArray(minusOneRequests.status, ['PENDING', 'APPROVED'])
          )
        )
        .get();
      if (open) return reply.code(409).send({ error: 'Es gibt bereits eine offene/aktive K-Fahrt-Anfrage' });

      const row = app.db
        .insert(minusOneRequests)
        .values({
          guardId: body.guardId,
          requestedBy: req.session.user!.id,
          kind: 'K_FAHRT',
          reason: null,
          note: body.note ?? null,
          status: 'PENDING'
        })
        .returning({ id: minusOneRequests.id })
        .get();
      recordAudit(req, 'request.k-fahrt', 'request', row.id, { guardId: body.guardId });
      app.realtime.broadcast('requests-updated');
      return reply.code(201).send({ id: row.id });
    }
  );

  // Genehmigen – nur der Owner-Wachführer des Wachgängers.
  app.post('/api/requests/:id/approve', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const uid = req.session.user!.id;
    const found = app.db
      .select({ r: minusOneRequests, guardOwner: guards.ownerId, guardId: guards.id })
      .from(minusOneRequests)
      .leftJoin(guards, eq(minusOneRequests.guardId, guards.id))
      .where(eq(minusOneRequests.id, id))
      .get();
    if (!found || found.guardOwner !== uid) return reply.code(404).send({ error: 'Anfrage nicht gefunden' });
    if (found.r.kind === 'K_FAHRT')
      return reply.code(409).send({ error: 'Kontrollfahrten werden über „K-Fahrt setzen" aktiviert' });
    if (found.r.status !== 'PENDING') return reply.code(409).send({ error: 'Anfrage ist nicht mehr offen' });

    app.db
      .update(minusOneRequests)
      .set({ status: 'APPROVED', decidedAt: sql`CURRENT_TIMESTAMP`, decidedBy: uid })
      .where(eq(minusOneRequests.id, id))
      .run();
    app.db.update(guards).set({ status: 'MINUS_ONE', updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(guards.id, found.r.guardId)).run();
    recordAudit(req, 'request.approve', 'request', id);
    app.realtime.broadcast('requests-updated');
    app.realtime.broadcast('guards-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });

  // K-Fahrt setzen – nur der Owner-Wachführer. Bewusst NICHT über „genehmigen":
  // erst wenn der Wachführer die K-Fahrt aktiv setzt, wird der Turm um 2 WG reduziert.
  app.post('/api/requests/:id/set-k-fahrt', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const uid = req.session.user!.id;
    const found = app.db
      .select({ r: minusOneRequests, guardOwner: guards.ownerId })
      .from(minusOneRequests)
      .leftJoin(guards, eq(minusOneRequests.guardId, guards.id))
      .where(eq(minusOneRequests.id, id))
      .get();
    if (!found || found.guardOwner !== uid) return reply.code(404).send({ error: 'Anfrage nicht gefunden' });
    if (found.r.kind !== 'K_FAHRT') return reply.code(409).send({ error: 'Keine Kontrollfahrt-Anfrage' });
    if (found.r.status !== 'PENDING') return reply.code(409).send({ error: 'Anfrage ist nicht mehr offen' });

    app.db
      .update(minusOneRequests)
      .set({ status: 'APPROVED', decidedAt: sql`CURRENT_TIMESTAMP`, decidedBy: uid })
      .where(eq(minusOneRequests.id, id))
      .run();
    recordAudit(req, 'request.set-k-fahrt', 'request', id);
    app.realtime.broadcast('requests-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });

  // Ablehnen – nur der Owner-Wachführer.
  app.post('/api/requests/:id/reject', { preHandler: [requireAuth, requireWachfuehrer] }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(rejectSchema, req.body, reply);
    if (!body) return;
    const uid = req.session.user!.id;
    const found = app.db
      .select({ r: minusOneRequests, guardOwner: guards.ownerId })
      .from(minusOneRequests)
      .leftJoin(guards, eq(minusOneRequests.guardId, guards.id))
      .where(eq(minusOneRequests.id, id))
      .get();
    if (!found || found.guardOwner !== uid) return reply.code(404).send({ error: 'Anfrage nicht gefunden' });
    if (found.r.status !== 'PENDING') return reply.code(409).send({ error: 'Anfrage ist nicht mehr offen' });

    app.db
      .update(minusOneRequests)
      .set({ status: 'REJECTED', decidedAt: sql`CURRENT_TIMESTAMP`, decidedBy: uid, rejectionReason: body.rejectionReason ?? null })
      .where(eq(minusOneRequests.id, id))
      .run();
    recordAudit(req, 'request.reject', 'request', id);
    app.realtime.broadcast('requests-updated');
    return { ok: true };
  });

  // +1 / Rückkehr – Owner-Wachführer ODER jemand im selben Mandanten-Scope.
  app.post('/api/requests/:id/return', { preHandler: requireAuth }, async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const scope = req.scope;
    const found = app.db
      .select({ r: minusOneRequests, guardOwner: guards.ownerId, guardId: guards.id })
      .from(minusOneRequests)
      .leftJoin(guards, eq(minusOneRequests.guardId, guards.id))
      .where(eq(minusOneRequests.id, id))
      .get();
    const inScope = found && (scope.all || found.guardOwner === scope.scopeId);
    if (!found || !inScope) return reply.code(404).send({ error: 'Anfrage nicht gefunden' });
    if (found.r.status !== 'APPROVED')
      return reply.code(409).send({ error: 'Nur genehmigte -1 / aktive K-Fahrten können zurückgemeldet werden' });

    app.db
      .update(minusOneRequests)
      .set({ status: 'RETURNED', returnedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(minusOneRequests.id, id))
      .run();
    // Bei -1 kehrt der Wachgänger in den Bereich zurück; die K-Fahrt hat den Guard-Status nicht verändert.
    if (found.r.kind !== 'K_FAHRT') {
      app.db.update(guards).set({ status: 'IN_AREA', updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(guards.id, found.r.guardId)).run();
      app.realtime.broadcast('guards-updated');
    }
    recordAudit(req, 'request.return', 'request', id);
    app.realtime.broadcast('requests-updated');
    app.realtime.broadcast('towers-updated');
    return { ok: true };
  });
}
