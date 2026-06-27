// Integrationstest: bootet den echten Server (eigene temp-DB) und prüft
// Auth-Gate, Login, Seed-Türme/-Boote und den -1/+1-Workflow.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'turmstatus-test-'));

let proc;

function startServer() {
  return new Promise((resolve, reject) => {
    proc = spawn('node', ['server/server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: '127.0.0.1',
        NODE_ENV: 'test',
        DATABASE_PATH: path.join(dbDir, 'test.db'),
        MASTER_SECRET: '0123456789012345678901234567890123',
        SALT: '0123456789012345',
        SESSION_SECRET: '0123456789012345',
        ADMIN_USERNAME: 'hauptwache',
        ADMIN_PASSWORD: 'wache2024test'
      }
    });
    proc.stderr.on('data', () => {});
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.ok) { clearInterval(poll); clearTimeout(timeout); resolve(); }
      } catch (e) { /* noch nicht bereit */ }
    }, 250);
  });
}

// Cookie-Jar (eine simple Session)
let cookie = '';
async function api(method, p, body) {
  const opts = { method, headers: {} };
  if (cookie) opts.headers['Cookie'] = cookie;
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(BASE + p, opts);
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

before(startServer);
after(() => { if (proc) proc.kill(); try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch (e) {} });

test('Türme ohne Login → 401', async () => {
  const { status } = await api('GET', '/api/towers');
  assert.strictEqual(status, 401);
});

test('Login als Hauptwache', async () => {
  const { status, data } = await api('POST', '/api/auth/login', { username: 'hauptwache', password: 'wache2024test' });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.role, 'HAUPTWACHE');
});

test('Seed-Türme haben abgeleiteten Status', async () => {
  const { status, data } = await api('GET', '/api/towers');
  assert.strictEqual(status, 200);
  assert.ok(data.towers.length >= 4);
  assert.ok(['GREEN', 'YELLOW', 'RED'].includes(data.towers[0].status));
});

// Über mehrere Tests geteilter Zustand (Tests laufen in Reihenfolge).
let sharedTowerId, sharedGuardId;

test('Konten-Hierarchie: Admin→Wachführer→Team (gescoped)', async () => {
  // Als Hauptwache (App-Admin) angemeldet (vorheriger Test) → Turm-ID holen
  const towers = (await api('GET', '/api/towers')).data.towers;
  sharedTowerId = towers[0].id;

  // Admin legt Wachführer mit Wache an
  const wf = await api('POST', '/api/admin/users',
    { username: 'wf_test', password: 'wachfuehrer-123', role: 'WACHFUEHRER', towerId: sharedTowerId });
  assert.strictEqual(wf.status, 201);

  // Wachführer meldet sich an und legt eigenes Personal an
  const wfLogin = await api('POST', '/api/auth/login', { username: 'wf_test', password: 'wachfuehrer-123' });
  assert.strictEqual(wfLogin.data.role, 'WACHFUEHRER');

  assert.strictEqual((await api('POST', '/api/team/members', { username: 'wg_test', password: 'wachgaenger-123', role: 'WACHGAENGER' })).status, 201);
  assert.strictEqual((await api('POST', '/api/team/members', { username: 'bf_test', password: 'bootsfuehrer-123', role: 'BOOTSFUEHRER' })).status, 201);

  // Team-Liste enthält nur die eigene Wache und beide neuen Konten
  const team = (await api('GET', '/api/team/members')).data.users;
  assert.strictEqual(team.length, 2);
  assert.ok(team.every(u => u.towerId === sharedTowerId));

  // Wachgänger darf KEIN Konto anlegen
  await api('POST', '/api/auth/login', { username: 'wg_test', password: 'wachgaenger-123' });
  const denied = await api('POST', '/api/team/members', { username: 'x_test', password: 'yyyyyyyyyy', role: 'WACHGAENGER' });
  assert.strictEqual(denied.status, 403);
});

