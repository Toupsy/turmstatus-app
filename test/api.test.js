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

test('-1/+1-Workflow: anlegen → genehmigen → Rückkehr', async () => {
  // Wachgänger anlegen
  const g = await api('POST', '/api/guards', { name: 'Test-Wachgänger' });
  assert.strictEqual(g.status, 201);
  const guardId = g.data.id;

  // -1 beantragen
  const r = await api('POST', '/api/requests/minus-one', { guardId, reason: 'PAUSE', note: 'Test' });
  assert.strictEqual(r.status, 201);
  const reqId = r.data.id;

  // genehmigen → Wachgänger MINUS_ONE
  const a = await api('POST', `/api/requests/${reqId}/approve`);
  assert.strictEqual(a.status, 200);
  let guards = (await api('GET', '/api/guards')).data.guards;
  assert.strictEqual(guards.find(x => x.id === guardId).status, 'MINUS_ONE');

  // Rückkehr → IN_AREA
  const back = await api('POST', `/api/requests/${reqId}/return`);
  assert.strictEqual(back.status, 200);
  guards = (await api('GET', '/api/guards')).data.guards;
  assert.strictEqual(guards.find(x => x.id === guardId).status, 'IN_AREA');
});

test('Dashboard-Summary liefert Kennzahlen', async () => {
  const { status, data } = await api('GET', '/api/dashboard/summary');
  assert.strictEqual(status, 200);
  assert.ok(typeof data.towers === 'number');
  assert.ok(typeof data.openRequests === 'number');
});

test('Konten-Hierarchie: Admin→Wachführer→Team (gescoped)', async () => {
  // Als Hauptwache (App-Admin) angemeldet (vorheriger Test) → Turm-ID holen
  const towers = (await api('GET', '/api/towers')).data.towers;
  const towerId = towers[0].id;

  // Admin legt Wachführer mit Wache an
  const wf = await api('POST', '/api/admin/users',
    { username: 'wf_test', password: 'wachfuehrer-123', role: 'WACHFUEHRER', towerId });
  assert.strictEqual(wf.status, 201);

  // Wachführer meldet sich an und legt eigenes Personal an
  const wfLogin = await api('POST', '/api/auth/login', { username: 'wf_test', password: 'wachfuehrer-123' });
  assert.strictEqual(wfLogin.data.role, 'WACHFUEHRER');

  const wg = await api('POST', '/api/team/members', { username: 'wg_test', password: 'wachgaenger-123', role: 'WACHGAENGER' });
  assert.strictEqual(wg.status, 201);
  const bf = await api('POST', '/api/team/members', { username: 'bf_test', password: 'bootsfuehrer-123', role: 'BOOTSFUEHRER' });
  assert.strictEqual(bf.status, 201);

  // Team-Liste enthält nur die eigene Wache und beide neuen Konten
  const team = (await api('GET', '/api/team/members')).data.users;
  assert.strictEqual(team.length, 2);
  assert.ok(team.every(u => u.towerId === towerId));

  // Wachgänger darf KEIN Konto anlegen
  await api('POST', '/api/auth/login', { username: 'wg_test', password: 'wachgaenger-123' });
  const denied = await api('POST', '/api/team/members', { username: 'x_test', password: 'yyyyyyyyyy', role: 'WACHGAENGER' });
  assert.strictEqual(denied.status, 403);
});

test('Kontrollfahrt: Bootsführer beantragt → Hauptwache genehmigt', async () => {
  // Bootsführer anmelden, Boot wählen
  await api('POST', '/api/auth/login', { username: 'bf_test', password: 'bootsfuehrer-123' });
  const boats = (await api('GET', '/api/boats')).data.boats;
  const boatId = boats[0].id;

  // Wachgänger dürfte das nicht
  await api('POST', '/api/auth/login', { username: 'wg_test', password: 'wachgaenger-123' });
  const wgTry = await api('POST', '/api/control-trips', { boatId });
  assert.strictEqual(wgTry.status, 403);

  // Bootsführer beantragt
  await api('POST', '/api/auth/login', { username: 'bf_test', password: 'bootsfuehrer-123' });
  const ct = await api('POST', '/api/control-trips', { boatId, note: 'Routinekontrolle' });
  assert.strictEqual(ct.status, 201);
  const ctId = ct.data.id;

  // Hauptwache genehmigt
  await api('POST', '/api/auth/login', { username: 'hauptwache', password: 'wache2024test' });
  const approve = await api('POST', `/api/control-trips/${ctId}/approve`);
  assert.strictEqual(approve.status, 200);

  const trips = (await api('GET', '/api/control-trips')).data.controlTrips;
  assert.strictEqual(trips.find(t => t.id === ctId).status, 'APPROVED');
});
