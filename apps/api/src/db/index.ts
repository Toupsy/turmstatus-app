// ============================================================
// db/index.ts – better-sqlite3-Verbindung (WAL) + Drizzle + Migrations.
// EIN Prozess öffnet die DB → WAL ist sicher und schnell (kein Multiprozess-Ballast).
// ============================================================

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { migrationsFolder } from '../paths.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  sqlite: Database.Database;
  close(): void;
}

export function createDb(databasePath: string): DbHandle {
  const inMemory = databasePath === ':memory:';
  if (!inMemory) mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  if (!inMemory) {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('busy_timeout = 5000');
  }

  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    close: () => sqlite.close()
  };
}

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}

export { schema };
