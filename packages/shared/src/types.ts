// ============================================================
// types.ts – DTOs, die die API zurückliefert (vom Frontend konsumiert).
// ============================================================

import type { Role, GuardStatus, BoatStatus, TowerStatus, RequestStatus, Reason, RequestKind } from './config.js';

export interface CurrentUser {
  userId: number;
  username: string;
  fullName: string | null;
  role: Role;
  towerId: number | null;
  ownerId: number | null;
  isAdmin: boolean;
}

export interface UserDto {
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

export interface TowerView {
  id: number;
  name: string;
  callSign: string | null;
  latitude: number | null;
  longitude: number | null;
  requiredStaff: number; // editierbare Basis
  effectiveRequiredStaff: number; // inkl. Boots-Beitrag
  presentStaff: number; // manuell gemeldete Anwesende
  guardStaff: number; // Wachgänger IN_AREA
  currentStaff: number; // guardStaff + presentStaff
  status: TowerStatus;
  ownerId: number | null;
  hasBoat: boolean;
  boatsAtTower: number;
  boatsAway: number;
  boatsBroken: number;
  boatWarning: boolean;
  activeKFahrten: number; // gesetzte Kontrollfahrten dieses Turms
  kFahrtReduction: number; // dadurch abgezogene Ist-Besetzung (2 pro K-Fahrt)
}

export interface GuardView {
  id: number;
  name: string;
  userId: number | null;
  towerId: number | null;
  towerName: string | null;
  status: GuardStatus;
  latitude: number | null;
  longitude: number | null;
  ownerId: number | null;
  updatedAt: string | null;
}

export interface BoatView {
  id: number;
  name: string;
  callSign: string | null;
  towerId: number | null;
  towerName: string | null;
  status: BoatStatus;
  latitude: number | null;
  longitude: number | null;
  ownerId: number | null;
  updatedAt: string | null;
}

export interface RequestView {
  id: number;
  guardId: number;
  guardName: string | null;
  towerId: number | null;
  towerName: string | null;
  requestedBy: number;
  requestedByName: string | null;
  kind: RequestKind;
  reason: Reason | null;
  note: string | null;
  status: RequestStatus;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: number | null;
  returnedAt: string | null;
  ownerId: number | null;
}

export interface DashboardSummary {
  towers: number;
  guardsOnDuty: number;
  guardsMinusOne: number;
  guardsDeployed: number;
  boats: number;
  boatsAway: number;
  openRequests: number;
}

export interface TowerTemplateDto {
  id: number;
  name: string;
  callSign: string | null;
  latitude: number | null;
  longitude: number | null;
  requiredStaff: number;
  createdAt: string;
}

export interface BoatTemplateDto {
  id: number;
  name: string;
  callSign: string | null;
  status: BoatStatus;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface AuditEntryDto {
  id: number;
  userId: number | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: unknown;
  ipAddress: string | null;
  timestamp: string;
}

/** WebSocket-Broadcast-Typen. */
export type WsEventType =
  | 'connected'
  | 'towers-updated'
  | 'guards-updated'
  | 'boats-updated'
  | 'requests-updated'
  | 'users-updated';
