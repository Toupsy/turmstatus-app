import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { DashboardSummary } from '@turmstatus/shared';
import { towers, guards, boats, minusOneRequests } from '../db/schema.js';
import { requireAuth } from '../plugins/auth.js';
import { scopeWhere } from '../lib/scope.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard/summary', { preHandler: requireAuth }, async (req): Promise<DashboardSummary> => {
    const scope = req.scope;
    const towerRows = app.db.select({ id: towers.id }).from(towers).where(scopeWhere(scope, towers.ownerId)).all();
    const guardRows = app.db.select({ status: guards.status }).from(guards).where(scopeWhere(scope, guards.ownerId)).all();
    const boatRows = app.db.select({ status: boats.status }).from(boats).where(scopeWhere(scope, boats.ownerId)).all();

    // Offene -1-Anfragen im Scope (über Guard-Owner).
    const openReqs = app.db
      .select({ id: minusOneRequests.id })
      .from(minusOneRequests)
      .leftJoin(guards, eq(minusOneRequests.guardId, guards.id))
      .where(
        scope.all
          ? eq(minusOneRequests.status, 'PENDING')
          : and(eq(minusOneRequests.status, 'PENDING'), eq(guards.ownerId, scope.scopeId))
      )
      .all();

    return {
      towers: towerRows.length,
      guardsOnDuty: guardRows.filter((g) => g.status === 'IN_AREA').length,
      guardsMinusOne: guardRows.filter((g) => g.status === 'MINUS_ONE').length,
      guardsDeployed: guardRows.filter((g) => g.status === 'DEPLOYED').length,
      boats: boatRows.length,
      boatsAway: boatRows.filter((b) => b.status === 'PATROL' || b.status === 'DEPLOYED').length,
      openRequests: openReqs.length
    };
  });
}
