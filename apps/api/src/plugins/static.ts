// ============================================================
// plugins/static.ts – Ausliefern einer gebauten Vite-SPA + SPA-Fallback.
// API-/Health-Pfade bleiben JSON-404; alle anderen GET → index.html.
// ============================================================

import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export async function registerSpa(app: FastifyInstance, dir: string | null): Promise<void> {
  if (!dir || !existsSync(dir)) {
    app.log.warn(`SPA-Verzeichnis nicht gefunden (${dir ?? 'null'}) – im Dev-Modus liefert Vite die App aus.`);
    return;
  }
  await app.register(fastifyStatic, { root: dir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api') || req.url.startsWith('/health')) {
      return reply.code(404).send({ error: 'Nicht gefunden' });
    }
    return reply.sendFile('index.html');
  });
}
