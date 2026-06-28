// ============================================================
// preview.js – Demo-/Preview-Modus ohne Login & ohne Backend
//
// In Cloudflare-Workers-Preview-Deployments (kein Origin-Server) liefert der
// Worker für /api/* einen 503. Damit die App trotzdem läuft, ersetzt dieses
// Modul die gesamte API durch einen kleinen In-Memory-Mock mit Demo-Daten:
//   - api.js  → previewRequest() statt fetch()  (siehe _req)
//   - auth.js → /api/auth/me liefert einen Demo-Wachführer → kein Login
//   - ws.js   → WebSocket deaktiviert; Mutationen lösen _handleEvent() direkt aus
//
// Schwester-Projekt: Wachplan-Generator nutzt denselben WORKER_ENVIRONMENT-Schalter
// (dort localStorage-Offline-Modus; hier In-Memory-Demo, da Backend-getrieben).
// ============================================================

// Preview erkennen: vom Worker injiziertes Flag ODER *.workers.dev-Host.
const PREVIEW_MODE = (
  (typeof window !== 'undefined' && window.WORKER_ENVIRONMENT === 'preview') ||
  (typeof location !== 'undefined' && location.host.includes('.workers.dev'))
);

// ── Demo-Konfiguration (Spiegel von server/config.json) ──────
const _PREVIEW_CONFIG = {
  roles: ['HAUPTWACHE', 'WACHFUEHRER', 'WACHGAENGER', 'BOOTSFUEHRER'],
  roleLabels: { HAUPTWACHE: 'Hauptwache', WACHFUEHRER: 'Wachführer', WACHGAENGER: 'Wachgänger', BOOTSFUEHRER: 'Bootsführer' },
  requestStatus: { PENDING: 'Offen', APPROVED: 'Genehmigt', REJECTED: 'Abgelehnt', RETURNED: 'Zurück (+1)' },
  guardStatus: { IN_AREA: 'Im Bereich', MINUS_ONE: '-1 (Bereich verlassen)', DEPLOYED: 'Im Einsatz', BREAK: 'Pause' },
  boatStatus: { AT_TOWER: 'Am Turm', PATROL: 'Streife', DEPLOYED: 'Im Einsatz', OUT_OF_SERVICE: 'Außer Dienst' },
  towerStatus: { GREEN: 'Besetzt', YELLOW: 'Reduziert', RED: 'Kritisch' },
  reasons: { PAUSE: 'Pause', TOILET: 'Toilette', CATERING: 'Verpflegung', MATERIAL: 'Material', OTHER: 'Sonstiges' },
  map: { center: [54.21449, 11.08967], zoom: 15, minZoom: 7, bounds: [[53.3, 7.2], [55.2, 11.4]] }
};

// Demo-Nutzer: Wachführer (volle operative Sicht ohne Admin-Rechte).
const _PREVIEW_USER = { userId: 1, username: 'demo', fullName: 'Demo Wachführer', role: 'WACHFUEHRER', towerId: null, isAdmin: false };
const _OWNER = _PREVIEW_USER.userId;

// ── In-Memory-„Datenbank" ────────────────────────────────────
let _seq = 100;
const _nextId = () => ++_seq;
const _nowIso = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60000).toISOString();

