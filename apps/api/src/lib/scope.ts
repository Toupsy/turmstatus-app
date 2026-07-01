// ============================================================
// scope.ts – Mandanten-Filter für Drizzle-Queries.
// ============================================================

import { and, eq, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { ViewScope } from '../types/fastify.js';

/**
 * Kombiniert den Owner-Filter (sofern nicht Admin/all) mit optionalen Zusatzbedingungen.
 * Admin (scope.all) → nur die Zusatzbedingungen; sonst zusätzlich ownerCol = scopeId.
 */
export function scopeWhere(scope: ViewScope, ownerCol: SQLiteColumn, ...extra: (SQL | undefined)[]): SQL | undefined {
  const parts = extra.filter((x): x is SQL => x !== undefined);
  if (!scope.all) parts.unshift(eq(ownerCol, scope.scopeId));
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}
