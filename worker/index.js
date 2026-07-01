// ============================================================
// Cloudflare Worker – Preview-/Demo-Modus für Turmstatus.
//
// Warum: Die echte App (Fastify + better-sqlite3) läuft NICHT auf der
// Workers-Runtime (natives SQLite-Modul). Dieser Worker liefert deshalb nur
// die gebaute Web-SPA (statische Assets aus apps/web/dist) aus und beantwortet
// alle `/api/*`-GETs aus einem statischen In-Memory-Demodatensatz – ganz ohne
// Login, ohne DB, flüchtig. Schreibende Requests werden bewusst abgewiesen.
//
// Routing: `wrangler.jsonc` setzt `assets.run_worker_first: ["/api/*"]`, d.h.
// nur `/api/*` erreicht diesen Worker; alles andere liefert das Assets-System
// direkt (mit SPA-Fallback auf index.html).
// ============================================================

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

// Spiegelt packages/shared/src/config.ts (AppConfig). Bei Änderungen dort
// bitte hier nachziehen – der Worker ist bewusst dependency-frei.
const APP_CONFIG = {
  roles: ['HAUPTWACHE', 'WACHFUEHRER', 'WACHGAENGER', 'BOOTSFUEHRER'],
  roleLabels: {
    HAUPTWACHE: 'Hauptwache',
    WACHFUEHRER: 'Wachführer',
    WACHGAENGER: 'Wachgänger',
    BOOTSFUEHRER: 'Bootsführer'
  },
  requestStatus: { PENDING: 'Offen', APPROVED: 'Genehmigt', REJECTED: 'Abgelehnt', RETURNED: 'Zurück (+1)' },
  guardStatus: {
    IN_AREA: 'Im Bereich',
    MINUS_ONE: '-1 (Bereich verlassen)',
    DEPLOYED: 'Im Einsatz',
    BREAK: 'Pause'
  },
  boatStatus: { AT_TOWER: 'Am Turm', PATROL: 'Streife', DEPLOYED: 'Im Einsatz', OUT_OF_SERVICE: 'Außer Dienst' },
  towerStatus: { GREEN: 'Besetzt', YELLOW: 'Reduziert', RED: 'Kritisch' },
  reasons: { PAUSE: 'Pause', TOILET: 'Toilette', CATERING: 'Verpflegung', MATERIAL: 'Material', OTHER: 'Sonstiges' },
  requestKind: { MINUS_ONE: '-1', K_FAHRT: 'Kontrollfahrt' },
  map: {
    center: [54.21449, 11.08967],
    zoom: 15,
    minZoom: 7,
    bounds: [
      [53.3, 7.2],
      [55.2, 11.4]
    ],
    seaBearing: 90,
    patrolOffsetMeters: 150
  }
};

// Demo-Wachführer (Mandant): kein Login nötig, GET /api/auth/me liefert ihn.
const DEMO_USER = {
  userId: 1,
  username: 'demo',
  fullName: 'Demo-Wachführer',
  role: 'WACHFUEHRER',
  towerId: null,
  ownerId: 1,
  isAdmin: false
};

const OWNER = 1;
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

