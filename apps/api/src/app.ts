// ============================================================
// app.ts – gemeinsames Fastify-Setup + buildApp() für den PUBLIC-Listener.
// Public- und Admin-Instanz teilen DB, Session-Store und Realtime-Hub,
// unterscheiden sich aber in den registrierten Routen (harte Admin-Grenze).
// ============================================================

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyWebsocket from '@fastify/websocket';
import type Database from 'better-sqlite3';
import type { Db } from './db/index.js';
import type { Env } from './env.js';
import type { Realtime } from './realtime.js';
import { SqliteSessionStore } from './auth/session-store.js';
import { authRoutes } from './routes/auth.js';
import { configRoutes } from './routes/config.js';
import { domainRoutes } from './routes/index.js';

export interface AppDeps {
  db: Db;
  sqlite: Database.Database;
  env: Env;
  realtime: Realtime;
  sessionStore: SqliteSessionStore;
}

export type AppVariant = 'public' | 'admin';

/** Gemeinsames Fundament: Instanz, Decorators, Cookie/Session/WS, Health, Config, Auth, Live-WS. */
export async function createBaseApp(variant: AppVariant, deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;
  const app = Fastify({
    trustProxy: env.trustProxy,
    logger: env.isTest ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    disableRequestLogging: env.isTest
  });

  app.decorate('db', deps.db);
  app.decorate('env', env);
  app.decorate('realtime', deps.realtime);
  app.decorate('sessionStore', deps.sessionStore);
  app.decorate('isAdminApp', variant === 'admin');

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: env.sessionSecret,
    store: deps.sessionStore,
    cookieName: variant === 'admin' ? 'turmstatus.admin.sid' : 'turmstatus.sid',
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000
    }
  });
  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({ status: 'ok', ts: Date.now(), variant }));
  await app.register(configRoutes);
  await app.register(authRoutes);

  app.get('/api/ws', { websocket: true }, (socket, req) => {
    if (!req.session?.user) {
      socket.close(4401, 'unauthorized');
      return;
    }
    deps.realtime.add(socket);
  });

  return app;
}

/** PUBLIC-Instanz: Basis + operative Domänen-Routen (KEINE Admin-Routen). */
export async function buildApp(_variant: AppVariant, deps: AppDeps): Promise<FastifyInstance> {
  const app = await createBaseApp('public', deps);
  await app.register(domainRoutes);
  return app;
}
