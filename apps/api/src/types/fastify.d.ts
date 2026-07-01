import type { Db } from '../db/index.js';
import type { Env } from '../env.js';
import type { Realtime } from '../realtime.js';
import type { SqliteSessionStore } from '../auth/session-store.js';
import type { Role } from '@turmstatus/shared';

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  isAdmin: boolean;
  ownerId: number | null;
  towerId: number | null;
}

/** Sichtbarkeits-Scope eines Benutzers (Mandanten-Isolation). */
export interface ViewScope {
  all: boolean; // Admin sieht alles
  scopeId: number; // Owner-ID, nach der gefiltert wird (-1 = nichts)
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    env: Env;
    realtime: Realtime;
    sessionStore: SqliteSessionStore;
    isAdminApp: boolean;
  }
  interface FastifyRequest {
    scope: ViewScope;
  }
}

declare module '@fastify/session' {
  interface FastifySessionObject {
    user?: SessionUser;
  }
}

export {};