// --- Türme (Farbe/Boots-Lage/K-Fahrt zeigen die Statuslogik) ---
const TOWERS = [
  {
    id: 1,
    name: 'Hauptwache Dahme',
    callSign: 'KDO',
    latitude: 54.2145,
    longitude: 11.0905,
    requiredStaff: 2,
    effectiveRequiredStaff: 3, // Boot am Turm → +1
    presentStaff: 1,
    guardStaff: 2,
    currentStaff: 3,
    status: 'GREEN',
    ownerId: OWNER,
    hasBoat: true,
    boatsAtTower: 1,
    boatsAway: 0,
    boatsBroken: 0,
    boatWarning: false,
    activeKFahrten: 0,
    kFahrtReduction: 0
  },
  {
    id: 2,
    name: 'Turm Nordstrand',
    callSign: 'NORD 1',
    latitude: 54.223,
    longitude: 11.096,
    requiredStaff: 2,
    effectiveRequiredStaff: 1, // Boot auf Streife → -1
    presentStaff: 0,
    guardStaff: 1,
    currentStaff: 1,
    status: 'GREEN',
    ownerId: OWNER,
    hasBoat: true,
    boatsAtTower: 0,
    boatsAway: 1,
    boatsBroken: 0,
    boatWarning: true, // Boot unterwegs → Warnung
    activeKFahrten: 0,
    kFahrtReduction: 0
  },
  {
    id: 3,
    name: 'Turm Südstrand',
    callSign: 'SÜD 1',
    latitude: 54.205,
    longitude: 11.085,
    requiredStaff: 2,
    effectiveRequiredStaff: 2,
    presentStaff: 1,
    guardStaff: 1,
    currentStaff: 0, // 1 WG + 1 anwesend − 2 (aktive K-Fahrt) = 0
    status: 'RED',
    ownerId: OWNER,
    hasBoat: false,
    boatsAtTower: 0,
    boatsAway: 0,
    boatsBroken: 0,
    boatWarning: false,
    activeKFahrten: 1,
    kFahrtReduction: 2
  },
  {
    id: 4,
    name: 'Turm Binnensee',
    callSign: 'BIN 1',
    latitude: 54.218,
    longitude: 11.079,
    requiredStaff: 2,
    effectiveRequiredStaff: 2,
    presentStaff: 1,
    guardStaff: 1,
    currentStaff: 2,
    status: 'GREEN',
    ownerId: OWNER,
    hasBoat: false,
    boatsAtTower: 0,
    boatsAway: 0,
    boatsBroken: 0,
    boatWarning: false,
    activeKFahrten: 0,
    kFahrtReduction: 0
  }
];

const towerName = (id) => TOWERS.find((t) => t.id === id)?.name ?? null;

// --- Wachgänger ---
const GUARDS = [
  { id: 1, name: 'Lena Möller', userId: 11, towerId: 1, status: 'IN_AREA', latitude: 54.2146, longitude: 11.0907 },
  { id: 2, name: 'Tom Krause', userId: 12, towerId: 1, status: 'IN_AREA', latitude: 54.2143, longitude: 11.0902 },
  { id: 3, name: 'Nina Brandt', userId: 13, towerId: 2, status: 'IN_AREA', latitude: 54.2231, longitude: 11.0962 },
  { id: 4, name: 'Paul Reimers', userId: 14, towerId: 2, status: 'MINUS_ONE', latitude: 54.2227, longitude: 11.0955 },
  { id: 5, name: 'Jonas Winter', userId: 15, towerId: 3, status: 'IN_AREA', latitude: 54.2051, longitude: 11.0852 },
  { id: 6, name: 'Mia Schulz', userId: 16, towerId: 3, status: 'DEPLOYED', latitude: 54.2039, longitude: 11.0921 },
  { id: 7, name: 'Ben Faber', userId: 17, towerId: 4, status: 'IN_AREA', latitude: 54.2181, longitude: 11.0792 }
].map((g) => ({
  ...g,
  towerName: towerName(g.towerId),
  ownerId: OWNER,
  updatedAt: iso(6)
}));

// --- Boote ---
const BOATS = [
  {
    id: 1,
    name: 'Adele',
    callSign: 'RB DAHME 1',
    towerId: 1,
    status: 'AT_TOWER',
    latitude: 54.2148,
    longitude: 11.0912
  },
  {
    id: 2,
    name: 'Seehund',
    callSign: 'RB NORD 1',
    towerId: 2,
    status: 'PATROL',
    latitude: 54.2236,
    longitude: 11.101
  }
].map((b) => ({ ...b, towerName: towerName(b.towerId), ownerId: OWNER, updatedAt: iso(4) }));

