// Test-Hilfen: baut echte Fastify-Instanzen mit In-Memory-SQLite und einem Cookie-Jar-Client.
import type { FastifyInstance } from 'fastify';
import { createDb, runMigrations } from '../src/db/index.js';
import { seedAdmin } from '../src/db/seed.js';
import { createRealtime } from '../src/realtime.js';
import { SqliteSessionStore } from '../src/auth/session-store.js';
import { buildApp, type AppDeps } from '../src/app.js';
import { buildAdminApp } from '../src/admin-app.js';
import { loadEnv } from '../src/env.js';

export interface TestAppOptions {
  adminUsername?: string;
  adminPassword?: string | null;
  registrationMode?: 'disabled' | 'open' | 'code';
  registrationCode?: string;
}

export interface TestApp {
  publicApp: FastifyInstance;
  adminApp: FastifyInstance;
  deps: AppDeps;
  close(): Promise<void>;
}

export async function makeTestApp(opts: TestAppOptions = {}): Promise<TestApp> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.ADMIN_USERNAME = opts.adminUsername ?? 'hauptwache';
  if (opts.adminPassword === null) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = opts.adminPassword ?? 'admin-secret-123';
  process.env.REGISTRATION_MODE = opts.registrationMode ?? 'disabled';
  if (opts.registrationCode) process.env.REGISTRATION_CODE = opts.registrationCode;

  const env = loadEnv();
  const { db, sqlite, close } = createDb(':memory:');
  runMigrations(db);
  await seedAdmin(db, env);

  const realtime = createRealtime();
  const sessionStore = new SqliteSessionStore(sqlite);
  const deps: AppDeps = { db, sqlite, env, realtime, sessionStore };
  const publicApp = await buildApp('public', deps);
  const adminApp = await buildAdminApp(deps);
  await publicApp.ready();
  await adminApp.ready();

  return {
    publicApp,
    adminApp,
    deps,
    close: async () => {
      await publicApp.close();
      await adminApp.close();
      close();
    }
  };
}

/** Minimaler HTTP-Client über app.inject() mit Cookie-Persistenz (eine Session). */
export function client(app: FastifyInstance) {
  let cookie = '';
  async function req(method: string, url: string, payload?: unknown) {
    const res = await app.inject({
      method: method as 'GET',
      url,
      payload: payload as object | undefined,
      headers: cookie ? { cookie } : {}
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
      cookie = arr.map((c) => c.split(';')[0]).join('; ');
    }
    return res;
  }
  return {
    get: (url: string) => req('GET', url),
    post: (url: string, payload?: unknown) => req('POST', url, payload),
    patch: (url: string, payload?: unknown) => req('PATCH', url, payload),
    del: (url: string) => req('DELETE', url),
    get cookie() {
      return cookie;
    }
  };
}
