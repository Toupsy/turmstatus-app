import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import type { AuditEntryDto } from '@turmstatus/shared';
import { auditLog, users } from '../../db/schema.js';

export async function adminAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/audit-log', async (req) => {
    const raw = Number((req.query as { limit?: string }).limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 1000) : 200;
    const rows = app.db
      .select({
        a: auditLog,
        actorName: users.fullName,
        actorUser: users.username
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .orderBy(sql`${auditLog.timestamp} DESC, ${auditLog.id} DESC`)
      .limit(limit)
      .all();

    return rows.map((row): AuditEntryDto => ({
      id: row.a.id,
      userId: row.a.userId,
      actorName: row.actorName ?? row.actorUser,
      action: row.a.action,
      entityType: row.a.entityType,
      entityId: row.a.entityId,
      details: row.a.details ? safeJson(row.a.details) : null,
      ipAddress: row.a.ipAddress,
      timestamp: row.a.timestamp
    }));
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
