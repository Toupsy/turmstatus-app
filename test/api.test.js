// Integrationstest: bootet den echten Server (eigene temp-DB) und prüft Auth-Gate,
// Login, das Mandanten-Modell (Scope-Isolation pro Wachführer) und die Workflows
// (-1/+1, Kontrollfahrt). Es wird KEIN Demo-Lagebild mehr geseedet – jeder Wachführer
// legt seine eigenen Türme/Boote/Wachgänger an und sieht ausschließlich diese.

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
const login = (u, pw) => api('POST', '/api/auth/login', { username: u, password: pw });

before(startServer);
after(() => { if (proc) proc.kill(); try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch (e) {} });

// Über mehrere Tests geteilter Zustand (Tests laufen in Reihenfolge).
let towerId1, boatId1, guardId1, reqId, ctId;
const WF1 = { username: 'wf1', password: 'wachfuehrer-111' };
const WF2 = { username: 'wf2', password: 'wachfuehrer-222' };
const WG1 = { username: 'wg1', password: 'wachgaenger-111' };
const BF1 = { username: 'bf1', password: 'bootsfuehrer-111' };

test('Türme ohne Login → 401', async () => {
  cookie = '';
  const { status } = await api('GET', '/api/towers');
  assert.strictEqual(status, 401);
});

test('Login als Hauptwache (App-Admin)', async () => {
  const { status, data } = await login('hauptwache', 'wache2024test');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.role, 'HAUPTWACHE');
});

test('Frischer Start ist leer + Admin legt zwei Wachführer an', async () => {
  // Kein Demo-Seed mehr → Admin sieht (noch) keine Türme
  const towers = (await api('GET', '/api/towers')).data.towers;
  assert.strictEqual(towers.length, 0);

  assert.strictEqual((await api('POST', '/api/admin/users',
    { username: WF1.username, password: WF1.password, role: 'WACHFUEHRER' })).status, 201);
  assert.strictEqual((await api('POST', '/api/admin/users',
    { username: WF2.username, password: WF2.password, role: 'WACHFUEHRER' })).status, 201);
});

test('Wachführer 1 baut seinen eigenen Scope auf (Turm/Boot/Wachgänger/Personal)', async () => {
  assert.strictEqual((await login(WF1.username, WF1.password)).data.role, 'WACHFUEHRER');

  const tw = await api('POST', '/api/towers',
    { name: 'Turm Nord', callSign: '06/01', latitude: 54.215, longitude: 11.090, requiredStaff: 2 });
  assert.strictEqual(tw.status, 201);
  towerId1 = tw.data.id;
  // Positionieren (Karten-Drag → PATCH) + ungültige Koordinaten → 400
  assert.strictEqual((await api('PATCH', `/api/towers/${towerId1}`, { latitude: 54.216, longitude: 11.091 })).status, 200);
  assert.strictEqual((await api('PATCH', `/api/towers/${towerId1}`, { latitude: 999 })).status, 400);

  const bt = await api('POST', '/api/boats', { name: 'MRB Nord', towerId: towerId1 });
  assert.strictEqual(bt.status, 201);
  boatId1 = bt.data.id;

  const g = await api('POST', '/api/guards', { name: 'Wachgänger Nord', towerId: towerId1 });
  assert.strictEqual(g.status, 201);
  guardId1 = g.data.id;

  // Eigenes Personal anlegen (Wachgänger + Bootsführer)
  assert.strictEqual((await api('POST', '/api/team/members', { username: WG1.username, password: WG1.password, role: 'WACHGAENGER', towerId: towerId1 })).status, 201);
  assert.strictEqual((await api('POST', '/api/team/members', { username: BF1.username, password: BF1.password, role: 'BOOTSFUEHRER' })).status, 201);

  // WF1 sieht genau seinen einen Turm + sein Personal
  assert.strictEqual((await api('GET', '/api/towers')).data.towers.length, 1);
  assert.strictEqual((await api('GET', '/api/team/members')).data.users.length, 2);
});

test('Scope-Isolation: Wachführer 2 sieht WF1 nicht und darf ihn nicht ändern', async () => {
  assert.strictEqual((await login(WF2.username, WF2.password)).data.role, 'WACHFUEHRER');

  // WF2 sieht WEDER WF1s Türme noch Boote/Wachgänger
  assert.strictEqual((await api('GET', '/api/towers')).data.towers.length, 0);
  assert.strictEqual((await api('GET', '/api/boats')).data.boats.length, 0);
  assert.strictEqual((await api('GET', '/api/guards')).data.guards.length, 0);
  assert.strictEqual((await api('GET', '/api/team/members')).data.users.length, 0);

  // WF2 darf WF1s Turm nicht bearbeiten/löschen
  assert.strictEqual((await api('PATCH', `/api/towers/${towerId1}`, { name: 'Hack' })).status, 403);
  assert.strictEqual((await api('DELETE', `/api/towers/${towerId1}`)).status, 403);
  // WF2 darf kein Boot an WF1s Turm hängen
  assert.strictEqual((await api('POST', '/api/boats', { name: 'X', towerId: towerId1 })).status, 400);

  // WF2 kann seinen eigenen Turm anlegen
  assert.strictEqual((await api('POST', '/api/towers', { name: 'Turm Süd' })).status, 201);
});