// Demo-Türme rund um das Map-Zentrum (Ostsee, Großenbrode/Heiligenhafen).
const _db = {
  towers: [
    { id: 1, name: 'Turm Nord',    callSign: 'Turm 1', latitude: 54.2185, longitude: 11.0850, requiredStaff: 2, owner_id: _OWNER },
    { id: 2, name: 'Turm Mitte',   callSign: 'Turm 2', latitude: 54.2145, longitude: 11.0897, requiredStaff: 2, owner_id: _OWNER },
    { id: 3, name: 'Turm Süd',     callSign: 'Turm 3', latitude: 54.2098, longitude: 11.0935, requiredStaff: 3, owner_id: _OWNER },
    { id: 4, name: 'Turm Hafen',   callSign: 'Turm 4', latitude: 54.2060, longitude: 11.0980, requiredStaff: 2, owner_id: _OWNER },
  ],
  guards: [
    { id: 11, name: 'Anna Berg',     towerId: 1, status: 'IN_AREA',   latitude: 54.2188, longitude: 11.0852, userId: 11, owner_id: _OWNER },
    { id: 12, name: 'Ben Cordes',    towerId: 1, status: 'IN_AREA',   latitude: 54.2183, longitude: 11.0848, userId: 12, owner_id: _OWNER },
    { id: 13, name: 'Clara Dehn',    towerId: 2, status: 'IN_AREA',   latitude: 54.2147, longitude: 11.0899, userId: 13, owner_id: _OWNER },
    { id: 14, name: 'David Ernst',   towerId: 2, status: 'MINUS_ONE', latitude: 54.2150, longitude: 11.0905, userId: 14, owner_id: _OWNER },
    { id: 15, name: 'Eva Funk',      towerId: 3, status: 'IN_AREA',   latitude: 54.2100, longitude: 11.0937, userId: 15, owner_id: _OWNER },
    { id: 16, name: 'Felix Groß',    towerId: 3, status: 'DEPLOYED',  latitude: 54.2095, longitude: 11.0940, userId: 16, owner_id: _OWNER },
    { id: 17, name: 'Greta Horn',    towerId: 4, status: 'IN_AREA',   latitude: 54.2062, longitude: 11.0982, userId: 17, owner_id: _OWNER },
  ],
  boats: [
    { id: 21, name: 'Seenotboot 1', callSign: 'Boot 1', towerId: 4, status: 'AT_TOWER',      latitude: 54.2058, longitude: 11.0985, owner_id: _OWNER },
    { id: 22, name: 'Seenotboot 2', callSign: 'Boot 2', towerId: 2, status: 'PATROL',        latitude: 54.2130, longitude: 11.0910, owner_id: _OWNER },
    { id: 23, name: 'Seenotboot 3', callSign: 'Boot 3', towerId: 3, status: 'OUT_OF_SERVICE', latitude: 54.2098, longitude: 11.0935, owner_id: _OWNER },
  ],
  requests: [
    { id: 31, guardId: 14, reason: 'PAUSE', note: 'Kurze Pause', status: 'APPROVED', createdAt: _nowIso(-25), decidedAt: _nowIso(-23), rejectionReason: null, owner_id: _OWNER },
    { id: 32, guardId: 12, reason: 'MATERIAL', note: 'Funkgerät holen', status: 'PENDING', createdAt: _nowIso(-4), decidedAt: null, rejectionReason: null, owner_id: _OWNER },
  ],
  controlTrips: [
    { id: 41, boatId: 22, note: 'Routine-Kontrollfahrt Nordmole', status: 'PENDING', createdAt: _nowIso(-8), decidedAt: null, rejectionReason: null, requestedBy: 'Bootsführer Demo', owner_id: _OWNER },
  ],
  users: [
    { id: 11, username: 'anna',  fullName: 'Anna Berg',   role: 'WACHGAENGER',  towerId: 1, isActive: 1, lastLogin: _nowIso(-120) },
    { id: 16, username: 'felix', fullName: 'Felix Groß',  role: 'BOOTSFUEHRER', towerId: 3, isActive: 1, lastLogin: _nowIso(-60) },
  ],
};

// ── Abgeleitete Felder (Spiegel der Server-Queries) ──────────
function _deriveTowerStatus(currentStaff, requiredStaff) {
  const req = requiredStaff || 1;
  if (currentStaff >= req) return 'GREEN';
  if (currentStaff >= req / 2) return 'YELLOW';
  return 'RED';
}
const _towerName = (id) => { const t = _db.towers.find(x => x.id === id); return t ? t.name : null; };
const _guardName = (id) => { const g = _db.guards.find(x => x.id === id); return g ? g.name : null; };