test('-1/+1: Wachgänger beantragt → Wachführer genehmigt; Admin darf NICHT', async () => {
  // Hauptwache legt das Wachgänger-Lageobjekt an der Wache an
  await api('POST', '/api/auth/login', { username: 'hauptwache', password: 'wache2024test' });
  const g = await api('POST', '/api/guards', { name: 'Test-Wachgänger', towerId: sharedTowerId });
  assert.strictEqual(g.status, 201);
  sharedGuardId = g.data.id;

  // Wachgänger beantragt -1
  await api('POST', '/api/auth/login', { username: 'wg_test', password: 'wachgaenger-123' });
  const r = await api('POST', '/api/requests/minus-one', { guardId: sharedGuardId, reason: 'PAUSE', note: 'Test' });
  assert.strictEqual(r.status, 201);
  const reqId = r.data.id;

  // Admin (Hauptwache/is_admin) hat reine Ansicht → darf NICHT genehmigen
  await api('POST', '/api/auth/login', { username: 'hauptwache', password: 'wache2024test' });
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/approve`)).status, 403);

  // Wachführer der Wache genehmigt → Wachgänger MINUS_ONE
  await api('POST', '/api/auth/login', { username: 'wf_test', password: 'wachfuehrer-123' });
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/approve`)).status, 200);
  let guards = (await api('GET', '/api/guards')).data.guards;
  assert.strictEqual(guards.find(x => x.id === sharedGuardId).status, 'MINUS_ONE');

  // Rückkehr → IN_AREA
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/return`)).status, 200);
  guards = (await api('GET', '/api/guards')).data.guards;
  assert.strictEqual(guards.find(x => x.id === sharedGuardId).status, 'IN_AREA');
});

test('Kontrollfahrt: Bootsführer beantragt → Wachführer genehmigt; Admin darf NICHT', async () => {
  // Boot der eigenen Wache finden
  await api('POST', '/api/auth/login', { username: 'bf_test', password: 'bootsfuehrer-123' });
  const boats = (await api('GET', '/api/boats')).data.boats;
  const boat = boats.find(b => b.towerId === sharedTowerId);
  assert.ok(boat, 'Boot an der Wache vorhanden');

  // Wachgänger darf keine K-Fahrt anfragen
  await api('POST', '/api/auth/login', { username: 'wg_test', password: 'wachgaenger-123' });
  assert.strictEqual((await api('POST', '/api/control-trips', { boatId: boat.id })).status, 403);

  // Bootsführer beantragt
  await api('POST', '/api/auth/login', { username: 'bf_test', password: 'bootsfuehrer-123' });
  const ct = await api('POST', '/api/control-trips', { boatId: boat.id, note: 'Routinekontrolle' });
  assert.strictEqual(ct.status, 201);
  const ctId = ct.data.id;

  // Admin darf NICHT genehmigen
  await api('POST', '/api/auth/login', { username: 'hauptwache', password: 'wache2024test' });
  assert.strictEqual((await api('POST', `/api/control-trips/${ctId}/approve`)).status, 403);

  // Wachführer der Wache genehmigt
  await api('POST', '/api/auth/login', { username: 'wf_test', password: 'wachfuehrer-123' });
  assert.strictEqual((await api('POST', `/api/control-trips/${ctId}/approve`)).status, 200);

  const trips = (await api('GET', '/api/control-trips')).data.controlTrips;
  assert.strictEqual(trips.find(t => t.id === ctId).status, 'APPROVED');
});

test('Wachführer verwaltet Türme + Boote; Wachgänger darf NICHT', async () => {
  // Wachführer legt einen Turm an, positioniert ihn und ordnet ein Boot zu.
  await api('POST', '/api/auth/login', { username: 'wf_test', password: 'wachfuehrer-123' });
  const tw = await api('POST', '/api/towers',
    { name: 'Turm Test', callSign: '06/99', latitude: 54.215, longitude: 11.090, requiredStaff: 2 });
  assert.strictEqual(tw.status, 201);
  const towerId = tw.data.id;

  // Positionieren (Karten-Drag → PATCH lat/lng)
  assert.strictEqual((await api('PATCH', `/api/towers/${towerId}`, { latitude: 54.216, longitude: 11.091 })).status, 200);
  // Ungültige Koordinaten → 400
  assert.strictEqual((await api('PATCH', `/api/towers/${towerId}`, { latitude: 999 })).status, 400);

  // Boot anlegen + Turm-Zuordnung ändern
  const bt = await api('POST', '/api/boats', { name: 'Boot Test', towerId });
  assert.strictEqual(bt.status, 201);
  const boatId = bt.data.id;
  assert.strictEqual((await api('PATCH', `/api/boats/${boatId}`, { towerId: null })).status, 200);

  // Wachgänger hat KEINE Infrastruktur-Rechte
  await api('POST', '/api/auth/login', { username: 'wg_test', password: 'wachgaenger-123' });
  assert.strictEqual((await api('POST', '/api/towers', { name: 'X' })).status, 403);
  assert.strictEqual((await api('POST', '/api/boats', { name: 'X' })).status, 403);
  assert.strictEqual((await api('DELETE', `/api/towers/${towerId}`)).status, 403);

  // Aufräumen als Wachführer (löscht Boot + Turm)
  await api('POST', '/api/auth/login', { username: 'wf_test', password: 'wachfuehrer-123' });
  assert.strictEqual((await api('DELETE', `/api/boats/${boatId}`)).status, 200);
  assert.strictEqual((await api('DELETE', `/api/towers/${towerId}`)).status, 200);
});

test('Dashboard-Summary liefert Kennzahlen', async () => {
  await api('POST', '/api/auth/login', { username: 'hauptwache', password: 'wache2024test' });
  const { status, data } = await api('GET', '/api/dashboard/summary');
  assert.strictEqual(status, 200);
  assert.ok(typeof data.towers === 'number');
  assert.ok(typeof data.openRequests === 'number');
});
