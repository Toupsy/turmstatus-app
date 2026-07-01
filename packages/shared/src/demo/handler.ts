// ============================================================
// demo/handler.ts – Simulierter API-Server für den Demo-Modus.
// Bildet die Routen aus apps/api/src/routes/* (inkl. Rollen-Gates,
// Mandanten-Scope und -1/K-Fahrt-Workflow) über der Demo-DB nach.
// Wichtig: Das ist reine DEMO-Logik im Browser – die echte harte
// Admin-Grenze (eigener Listener) existiert nur auf dem Server.
// ============================================================

import type { z } from 'zod';
import {
  loginSchema,
  passwordChangeSchema,
  towerCreateSchema,
  towerUpdateSchema,
  guardCreateSchema,
  guardUpdateSchema,
  guardStatusSchema,
  positionSchema,
  boatCreateSchema,
  boatUpdateSchema,
  minusOneSchema,
  kFahrtRequestSchema,
  rejectSchema,
  teamMemberCreateSchema,
  teamMemberUpdateSchema,
  resetPasswordSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  towerTemplateSchema,
  towerTemplateUpdateSchema,
  boatTemplateSchema,
  boatTemplateUpdateSchema
} from '../schemas.js';
import { BOAT_STATUSES, config as appConfig, type BoatStatus } from '../config.js';
import type { WsEventType } from '../types.js';
import { computeDemoScope, inScope, type DemoDb, type DemoResult, type DemoScope, type DemoUser } from './types.js';
import {
  buildTowerViews,
  buildGuardViews,
  buildBoatViews,
  buildRequestViews,
  buildSummary,
  toCurrentUser,
  toUserDto
} from './views.js';

function now(): string {
  return new Date().toISOString();
}

function ok(body: unknown, events: WsEventType[] = [], changed = events.length > 0, status = 200): DemoResult {
  return { status, body, events, changed };
}

function fail(status: number, error: string): DemoResult {
  return { status, body: { error }, events: [], changed: false };
}

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): { data: z.infer<S> } | { error: DemoResult } {
  const res = schema.safeParse(body ?? {});
  if (!res.success) {
    const first = res.error.issues[0];
    return { error: fail(400, first ? `${first.path.join('.')}: ${first.message}`.replace(/^: /, '') : 'Ungültige Eingabe') };
  }
  return { data: res.data };
}

function audit(db: DemoDb, userId: number | null, action: string, entityType: string, entityId: number | null, details?: unknown): void {
  db.audit.unshift({ id: db.nextId++, userId, action, entityType, entityId, details: details ?? null, timestamp: now() });
  if (db.audit.length > 300) db.audit.length = 300;
}

function ownsTower(db: DemoDb, towerId: number, ownerId: number): boolean {
  return db.towers.some((t) => t.id === towerId && t.ownerId === ownerId);
}

function activeAdminCount(db: DemoDb, exceptId?: number): number {
  return db.users.filter((u) => u.isAdmin && u.isActive && u.id !== exceptId).length;
}

/** Vorlagen in den Scope eines neuen Wachführers klonen (wie lib/templates.ts). */
function applyTemplates(db: DemoDb, newOwnerId: number): void {
  for (const t of db.towerTemplates) {
    db.towers.push({
      id: db.nextId++,
      name: t.name,
      callSign: t.callSign,
      latitude: t.latitude,
      longitude: t.longitude,
      requiredStaff: t.requiredStaff,
      presentStaff: 0,
      ownerId: newOwnerId,
      createdAt: now()
    });
  }
  for (const b of db.boatTemplates) {
    db.boats.push({
      id: db.nextId++,
      name: b.name,
      callSign: b.callSign,
      status: b.status,
      latitude: b.latitude,
      longitude: b.longitude,
      towerId: null,
      ownerId: newOwnerId,
      updatedAt: now()
    });
  }
}

/**
 * Simuliert einen API-Aufruf gegen die Demo-DB (mutiert `db` in place).
 * `userId` = angemeldeter Demo-Benutzer (null = keine Session).
 */
