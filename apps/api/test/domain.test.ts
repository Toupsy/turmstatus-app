import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestApp, client, type TestApp } from './helpers.js';

let app: TestApp;
let wf1: ReturnType<typeof client>;
let wf2: ReturnType<typeof client>;
let wg: ReturnType<typeof client>;
let admin: ReturnType<typeof client>;

let t1Id: number;
let g1Id: number;
let reqId: number;
let boatId: number;

beforeAll(async () => {
  app = await makeTestApp({ adminPassword: 'admin-secret-123', registrationMode: 'open' });
  wf1 = client(app.publicApp);
  wf2 = client(app.publicApp);
  admin = client(app.publicApp);
  wg = client(app.publicApp);

  expect((await wf1.post('/api/auth/register', { username: 'wf1', password: 'passwort1' })).statusCode).toBe(200);
  expect((await wf2.post('/api/auth/register', { username: 'wf2', password: 'passwort1' })).statusCode).toBe(200);
  expect((await admin.post('/api/auth/login', { username: 'hauptwache', password: 'admin-secret-123' })).statusCode).toBe(200);
});

afterAll(async () => {
  await app.close();
});

describe('Türme + Wachgänger (WF1)', () => {
  it('WF1 legt Turm + Wachgänger an; Turmfarbe wird abgeleitet', async () => {
    const tower = await wf1.post('/api/towers', { name: 'Turm Nord', callSign: 'N1', requiredStaff: 2 });
    expect(tower.statusCode).toBe(201);
    t1Id = tower.json().id;

    const guard = await wf1.post('/api/guards', { name: 'WG Anna', towerId: t1Id });
    expect(guard.statusCode).toBe(201);
    g1Id = guard.json().id;

    const towers = await wf1.get('/api/towers');
    expect(towers.json()).toHaveLength(1);
    const t = towers.json()[0];
    expect(t.guardStaff).toBe(1);
    expect(t.effectiveRequiredStaff).toBe(2);
    expect(t.status).toBe('YELLOW'); // 1 von 2
  });
});

describe('-1/+1-Workflow', () => {
  it('WG (Team von WF1) beantragt -1, WF1 genehmigt → Guard MINUS_ONE, Turm RED', async () => {
    expect(
      (await wf1.post('/api/team/members', { username: 'wg1', password: 'passwort1', role: 'WACHGAENGER' })).statusCode
    ).toBe(201);
    expect((await wg.post('/api/auth/login', { username: 'wg1', password: 'passwort1' })).statusCode).toBe(200);

    const req = await wg.post('/api/requests/minus-one', { guardId: g1Id, reason: 'PAUSE' });
    expect(req.statusCode).toBe(201);
    reqId = req.json().id;

    // WG darf nicht genehmigen.
    expect((await wg.post(`/api/requests/${reqId}/approve`)).statusCode).toBe(403);

    const pending = await wf1.get('/api/requests?status=PENDING');
    expect(pending.json()).toHaveLength(1);
    expect((await wf1.post(`/api/requests/${reqId}/approve`)).statusCode).toBe(200);

    const guards = await wf1.get('/api/guards');
    expect(guards.json().find((g: { id: number }) => g.id === g1Id).status).toBe('MINUS_ONE');
    const t = (await wf1.get('/api/towers')).json()[0];
    expect(t.guardStaff).toBe(0);
    expect(t.status).toBe('RED');
  });

  it('doppelte -1 wird abgelehnt (409)', async () => {
    const dup = await wg.post('/api/requests/minus-one', { guardId: g1Id, reason: 'TOILET' });
    expect(dup.statusCode).toBe(409);
  });

  it('+1-Rückkehr setzt Guard zurück auf IN_AREA', async () => {
    expect((await wf1.post(`/api/requests/${reqId}/return`)).statusCode).toBe(200);
    const guards = await wf1.get('/api/guards');
    expect(guards.json().find((g: { id: number }) => g.id === g1Id).status).toBe('IN_AREA');
  });
});

describe('Boots-abhängige Sollstärke', () => {
  it('Boot AT_TOWER → Soll 3; PATROL → Soll 1 + Warnung', async () => {
    const boat = await wf1.post('/api/boats', { name: 'Boot 1', towerId: t1Id, status: 'AT_TOWER' });
    expect(boat.statusCode).toBe(201);
    boatId = boat.json().id;

    let t = (await wf1.get('/api/towers')).json()[0];
    expect(t.effectiveRequiredStaff).toBe(3);
    expect(t.hasBoat).toBe(true);
    expect(t.boatWarning).toBe(false);

    expect((await wf1.patch(`/api/boats/${boatId}/status`, { status: 'PATROL' })).statusCode).toBe(200);
    t = (await wf1.get('/api/towers')).json()[0];
    expect(t.effectiveRequiredStaff).toBe(1);
    expect(t.boatWarning).toBe(true);
  });
});

describe('Mandanten-Isolation', () => {
  it('WF2 sieht WF1-Objekte nicht und kann sie nicht ändern', async () => {
    expect((await wf2.get('/api/towers')).json()).toHaveLength(0);
    expect((await wf2.get('/api/guards')).json()).toHaveLength(0);
    expect((await wf2.get('/api/boats')).json()).toHaveLength(0);

    expect((await wf2.patch(`/api/towers/${t1Id}`, { name: 'Hack' })).statusCode).toBe(404);
    expect((await wf2.del(`/api/towers/${t1Id}`)).statusCode).toBe(404);
    // WF2 kann WF1s Guard keine -1 geben.
    expect((await wf2.post('/api/requests/minus-one', { guardId: g1Id, reason: 'PAUSE' })).statusCode).toBe(404);
  });

  it('WF2 kann WF1-Anfragen nicht genehmigen', async () => {
    // frische Anfrage anlegen
    const req = await wg.post('/api/requests/minus-one', { guardId: g1Id, reason: 'MATERIAL' });
    expect(req.statusCode).toBe(201);
    const foreignId = req.json().id;
    expect((await wf2.post(`/api/requests/${foreignId}/approve`)).statusCode).toBe(404);
    // aufräumen: WF1 lehnt ab
    expect((await wf1.post(`/api/requests/${foreignId}/reject`, { rejectionReason: 'Test' })).statusCode).toBe(200);
  });
});

describe('Admin: sieht alles, aber keine operativen Rechte', () => {
  it('Admin sieht WF1-Turm, darf aber nicht anlegen/genehmigen', async () => {
    const towers = await admin.get('/api/towers');
    expect(towers.json().length).toBeGreaterThanOrEqual(1);
    expect((await admin.post('/api/towers', { name: 'Admin-Turm' })).statusCode).toBe(403);
  });
});