// Boots-Beitrag zur Sollstärke (Spiegel von server/status.js: boatStaffDelta).
function _boatStaffDelta(status) {
  if (status === 'AT_TOWER') return 1;
  if (status === 'PATROL' || status === 'DEPLOYED') return -1;
  return 0; // OUT_OF_SERVICE / sonst
}
function _towersView() {
  return _db.towers.map(t => {
    const currentStaff = _db.guards.filter(g => g.towerId === t.id && g.status === 'IN_AREA').length;
    const boatStatuses = _db.boats.filter(b => b.towerId === t.id).map(b => b.status);
    const required = Math.max(1, (t.requiredStaff || 2) + boatStatuses.reduce((s, st) => s + _boatStaffDelta(st), 0));
    const away = boatStatuses.filter(s => s === 'PATROL' || s === 'DEPLOYED').length;
    return {
      id: t.id, name: t.name, callSign: t.callSign,
      latitude: t.latitude, longitude: t.longitude,
      requiredStaff: t.requiredStaff, effectiveRequiredStaff: required, currentStaff,
      hasBoat: boatStatuses.length > 0,
      boatsAtTower: boatStatuses.filter(s => s === 'AT_TOWER').length,
      boatsAway: away,
      boatsBroken: boatStatuses.filter(s => s === 'OUT_OF_SERVICE').length,
      boatWarning: away > 0,
      status: _deriveTowerStatus(currentStaff, required),
    };
  });
}
const _guardsView = () => _db.guards.map(g => ({
  id: g.id, name: g.name, towerId: g.towerId, towerName: _towerName(g.towerId),
  status: g.status, latitude: g.latitude, longitude: g.longitude, userId: g.userId,
}));
const _boatsView = () => _db.boats.map(b => ({
  id: b.id, name: b.name, callSign: b.callSign, towerId: b.towerId, towerName: _towerName(b.towerId),
  status: b.status, latitude: b.latitude, longitude: b.longitude,
}));
const _requestsView = () => _db.requests
  .slice().sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1))
  .map(r => {
    const g = _db.guards.find(x => x.id === r.guardId);
    return {
      id: r.id, guardId: r.guardId, guardName: _guardName(r.guardId),
      towerName: g ? _towerName(g.towerId) : null,
      reason: r.reason, note: r.note, status: r.status,
      createdAt: r.createdAt, decidedAt: r.decidedAt, rejectionReason: r.rejectionReason,
      ownerId: r.owner_id,
    };
  });
const _controlTripsView = () => _db.controlTrips.map(c => {
  const b = _db.boats.find(x => x.id === c.boatId);
  return {
    id: c.id, boatId: c.boatId, boatName: b ? b.name : null, boatCallSign: b ? b.callSign : null,
    towerName: b ? _towerName(b.towerId) : null,
    note: c.note, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt,
    rejectionReason: c.rejectionReason, requestedBy: c.requestedBy, ownerId: c.owner_id,
  };
});
const _usersView = () => _db.users.map(u => ({
  id: u.id, username: u.username, fullName: u.fullName, role: u.role,
  towerId: u.towerId, towerName: _towerName(u.towerId), isActive: u.isActive, lastLogin: u.lastLogin,
  ownerId: _OWNER,
}));
function _summaryView() {
  const by = (arr, st) => arr.filter(x => x.status === st).length;
  return {
    towers: _db.towers.length,
    guardsTotal: _db.guards.length,
    guardsInArea: by(_db.guards, 'IN_AREA'),
    guardsMinusOne: by(_db.guards, 'MINUS_ONE'),
    guardsDeployed: by(_db.guards, 'DEPLOYED'),
    guardsBreak: by(_db.guards, 'BREAK'),
    boatsTotal: _db.boats.length,
    boatsByStatus: {},
    openRequests: _db.requests.filter(r => r.status === 'PENDING').length,
  };
}

// Mutationen lösen – wie der WebSocket-Broadcast im echten Backend – ein
// Refresh aller Clients aus. _handleEvent() lebt in ws.js.
function _broadcast(type) {
  if (typeof _handleEvent === 'function') queueMicrotask(() => _handleEvent(type));
}

function _err(status, message) { const e = new Error(message); e.status = status; throw e; }