export function handleDemoRequest(db: DemoDb, userId: number | null, method: string, url: string, body?: unknown): DemoResult {
  const qIndex = url.indexOf('?');
  const path = qIndex === -1 ? url : url.slice(0, qIndex);
  const query = new URLSearchParams(qIndex === -1 ? '' : url.slice(qIndex + 1));
  const user = userId != null ? (db.users.find((u) => u.id === userId && u.isActive) ?? null) : null;

  // --- Ohne Auth erreichbar ---
  if (method === 'GET' && path === '/api/config') return ok(appConfig);
  if (method === 'GET' && path === '/api/auth/me') return ok({ user: user ? toCurrentUser(user) : null });
  if (method === 'GET' && path === '/api/auth/needs-setup') return ok({ needsSetup: false });
  if (method === 'GET' && path === '/api/auth/registration-status')
    return ok({ mode: 'disabled', enabled: false, requiresCode: false });
  if (method === 'POST' && path === '/api/auth/login') {
    const p = parse(loginSchema, body);
    if ('error' in p) return p.error;
    // Demo: jedes Passwort wird akzeptiert – es zählt nur der Benutzername.
    const row = db.users.find((u) => u.username === p.data.username && u.isActive);
    if (!row) return fail(401, 'Benutzername oder Passwort falsch (Demo: admin, wf.dahme, wg.jonas, bf.mia)');
    row.lastLogin = now();
    audit(db, row.id, 'auth.login', 'user', row.id);
    return ok({ user: toCurrentUser(row) }, [], true);
  }
  if (method === 'POST' && path === '/api/auth/logout') return ok({ ok: true });

  if (!user) return fail(401, 'Nicht angemeldet');
  const scope: DemoScope = computeDemoScope(user);
  const isWf = user.role === 'WACHFUEHRER';

  if (method === 'POST' && path === '/api/auth/password') {
    const p = parse(passwordChangeSchema, body);
    if ('error' in p) return p.error;
    // Demo: Passwörter werden nicht geprüft/gespeichert.
    audit(db, user.id, 'auth.password-change', 'user', user.id);
    return ok({ ok: true }, [], true);
  }

  // ============================ Türme ============================
  if (path === '/api/towers' && method === 'GET') return ok(buildTowerViews(db, scope));
  if (path === '/api/towers' && method === 'POST') {
    if (!isWf) return fail(403, 'Nur Wachführer');
    const p = parse(towerCreateSchema, body);
    if ('error' in p) return p.error;
    const id = db.nextId++;
    db.towers.push({
      id,
      name: p.data.name,
      callSign: p.data.callSign ?? null,
      latitude: p.data.latitude ?? null,
      longitude: p.data.longitude ?? null,
      requiredStaff: p.data.requiredStaff ?? 2,
      presentStaff: p.data.presentStaff ?? 0,
      ownerId: user.id,
      createdAt: now()
    });
    audit(db, user.id, 'tower.create', 'tower', id, { name: p.data.name });
    return ok({ id }, ['towers-updated'], true, 201);
  }
  let m = path.match(/^\/api\/towers\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    const tower = db.towers.find((t) => t.id === id && t.ownerId === user.id);
    if (method === 'PATCH') {
      if (!isWf) return fail(403, 'Nur Wachführer');
      const p = parse(towerUpdateSchema, body);
      if ('error' in p) return p.error;
      if (!tower) return fail(404, 'Turm nicht gefunden');
      Object.assign(tower, {
        ...(p.data.name !== undefined && { name: p.data.name }),
        ...(p.data.callSign !== undefined && { callSign: p.data.callSign }),
        ...(p.data.latitude !== undefined && { latitude: p.data.latitude }),
        ...(p.data.longitude !== undefined && { longitude: p.data.longitude }),
        ...(p.data.requiredStaff !== undefined && { requiredStaff: p.data.requiredStaff }),
        ...(p.data.presentStaff !== undefined && { presentStaff: p.data.presentStaff })
      });
      audit(db, user.id, 'tower.update', 'tower', id, p.data);
      return ok({ ok: true }, ['towers-updated'], true);
    }
    if (method === 'DELETE') {
      if (!isWf) return fail(403, 'Nur Wachführer');
      if (!tower) return fail(404, 'Turm nicht gefunden');
      for (const b of db.boats) if (b.towerId === id && b.ownerId === user.id) b.towerId = null;
      for (const g of db.guards) if (g.towerId === id && g.ownerId === user.id) g.towerId = null;
      db.towers = db.towers.filter((t) => t.id !== id);
      audit(db, user.id, 'tower.delete', 'tower', id, { name: tower.name });
      return ok({ ok: true }, ['towers-updated', 'boats-updated', 'guards-updated'], true);
    }
  }

  // ============================ Wachgänger ============================
  if (path === '/api/guards' && method === 'GET') return ok(buildGuardViews(db, scope));
  if (path === '/api/guards' && method === 'POST') {
    if (!isWf) return fail(403, 'Nur Wachführer');
    const p = parse(guardCreateSchema, body);
    if ('error' in p) return p.error;
    if (p.data.towerId != null && !ownsTower(db, p.data.towerId, user.id))
      return fail(400, 'Turm gehört nicht zu deinem Bereich');
    const id = db.nextId++;
    db.guards.push({
      id,
      name: p.data.name,
      towerId: p.data.towerId ?? null,
      userId: p.data.userId ?? null,
      status: p.data.status ?? 'IN_AREA',
      latitude: p.data.latitude ?? null,
      longitude: p.data.longitude ?? null,
      ownerId: user.id,
      updatedAt: now()
    });
    audit(db, user.id, 'guard.create', 'guard', id, { name: p.data.name });
    return ok({ id }, ['guards-updated', 'towers-updated'], true, 201);
  }
  m = path.match(/^\/api\/guards\/(\d+)(?:\/(status|position))?$/);
  if (m) {
    const id = Number(m[1]);
    const sub = m[2];
    const guard = db.guards.find((g) => g.id === id);
    if (method === 'PATCH' && sub === 'status') {
      const p = parse(guardStatusSchema, body);
      if ('error' in p) return p.error;
      const allowed = guard && ((isWf && guard.ownerId === user.id) || guard.userId === user.id);
      if (!guard || !allowed) return fail(404, 'Wachgänger nicht gefunden');
      guard.status = p.data.status;
      guard.updatedAt = now();
      audit(db, user.id, 'guard.status', 'guard', id, { status: p.data.status });
      return ok({ ok: true }, ['guards-updated', 'towers-updated'], true);
    }
    if (method === 'PATCH' && sub === 'position') {
      const p = parse(positionSchema, body);
      if ('error' in p) return p.error;
      const allowed = guard && ((isWf && guard.ownerId === user.id) || guard.userId === user.id);
      if (!guard || !allowed) return fail(404, 'Wachgänger nicht gefunden');
      guard.latitude = p.data.latitude;
      guard.longitude = p.data.longitude;
      guard.updatedAt = now();
      return ok({ ok: true }, ['guards-updated'], true);
    }
    if (method === 'PATCH' && !sub) {
      if (!isWf) return fail(403, 'Nur Wachführer');
      const p = parse(guardUpdateSchema, body);
      if ('error' in p) return p.error;
      if (!guard || guard.ownerId !== user.id) return fail(404, 'Wachgänger nicht gefunden');
      if (p.data.towerId != null && !ownsTower(db, p.data.towerId, user.id))
        return fail(400, 'Turm gehört nicht zu deinem Bereich');
      if (p.data.name !== undefined) guard.name = p.data.name;
      if (p.data.towerId !== undefined) guard.towerId = p.data.towerId;
      guard.updatedAt = now();
      audit(db, user.id, 'guard.update', 'guard', id, p.data);
      return ok({ ok: true }, ['guards-updated', 'towers-updated'], true);
    }
    if (method === 'DELETE' && !sub) {
      if (!isWf) return fail(403, 'Nur Wachführer');
      if (!guard || guard.ownerId !== user.id) return fail(404, 'Wachgänger nicht gefunden');
      db.guards = db.guards.filter((g) => g.id !== id);
      audit(db, user.id, 'guard.delete', 'guard', id, { name: guard.name });
      return ok({ ok: true }, ['guards-updated', 'towers-updated'], true);
    }
  }

  // ============================ Boote ============================
  if (path === '/api/boats' && method === 'GET') return ok(buildBoatViews(db, scope));
  if (path === '/api/boats' && method === 'POST') {
    if (!isWf) return fail(403, 'Nur Wachführer');
    const p = parse(boatCreateSchema, body);
    if ('error' in p) return p.error;
    if (p.data.towerId != null && !ownsTower(db, p.data.towerId, user.id))
      return fail(400, 'Turm gehört nicht zu deinem Bereich');
    const id = db.nextId++;
    db.boats.push({
      id,
      name: p.data.name,
      callSign: p.data.callSign ?? null,
      towerId: p.data.towerId ?? null,
      status: p.data.status ?? 'AT_TOWER',
      latitude: p.data.latitude ?? null,
      longitude: p.data.longitude ?? null,
      ownerId: user.id,
      updatedAt: now()
    });
    audit(db, user.id, 'boat.create', 'boat', id, { name: p.data.name });
    return ok({ id }, ['boats-updated', 'towers-updated'], true, 201);
  }
  m = path.match(/^\/api\/boats\/(\d+)(?:\/(status))?$/);
  if (m) {
    const id = Number(m[1]);
    const sub = m[2];
    const boat = db.boats.find((b) => b.id === id);
    if (method === 'PATCH' && sub === 'status') {
      const raw = (body as { status?: string } | null | undefined)?.status;
      if (!raw || !(BOAT_STATUSES as readonly string[]).includes(raw)) return fail(400, 'Ungültiger Status');
      const status = raw as BoatStatus;
      const allowed =
        boat &&
        ((isWf && boat.ownerId === user.id) || (user.role === 'BOOTSFUEHRER' && boat.ownerId === user.ownerId));
      if (!boat || !allowed) return fail(404, 'Boot nicht gefunden');
      boat.status = status;
      boat.updatedAt = now();
      audit(db, user.id, 'boat.status', 'boat', id, { status });
      return ok({ ok: true }, ['boats-updated', 'towers-updated'], true);
    }
    if (method === 'PATCH' && !sub) {
      if (!isWf) return fail(403, 'Nur Wachführer');
      const p = parse(boatUpdateSchema, body);
      if ('error' in p) return p.error;
      if (!boat || boat.ownerId !== user.id) return fail(404, 'Boot nicht gefunden');
      if (p.data.towerId != null && !ownsTower(db, p.data.towerId, user.id))
        return fail(400, 'Turm gehört nicht zu deinem Bereich');
      Object.assign(boat, {
        ...(p.data.name !== undefined && { name: p.data.name }),
        ...(p.data.callSign !== undefined && { callSign: p.data.callSign }),
        ...(p.data.towerId !== undefined && { towerId: p.data.towerId }),
        ...(p.data.status !== undefined && { status: p.data.status }),
        ...(p.data.latitude !== undefined && { latitude: p.data.latitude }),
        ...(p.data.longitude !== undefined && { longitude: p.data.longitude })
      });
      boat.updatedAt = now();
      audit(db, user.id, 'boat.update', 'boat', id, p.data);
      return ok({ ok: true }, ['boats-updated', 'towers-updated'], true);
    }
    if (method === 'DELETE' && !sub) {
      if (!isWf) return fail(403, 'Nur Wachführer');
      if (!boat || boat.ownerId !== user.id) return fail(404, 'Boot nicht gefunden');
      db.boats = db.boats.filter((b) => b.id !== id);
      audit(db, user.id, 'boat.delete', 'boat', id, { name: boat.name });
      return ok({ ok: true }, ['boats-updated', 'towers-updated'], true);
    }
  }

  // ============================ Anfragen (-1 / K-Fahrt) ============================
  if (path === '/api/requests' && method === 'GET')
    return ok(buildRequestViews(db, scope, query.get('status') ?? undefined));

  if (path === '/api/requests/minus-one' && method === 'POST') {
    if (!['WACHGAENGER', 'BOOTSFUEHRER', 'WACHFUEHRER'].includes(user.role)) return fail(403, 'Keine Berechtigung');
    const p = parse(minusOneSchema, body);
    if ('error' in p) return p.error;
    const guard = db.guards.find((g) => g.id === p.data.guardId);
    if (!guard || !inScope(scope, guard.ownerId)) return fail(404, 'Wachgänger nicht gefunden');
    const open = db.requests.some((r) => r.guardId === guard.id && (r.status === 'PENDING' || r.status === 'APPROVED'));
    if (open) return fail(409, 'Es gibt bereits eine offene/aktive -1-Anfrage');
    const id = db.nextId++;
    db.requests.push({
      id,
      guardId: guard.id,
      requestedBy: user.id,
      kind: 'MINUS_ONE',
      reason: p.data.reason,
      note: p.data.note ?? null,
      status: 'PENDING',
      rejectionReason: null,
      createdAt: now(),
      decidedAt: null,
      decidedBy: null,
      returnedAt: null
    });
    audit(db, user.id, 'request.minus-one', 'request', id, { guardId: guard.id, reason: p.data.reason });
    return ok({ id }, ['requests-updated'], true, 201);
  }

  if (path === '/api/requests/k-fahrt' && method === 'POST') {
    if (!['BOOTSFUEHRER', 'WACHFUEHRER'].includes(user.role)) return fail(403, 'Keine Berechtigung');
    const p = parse(kFahrtRequestSchema, body);
    if ('error' in p) return p.error;
    const guard = db.guards.find((g) => g.id === p.data.guardId);
    if (!guard || !inScope(scope, guard.ownerId)) return fail(404, 'Wachgänger nicht gefunden');
    const open = db.requests.some(
      (r) => r.guardId === guard.id && r.kind === 'K_FAHRT' && (r.status === 'PENDING' || r.status === 'APPROVED')
    );
    if (open) return fail(409, 'Es gibt bereits eine offene/aktive K-Fahrt-Anfrage');
    const id = db.nextId++;
    db.requests.push({
      id,
      guardId: guard.id,
      requestedBy: user.id,
      kind: 'K_FAHRT',
      reason: null,
      note: p.data.note ?? null,
      status: 'PENDING',
      rejectionReason: null,
      createdAt: now(),
      decidedAt: null,
      decidedBy: null,
      returnedAt: null
    });
    audit(db, user.id, 'request.k-fahrt', 'request', id, { guardId: guard.id });
    return ok({ id }, ['requests-updated'], true, 201);
  }

  m = path.match(/^\/api\/requests\/(\d+)\/(approve|set-k-fahrt|reject|return)$/);
  if (m && method === 'POST') {
    const id = Number(m[1]);
    const action = m[2];
    const request = db.requests.find((r) => r.id === id);
    const guard = request ? db.guards.find((g) => g.id === request.guardId) : undefined;

    if (action === 'return') {
      if (!request || !guard || !inScope(scope, guard.ownerId)) return fail(404, 'Anfrage nicht gefunden');
      if (request.status !== 'APPROVED')
        return fail(409, 'Nur genehmigte -1 / aktive K-Fahrten können zurückgemeldet werden');
      request.status = 'RETURNED';
      request.returnedAt = now();
      const events: WsEventType[] = ['requests-updated', 'towers-updated'];
      // Bei -1 kehrt der Wachgänger zurück; die K-Fahrt hat den Guard-Status nicht verändert.
      if (request.kind !== 'K_FAHRT') {
        guard.status = 'IN_AREA';
        guard.updatedAt = now();
        events.push('guards-updated');
      }
      audit(db, user.id, 'request.return', 'request', id);
      return ok({ ok: true }, events, true);
    }

    // approve / set-k-fahrt / reject: nur der Owner-Wachführer des Wachgängers.
    if (!isWf) return fail(403, 'Nur Wachführer');
    if (!request || !guard || guard.ownerId !== user.id) return fail(404, 'Anfrage nicht gefunden');

    if (action === 'approve') {
      if (request.kind === 'K_FAHRT') return fail(409, 'Kontrollfahrten werden über „K-Fahrt setzen" aktiviert');
      if (request.status !== 'PENDING') return fail(409, 'Anfrage ist nicht mehr offen');
      request.status = 'APPROVED';
      request.decidedAt = now();
      request.decidedBy = user.id;
      guard.status = 'MINUS_ONE';
      guard.updatedAt = now();
      audit(db, user.id, 'request.approve', 'request', id);
      return ok({ ok: true }, ['requests-updated', 'guards-updated', 'towers-updated'], true);
    }
    if (action === 'set-k-fahrt') {
      if (request.kind !== 'K_FAHRT') return fail(409, 'Keine Kontrollfahrt-Anfrage');
      if (request.status !== 'PENDING') return fail(409, 'Anfrage ist nicht mehr offen');
      request.status = 'APPROVED';
      request.decidedAt = now();
      request.decidedBy = user.id;
      audit(db, user.id, 'request.set-k-fahrt', 'request', id);
      return ok({ ok: true }, ['requests-updated', 'towers-updated'], true);
    }
    if (action === 'reject') {
      const p = parse(rejectSchema, body);
      if ('error' in p) return p.error;
      if (request.status !== 'PENDING') return fail(409, 'Anfrage ist nicht mehr offen');
      request.status = 'REJECTED';
      request.decidedAt = now();
      request.decidedBy = user.id;
      request.rejectionReason = p.data.rejectionReason ?? null;
      audit(db, user.id, 'request.reject', 'request', id);
      return ok({ ok: true }, ['requests-updated'], true);
    }
  }

  // ============================ Dashboard ============================
  if (path === '/api/dashboard/summary' && method === 'GET') return ok(buildSummary(db, scope));

  // ============================ Team (Wachführer) ============================
  if (path === '/api/team/members' && method === 'GET') {
    if (!isWf) return fail(403, 'Nur Wachführer');
    return ok(
      db.users
        .filter((u) => u.ownerId === user.id && (u.role === 'WACHGAENGER' || u.role === 'BOOTSFUEHRER'))
        .map(toUserDto)
    );
  }
  if (path === '/api/team/members' && method === 'POST') {
    if (!isWf) return fail(403, 'Nur Wachführer');
    const p = parse(teamMemberCreateSchema, body);
    if ('error' in p) return p.error;
    if (db.users.some((u) => u.username === p.data.username)) return fail(409, 'Benutzername vergeben');
    const row: DemoUser = {
      id: db.nextId++,
      username: p.data.username,
      fullName: p.data.fullName ?? null,
      role: p.data.role,
      towerId: p.data.towerId ?? null,
      ownerId: user.id, // Mandant erzwungen
      isAdmin: false,
      isActive: true,
      lastLogin: null,
      createdAt: now()
    };
    db.users.push(row);
    audit(db, user.id, 'team.create', 'user', row.id, { username: row.username, role: row.role });
    return ok(toUserDto(row), ['users-updated'], true, 201);
  }
  m = path.match(/^\/api\/team\/members\/(\d+)(?:\/(reset-password))?$/);
  if (m) {
    if (!isWf) return fail(403, 'Nur Wachführer');
    const id = Number(m[1]);
    const member = db.users.find((u) => u.id === id && u.ownerId === user.id);
    if (method === 'PATCH' && !m[2]) {
      const p = parse(teamMemberUpdateSchema, body);
      if ('error' in p) return p.error;
      if (!member) return fail(404, 'Mitglied nicht gefunden');
      if (p.data.fullName !== undefined) member.fullName = p.data.fullName;
      if (p.data.role !== undefined) member.role = p.data.role;
      if (p.data.isActive !== undefined) member.isActive = p.data.isActive;
      if (p.data.towerId !== undefined) member.towerId = p.data.towerId;
      audit(db, user.id, 'team.update', 'user', id, p.data);
      return ok({ ok: true }, ['users-updated'], true);
    }
    if (method === 'POST' && m[2] === 'reset-password') {
      const p = parse(resetPasswordSchema, body);
      if ('error' in p) return p.error;
      if (!member) return fail(404, 'Mitglied nicht gefunden');
      audit(db, user.id, 'team.reset-password', 'user', id);
      return ok({ ok: true }, [], true);
    }
    if (method === 'DELETE' && !m[2]) {
      if (!member) return fail(404, 'Mitglied nicht gefunden');
      db.users = db.users.filter((u) => u.id !== id);
      audit(db, user.id, 'team.delete', 'user', id, { username: member.username });
      return ok({ ok: true }, ['users-updated'], true);
    }
  }

  // ============================ Admin (in der Demo ohne Netzwerk-Grenze) ============================
  if (path.startsWith('/api/admin/')) {
    if (!user.isAdmin) return fail(403, 'Nur Administratoren');

    if (path === '/api/admin/users' && method === 'GET') return ok(db.users.map(toUserDto));
    if (path === '/api/admin/users' && method === 'POST') {
      const p = parse(adminUserCreateSchema, body);
      if ('error' in p) return p.error;
      if (db.users.some((u) => u.username === p.data.username)) return fail(409, 'Benutzername vergeben');
      const isAdmin = p.data.isAdmin ?? false;
      const row: DemoUser = {
        id: db.nextId++,
        username: p.data.username,
        fullName: p.data.fullName ?? null,
        role: p.data.role,
        towerId: p.data.towerId ?? null,
        ownerId: null,
        isAdmin,
        isActive: true,
        lastLogin: null,
        createdAt: now()
      };
      db.users.push(row);
      const events: WsEventType[] = ['users-updated'];
      // Neuer Wachführer → Vorlagen in seinen Scope klonen.
      if (row.role === 'WACHFUEHRER' && !isAdmin) {
        applyTemplates(db, row.id);
        events.push('towers-updated', 'boats-updated');
      }
      audit(db, user.id, 'admin.user.create', 'user', row.id, { username: row.username, role: row.role });
      return ok(toUserDto(row), events, true, 201);
    }
    m = path.match(/^\/api\/admin\/users\/(\d+)(?:\/(reset-password))?$/);
    if (m) {
      const id = Number(m[1]);
      const target = db.users.find((u) => u.id === id);
      if (method === 'PATCH' && !m[2]) {
        const p = parse(adminUserUpdateSchema, body);
        if ('error' in p) return p.error;
        if (!target) return fail(404, 'Benutzer nicht gefunden');
        const wouldDropAdmin =
          target.isAdmin && (p.data.isAdmin === false || p.data.isActive === false) && activeAdminCount(db, id) === 0;
        if (wouldDropAdmin) return fail(409, 'Der letzte aktive Administrator kann nicht entfernt werden');
        if (p.data.fullName !== undefined) target.fullName = p.data.fullName;
        if (p.data.role !== undefined) target.role = p.data.role;
        if (p.data.towerId !== undefined) target.towerId = p.data.towerId;
        if (p.data.isActive !== undefined) target.isActive = p.data.isActive;
        if (p.data.isAdmin !== undefined) target.isAdmin = p.data.isAdmin;
        audit(db, user.id, 'admin.user.update', 'user', id, p.data);
        return ok({ ok: true }, ['users-updated'], true);
      }
      if (method === 'POST' && m[2] === 'reset-password') {
        const p = parse(resetPasswordSchema, body);
        if ('error' in p) return p.error;
        if (!target) return fail(404, 'Benutzer nicht gefunden');
        audit(db, user.id, 'admin.user.reset-password', 'user', id);
        return ok({ ok: true }, [], true);
      }
      if (method === 'DELETE' && !m[2]) {
        if (!target) return fail(404, 'Benutzer nicht gefunden');
        if (target.isAdmin && activeAdminCount(db, id) === 0)
          return fail(409, 'Der letzte Administrator kann nicht gelöscht werden');
        db.users = db.users.filter((u) => u.id !== id);
        audit(db, user.id, 'admin.user.delete', 'user', id, { username: target.username });
        return ok({ ok: true }, ['users-updated'], true);
      }
    }

    // --- Turm-Vorlagen ---
    if (path === '/api/admin/tower-templates' && method === 'GET') return ok(db.towerTemplates);
    if (path === '/api/admin/tower-templates' && method === 'POST') {
      const p = parse(towerTemplateSchema, body);
      if ('error' in p) return p.error;
      const row = {
        id: db.nextId++,
        name: p.data.name,
        callSign: p.data.callSign ?? null,
        latitude: p.data.latitude ?? null,
        longitude: p.data.longitude ?? null,
        requiredStaff: p.data.requiredStaff ?? 2,
        createdAt: now()
      };
      db.towerTemplates.push(row);
      audit(db, user.id, 'admin.tower-template.create', 'tower_template', row.id);
      return ok(row, [], true, 201);
    }
    m = path.match(/^\/api\/admin\/tower-templates\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const tpl = db.towerTemplates.find((t) => t.id === id);
      if (method === 'PATCH') {
        const p = parse(towerTemplateUpdateSchema, body);
        if ('error' in p) return p.error;
        if (!tpl) return fail(404, 'Vorlage nicht gefunden');
        Object.assign(tpl, {
          ...(p.data.name !== undefined && { name: p.data.name }),
          ...(p.data.callSign !== undefined && { callSign: p.data.callSign }),
          ...(p.data.latitude !== undefined && { latitude: p.data.latitude }),
          ...(p.data.longitude !== undefined && { longitude: p.data.longitude }),
          ...(p.data.requiredStaff !== undefined && { requiredStaff: p.data.requiredStaff })
        });
        audit(db, user.id, 'admin.tower-template.update', 'tower_template', id);
        return ok({ ok: true }, [], true);
      }
      if (method === 'DELETE') {
        db.towerTemplates = db.towerTemplates.filter((t) => t.id !== id);
        audit(db, user.id, 'admin.tower-template.delete', 'tower_template', id);
        return ok({ ok: true }, [], true);
      }
    }

    // --- Boot-Vorlagen ---
    if (path === '/api/admin/boat-templates' && method === 'GET') return ok(db.boatTemplates);
    if (path === '/api/admin/boat-templates' && method === 'POST') {
      const p = parse(boatTemplateSchema, body);
      if ('error' in p) return p.error;
      const row = {
        id: db.nextId++,
        name: p.data.name,
        callSign: p.data.callSign ?? null,
        status: p.data.status ?? ('AT_TOWER' as const),
        latitude: p.data.latitude ?? null,
        longitude: p.data.longitude ?? null,
        createdAt: now()
      };
      db.boatTemplates.push(row);
      audit(db, user.id, 'admin.boat-template.create', 'boat_template', row.id);
      return ok(row, [], true, 201);
    }
    m = path.match(/^\/api\/admin\/boat-templates\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const tpl = db.boatTemplates.find((t) => t.id === id);
      if (method === 'PATCH') {
        const p = parse(boatTemplateUpdateSchema, body);
        if ('error' in p) return p.error;
        if (!tpl) return fail(404, 'Vorlage nicht gefunden');
        Object.assign(tpl, {
          ...(p.data.name !== undefined && { name: p.data.name }),
          ...(p.data.callSign !== undefined && { callSign: p.data.callSign }),
          ...(p.data.status !== undefined && { status: p.data.status }),
          ...(p.data.latitude !== undefined && { latitude: p.data.latitude }),
          ...(p.data.longitude !== undefined && { longitude: p.data.longitude })
        });
        audit(db, user.id, 'admin.boat-template.update', 'boat_template', id);
        return ok({ ok: true }, [], true);
      }
      if (method === 'DELETE') {
        db.boatTemplates = db.boatTemplates.filter((t) => t.id !== id);
        audit(db, user.id, 'admin.boat-template.delete', 'boat_template', id);
        return ok({ ok: true }, [], true);
      }
    }

    // --- Audit-Log ---
    if (path === '/api/admin/audit-log' && method === 'GET') {
      const raw = Number(query.get('limit'));
      const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 1000) : 200;
      const entries = db.audit.slice(0, limit).map((a) => {
        const actor = a.userId != null ? db.users.find((u) => u.id === a.userId) : undefined;
        return {
          id: a.id,
          userId: a.userId,
          actorName: actor?.fullName ?? actor?.username ?? null,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          details: a.details,
          ipAddress: '127.0.0.1',
          timestamp: a.timestamp
        };
      });
      return ok(entries);
    }
  }

  return fail(404, `Demo: Endpoint nicht implementiert (${method} ${path})`);
}
