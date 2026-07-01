// ============================================================
// demo.ts – Browser-Glue für den Demo-Modus (Cloudflare-Preview ohne Backend).
// Die Demo-DB liegt in localStorage (von Web- UND Admin-SPA geteilt), die
// aktive Rolle pro Tab in sessionStorage → zwei Tabs können verschiedene
// Rollen zeigen und sehen sich gegenseitig live (storage-Events statt WS).
// ============================================================

import type { Role, WsEventType, CurrentUser } from '@turmstatus/shared';
import {
  seedDemoDb,
  handleDemoRequest,
  toCurrentUser,
  DEMO_DB_VERSION,
  DEMO_ROLE_USER_IDS,
  type DemoDb
} from '@turmstatus/shared/demo';

export const DEMO_DB_KEY = 'turmstatus-demo-db';
const ROLE_KEY = 'turmstatus-demo-role';
export const DEMO_PING_KEY = 'turmstatus-demo-ping';

/** Demo aktiv auf *.workers.dev (Cloudflare-Preview) oder mit ?demo in der URL. */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('demo')) return true;
  return window.location.hostname.endsWith('.workers.dev');
}

export function loadDemoDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      if (db.version === DEMO_DB_VERSION) return db;
    }
  } catch {
    /* defekt → neu seeden */
  }
  const db = seedDemoDb();
  saveDemoDb(db);
  return db;
}

export function saveDemoDb(db: DemoDb): void {
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
}

export function currentDemoRole(): Role {
  const raw = sessionStorage.getItem(ROLE_KEY) as Role | null;
  return raw && raw in DEMO_ROLE_USER_IDS ? raw : 'WACHFUEHRER';
}

/** Andere Tabs (und der eigene) über Demo-Mutationen informieren. */
export function broadcastDemoEvents(events: WsEventType[]): void {
  if (events.length === 0) return;
  window.dispatchEvent(new CustomEvent<WsEventType[]>('turmstatus-demo-events', { detail: events }));
  // storage-Events feuern nur in ANDEREN Tabs → simuliert den WS-Broadcast.
  localStorage.setItem(DEMO_PING_KEY, JSON.stringify({ events, t: Date.now() }));
}

/** Auf Demo-Events (eigener + fremde Tabs) hören; liefert eine Unsubscribe-Funktion. */
export function subscribeDemoEvents(cb: (events: WsEventType[]) => void): () => void {
  const onLocal = (ev: Event) => cb((ev as CustomEvent<WsEventType[]>).detail);
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== DEMO_PING_KEY || !ev.newValue) return;
    try {
      cb((JSON.parse(ev.newValue) as { events: WsEventType[] }).events);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('turmstatus-demo-events', onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('turmstatus-demo-events', onLocal);
    window.removeEventListener('storage', onStorage);
  };
}

/** Simulierter fetch: API-Aufruf gegen die Demo-DB statt Netzwerk. */
export async function demoFetch(method: string, url: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const db = loadDemoDb();
  const userId = DEMO_ROLE_USER_IDS[currentDemoRole()];
  const result = handleDemoRequest(db, userId, method, url, body);
  if (result.changed) saveDemoDb(db);
  broadcastDemoEvents(result.events);
  return { status: result.status, data: result.body };
}

/** Rolle dieses Tabs wechseln; liefert den neuen Demo-Benutzer. */
export function switchDemoRole(role: Role): CurrentUser {
  sessionStorage.setItem(ROLE_KEY, role);
  const db = loadDemoDb();
  const user = db.users.find((u) => u.id === DEMO_ROLE_USER_IDS[role] && u.isActive);
  if (!user) {
    // Demo-Benutzer wurde (z.B. im Admin-Panel) gelöscht/deaktiviert → Datensatz neu seeden.
    return switchDemoRoleAfterReset(role);
  }
  return toCurrentUser(user);
}

function switchDemoRoleAfterReset(role: Role): CurrentUser {
  const db = seedDemoDb();
  saveDemoDb(db);
  broadcastDemoEvents(['towers-updated', 'guards-updated', 'boats-updated', 'requests-updated', 'users-updated']);
  return toCurrentUser(db.users.find((u) => u.id === DEMO_ROLE_USER_IDS[role])!);
}

/** Demo-Datensatz auf den Seed zurücksetzen (alle Tabs refreshen). */
export function resetDemo(): CurrentUser {
  return switchDemoRoleAfterReset(currentDemoRole());
}
