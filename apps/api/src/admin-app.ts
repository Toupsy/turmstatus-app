// ============================================================
// admin-app.ts – ADMIN-Listener (nur interner Port). Harte Grenze:
// /api/admin/* wird AUSSCHLIESSLICH hier registriert → auf dem Public-Port 404.
// Der Admin bekommt zusätzlich die (read-only nutzbaren) Domänen-GETs, um den
// Scope einer Wache einsehen zu können; Schreibrechte bleiben durch
// requireWachfuehrer verwehrt.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { createBaseApp, type AppDeps } from './app.js';
import { domainRoutes } from './routes/index.js';
import { adminRoutes } from './routes/admin/index.js';

export async function buildAdminApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = await createBaseApp('admin', deps);
  await app.register(domainRoutes);
  await app.register(adminRoutes);
  return app;
}
