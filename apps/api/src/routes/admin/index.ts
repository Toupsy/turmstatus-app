// ============================================================
// routes/admin/index.ts – Admin-Routen (NUR auf dem internen Admin-Listener).
// Gate: requireAuth + requireAdmin für ALLE Routen dieses Plugins.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../../plugins/auth.js';
import { adminUserRoutes } from './users.js';
import { adminAuditRoutes } from './audit.js';
import { adminTemplateRoutes } from './templates.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireAdmin);
  await app.register(adminUserRoutes);
  await app.register(adminAuditRoutes);
  await app.register(adminTemplateRoutes);
}
