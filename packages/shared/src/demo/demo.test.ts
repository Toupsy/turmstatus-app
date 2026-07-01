import { describe, it, expect } from 'vitest';
import { seedDemoDb, handleDemoRequest, DEMO_ROLE_USER_IDS } from './index.js';
import type { TowerView, GuardView, RequestView, UserDto } from '../types.js';

const ADMIN = DEMO_ROLE_USER_IDS.HAUPTWACHE;
const WF = DEMO_ROLE_USER_IDS.WACHFUEHRER;
const WG = DEMO_ROLE_USER_IDS.WACHGAENGER;
const BF = DEMO_ROLE_USER_IDS.BOOTSFUEHRER;

describe('Demo-Handler', () => {
  it('liefert Scope-gefilterte Sichten (WF sieht nur eigenen Mandanten, Admin alles)', () => {
    const db = seedDemoDb();
    const wfTowers = handleDemoRequest(db, WF, 'GET', '/api/towers').body as TowerView[];
    const adminTowers = handleDemoRequest(db, ADMIN, 'GET', '/api/towers').body as TowerView[];
    expect(wfTowers.every((t) => t.ownerId === WF)).toBe(true);
    expect(adminTowers.length).toBeGreaterThan(wfTowers.length);
  });

  it('Admin ist operativ view-only (kein Turm-Anlegen)', () => {
    const db = seedDemoDb();
    const res = handleDemoRequest(db, ADMIN, 'POST', '/api/towers', { name: 'X' });
    expect(res.status).toBe(403);
  });

  it('-1-Workflow: WG beantragt → WF sieht PENDING → genehmigt → Guard -1 → Rückkehr → IN_AREA', () => {
    const db = seedDemoDb();
    // Jonas (guard 1, IN_AREA) beantragt -1 als Wachgänger.
    const created = handleDemoRequest(db, WG, 'POST', '/api/requests/minus-one', { guardId: 1, reason: 'PAUSE' });
    expect(created.status).toBe(201);
    expect(created.events).toContain('requests-updated');
    const reqId = (created.body as { id: number }).id;

    // Der Wachführer sieht die Anfrage als PENDING.
    const pending = handleDemoRequest(db, WF, 'GET', '/api/requests?status=PENDING').body as RequestView[];
    expect(pending.some((r) => r.id === reqId)).toBe(true);

    // WG darf nicht genehmigen, WF schon.
    expect(handleDemoRequest(db, WG, 'POST', `/api/requests/${reqId}/approve`).status).toBe(403);
    const approved = handleDemoRequest(db, WF, 'POST', `/api/requests/${reqId}/approve`);
    expect(approved.status).toBe(200);
    let guards = handleDemoRequest(db, WF, 'GET', '/api/guards').body as GuardView[];
    expect(guards.find((g) => g.id === 1)?.status).toBe('MINUS_ONE');

    // +1 Rückkehr (im Scope auch durch WG möglich).
    const returned = handleDemoRequest(db, WG, 'POST', `/api/requests/${reqId}/return`);
    expect(returned.status).toBe(200);
    guards = handleDemoRequest(db, WF, 'GET', '/api/guards').body as GuardView[];
    expect(guards.find((g) => g.id === 1)?.status).toBe('IN_AREA');
  });

  it('K-Fahrt: approve → 409, set-k-fahrt reduziert Turm um 2', () => {
    const db = seedDemoDb();
    // Seed enthält bereits eine PENDING K-Fahrt (id 2, guard 2 auf Turm 1).
    expect(handleDemoRequest(db, WF, 'POST', '/api/requests/2/approve').status).toBe(409);
    const before = (handleDemoRequest(db, WF, 'GET', '/api/towers').body as TowerView[]).find((t) => t.id === 1)!;
    const set = handleDemoRequest(db, WF, 'POST', '/api/requests/2/set-k-fahrt');
    expect(set.status).toBe(200);
    const after = (handleDemoRequest(db, WF, 'GET', '/api/towers').body as TowerView[]).find((t) => t.id === 1)!;
    expect(after.activeKFahrten).toBe(1);
    expect(after.kFahrtReduction).toBe(2);
    expect(after.currentStaff).toBe(Math.max(0, before.currentStaff - 2));
  });

  it('Bootsführer darf Boot-Status im eigenen Mandanten setzen, Wachgänger nicht', () => {
    const db = seedDemoDb();
    expect(handleDemoRequest(db, BF, 'PATCH', '/api/boats/1/status', { status: 'PATROL' }).status).toBe(200);
    expect(handleDemoRequest(db, WG, 'PATCH', '/api/boats/1/status', { status: 'AT_TOWER' }).status).toBe(404);
    // Fremder Mandant (Boot 3 gehört Kellenhusen).
    expect(handleDemoRequest(db, BF, 'PATCH', '/api/boats/3/status', { status: 'PATROL' }).status).toBe(404);
  });

  it('Admin: neuer Wachführer bekommt Vorlagen geklont, letzter Admin ist geschützt', () => {
    const db = seedDemoDb();
    const created = handleDemoRequest(db, ADMIN, 'POST', '/api/admin/users', {
      username: 'wf.neu',
      password: 'geheim1',
      role: 'WACHFUEHRER'
    });
    expect(created.status).toBe(201);
    const newId = (created.body as UserDto).id;
    expect(db.towers.some((t) => t.ownerId === newId)).toBe(true);
    expect(db.boats.some((b) => b.ownerId === newId)).toBe(true);

    const drop = handleDemoRequest(db, ADMIN, 'PATCH', `/api/admin/users/${ADMIN}`, { isAdmin: false });
    expect(drop.status).toBe(409);
    // Nicht-Admin (WF) kommt nicht an Admin-Endpunkte.
    expect(handleDemoRequest(db, WF, 'GET', '/api/admin/users').status).toBe(403);
  });

  it('Session-Handling: ohne Login 401, Login per Benutzername', () => {
    const db = seedDemoDb();
    expect(handleDemoRequest(db, null, 'GET', '/api/towers').status).toBe(401);
    const login = handleDemoRequest(db, null, 'POST', '/api/auth/login', { username: 'wf.dahme', password: 'egal' });
    expect(login.status).toBe(200);
  });
});
