import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestApp, client, type TestApp } from './helpers.js';

let app: TestApp;
let adminC: ReturnType<typeof client>;
let publicAdmin: ReturnType<typeof client>;

beforeAll(async () => {
  app = await makeTestApp({ adminPassword: 'admin-secret-123' });
  adminC = client(app.adminApp);
  publicAdmin = client(app.publicApp);
  expect((await adminC.post('/api/auth/login', { username: 'hauptwache', password: 'admin-secret-123' })).statusCode).toBe(200);
  expect((await publicAdmin.post('/api/auth/login', { username: 'hauptwache', password: 'admin-secret-123' })).statusCode).toBe(200);
});

afterAll(async () => {
  await app.close();
});

describe('Harte Admin-Netzwerk-Grenze', () => {
  it('/api/admin/* existiert NUR auf dem Admin-Listener', async () => {
    // Öffentlicher Port kennt die Route nicht (404) – sogar als eingeloggter Admin.
    expect((await publicAdmin.get('/api/admin/users')).statusCode).toBe(404);
    // Admin-Port: eingeloggter Admin → 200.
    expect((await adminC.get('/api/admin/users')).statusCode).toBe(200);
  });

  it('Admin-Routen brauchen Admin-Session', async () => {
    const anon = client(app.adminApp);
    expect((await anon.get('/api/admin/users')).statusCode).toBe(401);
  });
});

describe('Benutzer- & Vorlagenverwaltung', () => {
  it('Admin legt Vorlagen an; neuer Wachführer erbt sie', async () => {
    expect(
      (await adminC.post('/api/admin/tower-templates', { name: 'Vorlage-Turm', callSign: 'V1', requiredStaff: 2, latitude: 54.2, longitude: 11.1 })).statusCode
    ).toBe(201);
    expect((await adminC.post('/api/admin/boat-templates', { name: 'Vorlage-Boot', status: 'AT_TOWER' })).statusCode).toBe(201);

    const created = await adminC.post('/api/admin/users', {
      username: 'wfneu',
      password: 'passwort1',
      fullName: 'WF Neu',
      role: 'WACHFUEHRER'
    });
    expect(created.statusCode).toBe(201);

    // Neuer WF loggt sich am öffentlichen Port ein und sieht die geklonten Objekte.
    const wf = client(app.publicApp);
    expect((await wf.post('/api/auth/login', { username: 'wfneu', password: 'passwort1' })).statusCode).toBe(200);
    const towers = await wf.get('/api/towers');
    expect(towers.json()).toHaveLength(1);
    expect(towers.json()[0].name).toBe('Vorlage-Turm');
    const boats = await wf.get('/api/boats');
    expect(boats.json()).toHaveLength(1);
    expect(boats.json()[0].towerId).toBe(null); // geerbt ohne Turm-Zuordnung
  });

  it('Audit-Log enthält Einträge', async () => {
    const log = await adminC.get('/api/admin/audit-log?limit=50');
    expect(log.statusCode).toBe(200);
    expect(log.json().length).toBeGreaterThan(0);
  });

  it('letzter Administrator ist geschützt', async () => {
    const users = (await adminC.get('/api/admin/users')).json() as { id: number; isAdmin: boolean }[];
    const admin = users.find((u) => u.isAdmin)!;
    expect((await adminC.del(`/api/admin/users/${admin.id}`)).statusCode).toBe(409);
    expect((await adminC.patch(`/api/admin/users/${admin.id}`, { isActive: false })).statusCode).toBe(409);
  });

  it('Nicht-Admin (WF) darf Admin-Routen nicht nutzen (403)', async () => {
    const wf = client(app.adminApp);
    expect((await wf.post('/api/auth/login', { username: 'wfneu', password: 'passwort1' })).statusCode).toBe(200);
    expect((await wf.get('/api/admin/users')).statusCode).toBe(403);
  });
});
