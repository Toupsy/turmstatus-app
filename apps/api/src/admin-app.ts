// ============================================================
// admin-app.ts – ADMIN-Listener (nur interner Port). Harte Grenze:
// /api/admin/* wird AUSSCHLIESSLICH hier registriert → auf dem Public-Port 404.
// Admin-Routen selbst folgen in Phase 4.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { createBaseApp, type AppDeps } from './app.js';

export async function buildAdminApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = await createBaseApp('admin', deps);
  // Phase 4: await app.register(adminRoutes);
  return app;
}