// --- Anfragen (-1 und K-Fahrt, verschiedene Status) ---
const REQUESTS = [
  {
    id: 1,
    guardId: 4,
    guardName: 'Paul Reimers',
    towerId: 2,
    towerName: 'Turm Nordstrand',
    requestedBy: 14,
    requestedByName: 'Paul Reimers',
    kind: 'MINUS_ONE',
    reason: 'PAUSE',
    note: 'Kurze Pause, 15 Min.',
    status: 'APPROVED',
    rejectionReason: null,
    createdAt: iso(25),
    decidedAt: iso(23),
    decidedBy: 1,
    returnedAt: null,
    ownerId: OWNER
  },
  {
    id: 2,
    guardId: 3,
    guardName: 'Nina Brandt',
    towerId: 2,
    towerName: 'Turm Nordstrand',
    requestedBy: 13,
    requestedByName: 'Nina Brandt',
    kind: 'MINUS_ONE',
    reason: 'TOILET',
    note: null,
    status: 'PENDING',
    rejectionReason: null,
    createdAt: iso(4),
    decidedAt: null,
    decidedBy: null,
    returnedAt: null,
    ownerId: OWNER
  },
  {
    id: 3,
    guardId: 5,
    guardName: 'Jonas Winter',
    towerId: 3,
    towerName: 'Turm Südstrand',
    requestedBy: 15,
    requestedByName: 'Jonas Winter',
    kind: 'K_FAHRT',
    reason: null,
    note: 'Kontrollfahrt Südstrand',
    status: 'APPROVED', // aktiv → reduziert Turm Südstrand um 2
    rejectionReason: null,
    createdAt: iso(30),
    decidedAt: iso(28),
    decidedBy: 1,
    returnedAt: null,
    ownerId: OWNER
  },
  {
    id: 4,
    guardId: 7,
    guardName: 'Ben Faber',
    towerId: 4,
    towerName: 'Turm Binnensee',
    requestedBy: 17,
    requestedByName: 'Ben Faber',
    kind: 'K_FAHRT',
    reason: null,
    note: 'Bitte Kontrollfahrt Binnensee',
    status: 'PENDING',
    rejectionReason: null,
    createdAt: iso(2),
    decidedAt: null,
    decidedBy: null,
    returnedAt: null,
    ownerId: OWNER
  }
];

// --- Personal (Team) ---
const TEAM = [
  { id: 11, username: 'lena', fullName: 'Lena Möller', role: 'WACHGAENGER', towerId: 1 },
  { id: 12, username: 'tom', fullName: 'Tom Krause', role: 'WACHGAENGER', towerId: 1 },
  { id: 13, username: 'nina', fullName: 'Nina Brandt', role: 'WACHGAENGER', towerId: 2 },
  { id: 15, username: 'jonas', fullName: 'Jonas Winter', role: 'BOOTSFUEHRER', towerId: 3 },
  { id: 17, username: 'ben', fullName: 'Ben Faber', role: 'BOOTSFUEHRER', towerId: 4 }
].map((u) => ({
  ...u,
  ownerId: OWNER,
  isAdmin: false,
  isActive: true,
  lastLogin: iso(60),
  createdAt: iso(60 * 24 * 30)
}));

const SUMMARY = {
  towers: TOWERS.length,
  guardsOnDuty: GUARDS.filter((g) => g.status === 'IN_AREA').length,
  guardsMinusOne: GUARDS.filter((g) => g.status === 'MINUS_ONE').length,
  guardsDeployed: GUARDS.filter((g) => g.status === 'DEPLOYED').length,
  boats: BOATS.length,
  boatsAway: BOATS.filter((b) => b.status === 'PATROL' || b.status === 'DEPLOYED').length,
  openRequests: REQUESTS.filter((r) => r.status === 'PENDING').length
};

// GET-Routen des Demo-Modus.
const ROUTES = {
  '/api/config': () => APP_CONFIG,
  '/api/auth/me': () => ({ user: DEMO_USER }),
  '/api/auth/needs-setup': () => ({ needsSetup: false }),
  '/api/auth/registration-status': () => ({ enabled: false, requiresCode: false }),
  '/api/towers': () => TOWERS,
  '/api/guards': () => GUARDS,
  '/api/boats': () => BOATS,
  '/api/requests': () => REQUESTS,
  '/api/dashboard/summary': () => SUMMARY,
  '/api/team/members': () => TEAM
};

// WebSocket am Leben halten (Daten sind statisch → keine Broadcasts). Verhindert
// den 3-Sekunden-Reconnect-Sturm des Clients. Der 30-s-Polling-Fallback bleibt.
function handleWebSocket() {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({ type: 'connected' }));
  return new Response(null, { status: 101, webSocket: client });
}

function handleApi(url, request) {
  const { pathname } = url;

  if (pathname === '/api/ws') {
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return handleWebSocket();
    return json({ error: 'WebSocket erwartet' }, 426);
  }

  if (request.method === 'GET') {
    const handler = ROUTES[pathname];
    if (handler) return json(handler());
    return json({ error: 'Nicht gefunden (Demo-Modus)' }, 404);
  }

  // Alle mutierenden Requests im Demo-Modus abweisen.
  return json({ error: 'Demo-Modus: Änderungen sind hier deaktiviert.' }, 403);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(url, request);
    // Fällt nur bei Fehlkonfiguration hierher (run_worker_first deckt nur /api/*).
    return env.ASSETS.fetch(request);
  }
};
