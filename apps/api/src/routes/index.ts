// ============================================================
// routes/index.ts – Sammel-Plugin der operativen Domänen-Routen (PUBLIC).
// ============================================================

import type { FastifyInstance } from 'fastify';
import { towerRoutes } from './towers.js';
import { guardRoutes } from './guards.js';
import { boatRoutes } from './boats.js';
import { requestRoutes } from './requests.js';
import { dashboardRoutes } from './dashboard.js';
import { teamRoutes } from './team.js';

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  await app.register(towerRoutes);
  await app.register(guardRoutes);
  await app.register(boatRoutes);
  await app.register(requestRoutes);
  await app.register(dashboardRoutes);
  await app.register(teamRoutes);
}