test('-1/+1: Wachgänger beantragt → nur WF1 genehmigt (WF2 & Admin nicht)', async () => {
  await login(WG1.username, WG1.password);
  const r = await api('POST', '/api/requests/minus-one', { guardId: guardId1, reason: 'PAUSE', note: 'Test' });
  assert.strictEqual(r.status, 201);
  reqId = r.data.id;

  // Admin (view-only) darf NICHT
  await login('hauptwache', 'wache2024test');
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/approve`)).status, 403);
  // Fremder Wachführer darf NICHT
  await login(WF2.username, WF2.password);
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/approve`)).status, 403);

  // Eigentümer-Wachführer genehmigt → Wachgänger MINUS_ONE
  await login(WF1.username, WF1.password);
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/approve`)).status, 200);
  let guards = (await api('GET', '/api/guards')).data.guards;
  assert.strictEqual(guards.find(x => x.id === guardId1).status, 'MINUS_ONE');

  // Rückkehr → IN_AREA
  assert.strictEqual((await api('POST', `/api/requests/${reqId}/return`)).status, 200);
  guards = (await api('GET', '/api/guards')).data.guards;
  assert.strictEqual(guards.find(x => x.id === guardId1).status, 'IN_AREA');
});

test('Kontrollfahrt: Bootsführer beantragt → nur WF1 genehmigt', async () => {
  await login(BF1.username, BF1.password);
  // Bootsführer sieht das Boot seines Scopes
  const boats = (await api('GET', '/api/boats')).data.boats;
  assert.ok(boats.find(b => b.id === boatId1), 'Boot im eigenen Scope sichtbar');

  // Wachgänger darf keine K-Fahrt anfragen
  await login(WG1.username, WG1.password);
  assert.strictEqual((await api('POST', '/api/control-trips', { boatId: boatId1 })).status, 403);

  // Bootsführer beantragt
  await login(BF1.username, BF1.password);
  const ct = await api('POST', '/api/control-trips', { boatId: boatId1, note: 'Routinekontrolle' });
  assert.strictEqual(ct.status, 201);
  ctId = ct.data.id;

  // Admin + fremder Wachführer dürfen NICHT genehmigen
  await login('hauptwache', 'wache2024test');
  assert.strictEqual((await api('POST', `/api/control-trips/${ctId}/approve`)).status, 403);
  await login(WF2.username, WF2.password);
  assert.strictEqual((await api('POST', `/api/control-trips/${ctId}/approve`)).status, 403);

  // Eigentümer-Wachführer genehmigt
  await login(WF1.username, WF1.password);
  assert.strictEqual((await api('POST', `/api/control-trips/${ctId}/approve`)).status, 200);
  const trips = (await api('GET', '/api/control-trips')).data.controlTrips;
  assert.strictEqual(trips.find(t => t.id === ctId).status, 'APPROVED');
});

test('Manuelle Ist-Besetzung: Wachführer meldet anwesende WG ohne eigene Accounts', async () => {
  await login(WF1.username, WF1.password);
  // Turm mit Sollstärke 4, ganz ohne Wachgänger-Accounts
  const tw = await api('POST', '/api/towers', { name: 'Turm Melde', requiredStaff: 4, presentStaff: 1 });
  assert.strictEqual(tw.status, 201);
  const id = tw.data.id;

  const find = async () => (await api('GET', '/api/towers')).data.towers.find(t => t.id === id);
  let t = await find();
  assert.strictEqual(t.presentStaff, 1);
  assert.strictEqual(t.currentStaff, 1);   // keine Guard-Objekte → nur gemeldete Anwesende
  assert.strictEqual(t.status, 'RED');     // 1 von 4

  // Anwesende hochmelden → Status zieht nach (kein Account nötig)
  assert.strictEqual((await api('PATCH', `/api/towers/${id}`, { presentStaff: 2 })).status, 200);
  t = await find();
  assert.strictEqual(t.currentStaff, 2);
  assert.strictEqual(t.status, 'YELLOW');  // 2 von 4 = 50 %

  assert.strictEqual((await api('PATCH', `/api/towers/${id}`, { presentStaff: 4 })).status, 200);
  t = await find();
  assert.strictEqual(t.status, 'GREEN');

  // Negative Werte werden auf 0 geklammert
  assert.strictEqual((await api('PATCH', `/api/towers/${id}`, { presentStaff: -5 })).status, 200);
  t = await find();
  assert.strictEqual(t.presentStaff, 0);

  await api('DELETE', `/api/towers/${id}`);
});

test('Admin sieht alle Mandanten (Türme aller Wachführer)', async () => {
  await login('hauptwache', 'wache2024test');
  const towers = (await api('GET', '/api/towers')).data.towers;
  assert.ok(towers.length >= 2, 'Admin sieht Türme von WF1 und WF2');
  assert.ok(['GREEN', 'YELLOW', 'RED'].includes(towers[0].status));
});

test('Demo-Konfiguration: Vorlagen-Türme + Vererbung an neuen Wachführer', async () => {
  // Admin pflegt die Demo-Konfiguration (Vorlagen-Türme)
  await login('hauptwache', 'wache2024test');
  const tpl = await api('POST', '/api/admin/tower-templates',
    { name: 'Vorlage Hauptwache', callSign: '00/01', latitude: 54.2145, longitude: 11.0897, requiredStaff: 3 });
  assert.strictEqual(tpl.status, 201);
  assert.strictEqual((await api('GET', '/api/admin/tower-templates')).data.templates.length, 1);

  // Wachführer hat KEINEN Zugriff auf die Vorlagen-Verwaltung (Admin-Gate)
  await login(WF1.username, WF1.password);
  assert.strictEqual((await api('GET', '/api/admin/tower-templates')).status, 403);

  // Admin legt einen NEUEN Wachführer an → erbt die Vorlagen-Türme in seinen Scope
  await login('hauptwache', 'wache2024test');
  assert.strictEqual((await api('POST', '/api/admin/users',
    { username: 'wf3', password: 'wachfuehrer-333', role: 'WACHFUEHRER' })).status, 201);

  await login('wf3', 'wachfuehrer-333');
  const wf3Towers = (await api('GET', '/api/towers')).data.towers;
  assert.strictEqual(wf3Towers.length, 1);
  assert.strictEqual(wf3Towers[0].name, 'Vorlage Hauptwache');
  assert.ok(wf3Towers[0].ownerId, 'geerbter Turm hat einen owner (eigener Scope)');

  // Bereits VORHER angelegte Wachführer (WF1) bleiben unberührt
  await login(WF1.username, WF1.password);
  assert.ok(!(await api('GET', '/api/towers')).data.towers.some(t => t.name === 'Vorlage Hauptwache'));
});

test('Demo-Konfiguration: Vorlagen-Boote + Vererbung an neuen Wachführer', async () => {
  // Admin legt ein Vorlagen-Boot mit Position an
  await login('hauptwache', 'wache2024test');
  const tpl = await api('POST', '/api/admin/boat-templates',
    { name: 'Vorlage Boot 1', callSign: 'B-01', status: 'AT_TOWER', latitude: 54.2150, longitude: 11.0900 });
  assert.strictEqual(tpl.status, 201);
  const list = (await api('GET', '/api/admin/boat-templates')).data.templates;
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].latitude, 54.215);

  // Position per PATCH verschieben (Karten-Drag)
  assert.strictEqual((await api('PATCH', `/api/admin/boat-templates/${tpl.data.id}`,
    { latitude: 54.22, longitude: 11.1 })).status, 200);

  // Wachführer hat KEINEN Zugriff auf die Vorlagen-Verwaltung (Admin-Gate)
  await login(WF1.username, WF1.password);
  assert.strictEqual((await api('GET', '/api/admin/boat-templates')).status, 403);
  assert.strictEqual((await api('POST', '/api/admin/boat-templates', { name: 'X' })).status, 403);

  // Admin legt einen NEUEN Wachführer an → erbt das Vorlagen-Boot in seinen Scope
  await login('hauptwache', 'wache2024test');
  assert.strictEqual((await api('POST', '/api/admin/users',
    { username: 'wf4', password: 'wachfuehrer-444', role: 'WACHFUEHRER' })).status, 201);

  await login('wf4', 'wachfuehrer-444');
  const wf4Boats = (await api('GET', '/api/boats')).data.boats;
  assert.strictEqual(wf4Boats.length, 1);
  assert.strictEqual(wf4Boats[0].name, 'Vorlage Boot 1');
  assert.strictEqual(wf4Boats[0].latitude, 54.22);
  assert.strictEqual(wf4Boats[0].towerId, null, 'geerbtes Boot startet ohne Turm-Zuordnung');
  assert.ok(wf4Boats[0].ownerId, 'geerbtes Boot hat einen owner (eigener Scope)');
});

test('Dashboard-Summary liefert Kennzahlen', async () => {
  await login('hauptwache', 'wache2024test');
  const { status, data } = await api('GET', '/api/dashboard/summary');
  assert.strictEqual(status, 200);
  assert.ok(typeof data.towers === 'number');
  assert.ok(typeof data.openRequests === 'number');
});
