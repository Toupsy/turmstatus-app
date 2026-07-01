// ============================================================
// server.ts – Bootstrap: DB initialisieren, Public- (+ Admin-)Listener starten.
// ============================================================

import { loadEnv } from './env.js';
import { createDb, runMigrations } from './db/index.js';
import { seedAdmin } from './db/seed.js';
import { createRealtime } from './realtime.js';
import { SqliteSessionStore } from './auth/session-store.js';
import { buildApp, type AppDeps } from './app.js';
import { buildAdminApp } from './admin-app.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const { db, sqlite, close } = createDb(env.databasePath);
  runMigrations(db);
  await seedAdmin(db, env);

  const realtime = createRealtime();
  const sessionStore = new SqliteSessionStore(sqlite);
  const deps: AppDeps = { db, sqlite, env, realtime, sessionStore };

  const publicApp = await buildApp('public', deps);
  const adminApp = await buildAdminApp(deps);

  await publicApp.listen({ host: env.host, port: env.port });
  await adminApp.listen({ host: env.adminBind, port: env.adminPort });

  publicApp.log.info(
    `Turmstatus läuft – Public http://${env.host}:${env.port} · Admin http://${env.adminBind}:${env.adminPort} (nur intern)`
  );

  const shutdown = async (signal: string): Promise<void> => {
    publicApp.log.info(`${signal} empfangen – fahre herunter …`);
    await Promise.allSettled([publicApp.close(), adminApp.close()]);
    close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fataler Startfehler:', err);
  process.exit(1);
});
