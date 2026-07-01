// ============================================================
// demo.ts – Demo-Modus-Glue der Admin-SPA (Cloudflare-Preview).
// Teilt die Demo-DB in localStorage mit der Web-SPA (gleicher Origin);
// die Session ist hier fest der App-Admin (Hauptwache). Mutationen werden
// per storage-Event an offene Web-SPA-Tabs gemeldet (simulierter WS).
// ============================================================

import type { WsEventType } from '@turmstatus/shared';
import {
  seedDemoDb,
  handleDemoRequest,
  DEMO_DB_VERSION,
  DEMO_ROLE_USER_IDS,
  type DemoDb
} from '@turmstatus/shared/demo';

const DB_KEY = 'turmstatus-demo-db';
const PING_KEY = 'turmstatus-demo-ping';

/** Demo aktiv auf *.workers.dev (Cloudflare-Preview) oder mit ?demo in der URL. */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('demo')) return true;
  return window.location.hostname.endsWith('.workers.dev');
}

function loadDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      if (db.version === DEMO_DB_VERSION) return db;
    }
  } catch {
    /* defekt → neu seeden */
  }
  const db = seedDemoDb();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
}

/** Simulierter fetch gegen die Demo-DB – immer als App-Admin (Hauptwache). */
export async function demoFetch(method: string, url: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const db = loadDb();
  const result = handleDemoRequest(db, DEMO_ROLE_USER_IDS.HAUPTWACHE, method, url, body);
  if (result.changed) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    broadcast(result.events);
  }
  return { status: result.status, data: result.body };
}

function broadcast(events: WsEventType[]): void {
  if (events.length === 0) return;
  localStorage.setItem(PING_KEY, JSON.stringify({ events, t: Date.now() }));
}
