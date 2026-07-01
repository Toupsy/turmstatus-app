// ============================================================
// demo/types.ts – Datenmodell der Demo-"Datenbank" (reine Objekte).
// Spiegelt apps/api/src/db/schema.ts, aber DB-frei (JSON-serialisierbar).
// ============================================================

import type { Role, GuardStatus, BoatStatus, RequestStatus, Reason, RequestKind } from '../config.js';
import type { WsEventType } from '../types.js';

export interface DemoUser {
  id: number;
  username: string;
  fullName: string | null;
  role: Role;
  towerId: number | null;
  ownerId: number | null;
  isAdmin: boolean;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface DemoTower {
  id: number;
  name: string;
  callSign: string | null;
  latitude: number | null;
  longitude: number | null;
  requiredStaff: number;
  presentStaff: number;
  ownerId: number | null;
  createdAt: string;
}

export interface DemoGuard {
  id: number;
  userId: number | null;
  towerId: number | null;
  name: string;
  status: GuardStatus;
  latitude: number | null;
  longitude: number | null;
  ownerId: number | null;
  updatedAt: string | null;
}

export interface DemoBoat {
  id: number;
  name: string;
  callSign: string | null;
  towerId: number | null;
  status: BoatStatus;
  latitude: number | null;
  longitude: number | null;
  ownerId: number | null;
  updatedAt: string | null;
}

export interface DemoRequest {
  id: number;
  guardId: number;
  requestedBy: number;
  kind: RequestKind;
  reason: Reason | null;
  note: string | null;
  status: RequestStatus;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: number | null;
  returnedAt: string | null;
}

export interface DemoTowerTemplate {
  id: number;
  name: string;
  callSign: string | null;
  latitude: number | null;
  longitude: number | null;
  requiredStaff: number;
  createdAt: string;
}

export interface DemoBoatTemplate {
  id: number;
  name: string;
  callSign: string | null;
  status: BoatStatus;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface DemoAuditEntry {
  id: number;
  userId: number | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: unknown;
  timestamp: string;
}

export interface DemoDb {
  version: number;
  nextId: number;
  users: DemoUser[];
  towers: DemoTower[];
  guards: DemoGuard[];
  boats: DemoBoat[];
  requests: DemoRequest[];
  towerTemplates: DemoTowerTemplate[];
  boatTemplates: DemoBoatTemplate[];
  audit: DemoAuditEntry[];
}

/** Ergebnis eines simulierten API-Aufrufs. */
export interface DemoResult {
  status: number;
  body: unknown;
  /** Realtime-Events, die der echte Server broadcasten würde. */
  events: WsEventType[];
  /** true = die Demo-DB wurde verändert (Aufrufer persistiert). */
  changed: boolean;
}

/** Mandanten-Scope, identisch zur Server-Semantik (plugins/auth.ts). */
export type DemoScope = { all: true } | { all: false; scopeId: number };

export function computeDemoScope(user: DemoUser): DemoScope {
  if (user.isAdmin) return { all: true };
  if (user.role === 'WACHFUEHRER') return { all: false, scopeId: user.id };
  return { all: false, scopeId: user.ownerId ?? -1 };
}

export function inScope(scope: DemoScope, ownerId: number | null): boolean {
  return scope.all || ownerId === scope.scopeId;
}