// ── Mock-Router ──────────────────────────────────────────────
// Liefert dieselbe Form wie das echte Backend; wirft bei Fehlern wie api.js.
function previewRequest(method, rawUrl, body) {
  const url = rawUrl.split('?')[0];
  const seg = url.split('/').filter(Boolean); // z.B. ['api','towers','5']
  const idOf = (i) => Number(seg[i]);
  body = body || {};

  // ---- Auth / Config ----
  if (url === '/api/config') return _PREVIEW_CONFIG;
  if (url === '/api/version') return { version: 'preview', latest: null, updateAvailable: false, releaseUrl: null };
  if (url === '/api/auth/me') return _PREVIEW_USER;
  if (url === '/api/auth/needs-setup') return { needsSetup: false };
  if (url === '/api/auth/registration-status') return { enabled: false };
  if (url === '/api/auth/login' || url === '/api/auth/logout' || url === '/api/auth/password') return {};

  // ---- Türme ----
  if (url === '/api/towers' && method === 'GET') return { towers: _towersView() };
  if (url === '/api/towers' && method === 'POST') {
    const t = { id: _nextId(), name: body.name, callSign: body.callSign || null,
      latitude: body.latitude ?? null, longitude: body.longitude ?? null,
      requiredStaff: body.requiredStaff || 2, owner_id: _OWNER };
    _db.towers.push(t); _broadcast('towers-updated'); return { id: t.id };
  }
  if (seg[1] === 'towers' && seg[2] && method === 'PATCH') {
    const t = _db.towers.find(x => x.id === idOf(2)); if (!t) _err(404, 'Turm nicht gefunden');
    ['name', 'callSign', 'requiredStaff', 'latitude', 'longitude'].forEach(k => { if (k in body) t[k] = body[k]; });
    _broadcast('towers-updated'); return {};
  }
  if (seg[1] === 'towers' && seg[2] && method === 'DELETE') {
    _db.towers = _db.towers.filter(x => x.id !== idOf(2));
    _db.guards.forEach(g => { if (g.towerId === idOf(2)) g.towerId = null; });
    _db.boats.forEach(b => { if (b.towerId === idOf(2)) b.towerId = null; });
    _broadcast('towers-updated'); return {};
  }

  // ---- Wachgänger ----
  if (url === '/api/guards' && method === 'GET') return { guards: _guardsView() };

  // ---- Boote ----
  if (url === '/api/boats' && method === 'GET') return { boats: _boatsView() };
  if (url === '/api/boats' && method === 'POST') {
    const b = { id: _nextId(), name: body.name, callSign: body.callSign || null,
      towerId: body.towerId ?? null, status: body.status || 'AT_TOWER',
      latitude: body.latitude ?? null, longitude: body.longitude ?? null, owner_id: _OWNER };
    _db.boats.push(b); _broadcast('boats-updated'); return { id: b.id };
  }
  if (seg[1] === 'boats' && seg[2] && method === 'PATCH') {
    const b = _db.boats.find(x => x.id === idOf(2)); if (!b) _err(404, 'Boot nicht gefunden');
    ['name', 'callSign', 'towerId', 'status', 'latitude', 'longitude'].forEach(k => { if (k in body) b[k] = body[k]; });
    _broadcast('boats-updated'); return {};
  }
  if (seg[1] === 'boats' && seg[2] && method === 'DELETE') {
    _db.boats = _db.boats.filter(x => x.id !== idOf(2)); _broadcast('boats-updated'); return {};
  }

  // ---- -1/+1-Workflow ----
  if (url === '/api/requests' && method === 'GET') return { requests: _requestsView() };
  if (url === '/api/requests/minus-one' && method === 'POST') {
    const r = { id: _nextId(), guardId: body.guardId, reason: body.reason, note: body.note || null,
      status: 'PENDING', createdAt: _nowIso(), decidedAt: null, rejectionReason: null, owner_id: _OWNER };
    _db.requests.push(r); _broadcast('requests-updated'); return { id: r.id };
  }
  if (seg[1] === 'requests' && seg[2] && seg[3] === 'approve' && method === 'POST') {
    const r = _db.requests.find(x => x.id === idOf(2)); if (!r) _err(404, 'Anfrage nicht gefunden');
    r.status = 'APPROVED'; r.decidedAt = _nowIso();
    const g = _db.guards.find(x => x.id === r.guardId); if (g) g.status = 'MINUS_ONE';
    _broadcast('requests-updated'); return {};
  }
  if (seg[1] === 'requests' && seg[2] && seg[3] === 'reject' && method === 'POST') {
    const r = _db.requests.find(x => x.id === idOf(2)); if (!r) _err(404, 'Anfrage nicht gefunden');
    r.status = 'REJECTED'; r.decidedAt = _nowIso(); r.rejectionReason = body.rejectionReason || null;
    _broadcast('requests-updated'); return {};
  }
  if (seg[1] === 'requests' && seg[2] && seg[3] === 'return' && method === 'POST') {
    const r = _db.requests.find(x => x.id === idOf(2)); if (!r) _err(404, 'Anfrage nicht gefunden');
    r.status = 'RETURNED'; r.decidedAt = _nowIso();
    const g = _db.guards.find(x => x.id === r.guardId); if (g) g.status = 'IN_AREA';
    _broadcast('requests-updated'); return {};
  }

  // ---- Kontrollfahrten ----
  if (url === '/api/control-trips' && method === 'GET') return { controlTrips: _controlTripsView() };
  if (url === '/api/control-trips' && method === 'POST') {
    const c = { id: _nextId(), boatId: body.boatId, note: body.note || null, status: 'PENDING',
      createdAt: _nowIso(), decidedAt: null, rejectionReason: null, requestedBy: _PREVIEW_USER.fullName, owner_id: _OWNER };
    _db.controlTrips.push(c); _broadcast('control-trips-updated'); return { id: c.id };
  }
  if (seg[1] === 'control-trips' && seg[2] && seg[3] === 'approve' && method === 'POST') {
    const c = _db.controlTrips.find(x => x.id === idOf(2)); if (!c) _err(404, 'Anfrage nicht gefunden');
    c.status = 'APPROVED'; c.decidedAt = _nowIso(); _broadcast('control-trips-updated'); return {};
  }
  if (seg[1] === 'control-trips' && seg[2] && seg[3] === 'reject' && method === 'POST') {
    const c = _db.controlTrips.find(x => x.id === idOf(2)); if (!c) _err(404, 'Anfrage nicht gefunden');
    c.status = 'REJECTED'; c.decidedAt = _nowIso(); c.rejectionReason = body.rejectionReason || null;
    _broadcast('control-trips-updated'); return {};
  }

  // ---- Dashboard ----
  if (url === '/api/dashboard/summary') return _summaryView();

  // ---- Team (Wachführer verwaltet eigenes Personal) ----
  if (url === '/api/team/members' && method === 'GET') return { users: _usersView() };
  if (url === '/api/team/members' && method === 'POST') {
    const u = { id: _nextId(), username: body.username, fullName: body.fullName || null,
      role: body.role || 'WACHGAENGER', towerId: body.towerId ?? null, isActive: 1, lastLogin: null };
    _db.users.push(u); _broadcast('users-updated'); return { id: u.id };
  }
  if (seg[1] === 'team' && seg[2] === 'members' && seg[3] && method === 'PATCH') {
    const u = _db.users.find(x => x.id === idOf(3)); if (!u) _err(404, 'Benutzer nicht gefunden');
    ['username', 'fullName', 'role', 'towerId', 'isActive'].forEach(k => { if (k in body) u[k] = body[k]; });
    _broadcast('users-updated'); return {};
  }
  if (seg[1] === 'team' && seg[2] === 'members' && seg[3] && method === 'DELETE') {
    _db.users = _db.users.filter(x => x.id !== idOf(3)); _broadcast('users-updated'); return {};
  }

  // Unbekannte Route → wie ein 404 des Backends.
  _err(404, `Preview-Mock: ${method} ${url} nicht unterstützt`);
}
