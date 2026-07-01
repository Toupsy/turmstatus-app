// ============================================================
// demo/views.ts – DTO-Aufbau der Demo analog apps/api/src/lib/views.ts
// (gleiche geteilte Statuslogik, nur über Arrays statt SQL).
// ============================================================

import { deriveTowerStatus, effectiveRequiredStaff, summarizeBoats } from '../status.js';
import { K_FAHRT_STAFF_REDUCTION, type BoatStatus } from '../config.js';
import type {
  TowerView,
  GuardView,
  BoatView,
  RequestView,
  DashboardSummary,
  CurrentUser,
  UserDto
} from '../types.js';
import { inScope, type DemoDb, type DemoScope, type DemoUser } from './types.js';

export function toCurrentUser(u: DemoUser): CurrentUser {
  return {
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    towerId: u.towerId,
    ownerId: u.ownerId,
    isAdmin: u.isAdmin
  };
}

export function toUserDto(u: DemoUser): UserDto {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    towerId: u.towerId,
    ownerId: u.ownerId,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt
  };
}

export function buildTowerViews(db: DemoDb, scope: DemoScope): TowerView[] {
  const towerRows = db.towers.filter((t) => inScope(scope, t.ownerId));
  const boatRows = db.boats.filter((b) => inScope(scope, b.ownerId));
  const guardRows = db.guards.filter((g) => inScope(scope, g.ownerId) && g.status === 'IN_AREA');

  // Aktive (gesetzte) Kontrollfahrten → Turm des jeweiligen Wachgängers.
  const kFahrtByTower = new Map<number, number>();
  for (const r of db.requests) {
    if (r.kind !== 'K_FAHRT' || r.status !== 'APPROVED') continue;
    const guard = db.guards.find((g) => g.id === r.guardId);
    if (!guard || guard.towerId == null || !inScope(scope, guard.ownerId)) continue;
    kFahrtByTower.set(guard.towerId, (kFahrtByTower.get(guard.towerId) ?? 0) + 1);
  }

  return towerRows.map((t): TowerView => {
    const boatStatuses: BoatStatus[] = boatRows.filter((b) => b.towerId === t.id).map((b) => b.status);
    const guardStaff = guardRows.filter((g) => g.towerId === t.id).length;
    const activeKFahrten = kFahrtByTower.get(t.id) ?? 0;
    const kFahrtReduction = activeKFahrten * K_FAHRT_STAFF_REDUCTION;
    const currentStaff = Math.max(0, guardStaff + t.presentStaff - kFahrtReduction);
    const effective = effectiveRequiredStaff(t.requiredStaff, boatStatuses);
    const summary = summarizeBoats(boatStatuses);
    return {
      id: t.id,
      name: t.name,
      callSign: t.callSign,
      latitude: t.latitude,
      longitude: t.longitude,
      requiredStaff: t.requiredStaff,
      effectiveRequiredStaff: effective,
      presentStaff: t.presentStaff,
      guardStaff,
      currentStaff,
      status: deriveTowerStatus(currentStaff, effective),
      ownerId: t.ownerId,
      hasBoat: summary.hasBoat,
      boatsAtTower: summary.atTower,
      boatsAway: summary.away,
      boatsBroken: summary.broken,
      boatWarning: summary.warning,
      activeKFahrten,
      kFahrtReduction
    };
  });
}

function towerName(db: DemoDb, towerId: number | null): string | null {
  if (towerId == null) return null;
  return db.towers.find((t) => t.id === towerId)?.name ?? null;
}

export function buildGuardViews(db: DemoDb, scope: DemoScope): GuardView[] {
  return db.guards
    .filter((g) => inScope(scope, g.ownerId))
    .map((g) => ({
      id: g.id,
      name: g.name,
      userId: g.userId,
      towerId: g.towerId,
      towerName: towerName(db, g.towerId),
      status: g.status,
      latitude: g.latitude,
      longitude: g.longitude,
      ownerId: g.ownerId,
      updatedAt: g.updatedAt
    }));
}

export function buildBoatViews(db: DemoDb, scope: DemoScope): BoatView[] {
  return db.boats
    .filter((b) => inScope(scope, b.ownerId))
    .map((b) => ({
      id: b.id,
      name: b.name,
      callSign: b.callSign,
      towerId: b.towerId,
      towerName: towerName(db, b.towerId),
      status: b.status,
      latitude: b.latitude,
      longitude: b.longitude,
      ownerId: b.ownerId,
      updatedAt: b.updatedAt
    }));
}

export function buildRequestViews(db: DemoDb, scope: DemoScope, status?: string): RequestView[] {
  const rows = db.requests
    .filter((r) => {
      const guard = db.guards.find((g) => g.id === r.guardId);
      if (!guard || !inScope(scope, guard.ownerId)) return false;
      return !status || r.status === status;
    })
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return rows.map((r): RequestView => {
    const guard = db.guards.find((g) => g.id === r.guardId);
    const requester = db.users.find((u) => u.id === r.requestedBy);
    return {
      id: r.id,
      guardId: r.guardId,
      guardName: guard?.name ?? null,
      towerId: guard?.towerId ?? null,
      towerName: towerName(db, guard?.towerId ?? null),
      requestedBy: r.requestedBy,
      requestedByName: requester?.fullName ?? requester?.username ?? null,
      kind: r.kind,
      reason: r.reason,
      note: r.note,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      decidedBy: r.decidedBy,
      returnedAt: r.returnedAt,
      ownerId: guard?.ownerId ?? null
    };
  });
}

export function buildSummary(db: DemoDb, scope: DemoScope): DashboardSummary {
  const guards = db.guards.filter((g) => inScope(scope, g.ownerId));
  const boats = db.boats.filter((b) => inScope(scope, b.ownerId));
  const openRequests = db.requests.filter((r) => {
    if (r.status !== 'PENDING') return false;
    const guard = db.guards.find((g) => g.id === r.guardId);
    return !!guard && inScope(scope, guard.ownerId);
  });
  return {
    towers: db.towers.filter((t) => inScope(scope, t.ownerId)).length,
    guardsOnDuty: guards.filter((g) => g.status === 'IN_AREA').length,
    guardsMinusOne: guards.filter((g) => g.status === 'MINUS_ONE').length,
    guardsDeployed: guards.filter((g) => g.status === 'DEPLOYED').length,
    boats: boats.length,
    boatsAway: boats.filter((b) => b.status === 'PATROL' || b.status === 'DEPLOYED').length,
    openRequests: openRequests.length
  };
}
