// ============================================================
// views.ts – DB-Zeilen zu TowerView/GuardView/BoatView aggregieren.
// Nutzt die geteilte Status-Logik aus @turmstatus/shared (keine Duplikation).
// ============================================================

import { eq } from 'drizzle-orm';
import {
  deriveTowerStatus,
  effectiveRequiredStaff,
  summarizeBoats,
  type TowerView,
  type GuardView,
  type BoatView,
  type GuardStatus,
  type BoatStatus
} from '@turmstatus/shared';
import type { Db } from '../db/index.js';
import { towers, guards, boats } from '../db/schema.js';
import { scopeWhere } from './scope.js';
import type { ViewScope } from '../types/fastify.js';

export function buildTowerViews(db: Db, scope: ViewScope): TowerView[] {
  const towerRows = db.select().from(towers).where(scopeWhere(scope, towers.ownerId)).all();
  const boatRows = db.select().from(boats).where(scopeWhere(scope, boats.ownerId)).all();
  const guardRows = db
    .select()
    .from(guards)
    .where(scopeWhere(scope, guards.ownerId, eq(guards.status, 'IN_AREA')))
    .all();

  const boatsByTower = new Map<number, BoatStatus[]>();
  for (const b of boatRows) {
    if (b.towerId == null) continue;
    const list = boatsByTower.get(b.towerId) ?? [];
    list.push(b.status as BoatStatus);
    boatsByTower.set(b.towerId, list);
  }
  const guardStaffByTower = new Map<number, number>();
  for (const g of guardRows) {
    if (g.towerId == null) continue;
    guardStaffByTower.set(g.towerId, (guardStaffByTower.get(g.towerId) ?? 0) + 1);
  }

  return towerRows.map((t): TowerView => {
    const boatStatuses = boatsByTower.get(t.id) ?? [];
    const guardStaff = guardStaffByTower.get(t.id) ?? 0;
    const presentStaff = t.presentStaff;
    const currentStaff = guardStaff + presentStaff;
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
      presentStaff,
      guardStaff,
      currentStaff,
      status: deriveTowerStatus(currentStaff, effective),
      ownerId: t.ownerId,
      hasBoat: summary.hasBoat,
      boatsAtTower: summary.atTower,
      boatsAway: summary.away,
      boatsBroken: summary.broken,
      boatWarning: summary.warning
    };
  });
}

function towerNameMap(db: Db, scope: ViewScope): Map<number, string> {
  const rows = db
    .select({ id: towers.id, name: towers.name })
    .from(towers)
    .where(scopeWhere(scope, towers.ownerId))
    .all();
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function buildGuardViews(db: Db, scope: ViewScope): GuardView[] {
  const names = towerNameMap(db, scope);
  const rows = db.select().from(guards).where(scopeWhere(scope, guards.ownerId)).all();
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    userId: g.userId,
    towerId: g.towerId,
    towerName: g.towerId != null ? (names.get(g.towerId) ?? null) : null,
    status: g.status as GuardStatus,
    latitude: g.latitude,
    longitude: g.longitude,
    ownerId: g.ownerId,
    updatedAt: g.updatedAt
  }));
}

export function buildBoatViews(db: Db, scope: ViewScope): BoatView[] {
  const names = towerNameMap(db, scope);
  const rows = db.select().from(boats).where(scopeWhere(scope, boats.ownerId)).all();
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    callSign: b.callSign,
    towerId: b.towerId,
    towerName: b.towerId != null ? (names.get(b.towerId) ?? null) : null,
    status: b.status as BoatStatus,
    latitude: b.latitude,
    longitude: b.longitude,
    ownerId: b.ownerId,
    updatedAt: b.updatedAt
  }));
}
