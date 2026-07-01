// ============================================================
// audit.ts – Fire-and-forget-Protokollierung jeder Mutation ins audit_log.
// ============================================================

import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/index.js';
import { auditLog } from '../db/schema.js';

export function recordAudit(
  req: FastifyRequest,
  action: string,
  entityType: string | null = null,
  entityId: number | null = null,
  details?: unknown
): void {
  try {
    req.server.db
      .insert(auditLog)
      .values({
        userId: req.session.user?.id ?? null,
        action,
        entityType,
        entityId,
        details: details === undefined ? null : JSON.stringify(details),
        ipAddress: req.ip ?? null
      })
      .run();
  } catch (err) {
    req.log.warn({ err }, 'audit-log fehlgeschlagen');
  }
}

/** Variante ohne Request (Seed / Systemaktionen). */
export function recordSystemAudit(
  db: Db,
  action: string,
  entityType: string | null = null,
  entityId: number | null = null,
  details?: unknown
): void {
  try {
    db.insert(auditLog)
      .values({
        userId: null,
        action,
        entityType,
        entityId,
        details: details === undefined ? null : JSON.stringify(details),
        ipAddress: null
      })
      .run();
  } catch {
    /* ignore */
  }
}
