// ============================================================
// status.ts – Reine Statuslogik (DOM-/DB-frei, testbar).
// Server UND Client importieren diese eine Quelle → keine Duplikat-Logik mehr.
// ============================================================

import type { BoatStatus, TowerStatus } from './config.js';

/**
 * Turmfarbe aus Ist-/Soll-Besetzung ableiten.
 *   GREEN  ≥ Sollstärke
 *   YELLOW ≥ 50 % der Sollstärke
 *   RED    sonst
 */
export function deriveTowerStatus(currentStaff: number, requiredStaff: number): TowerStatus {
  const req = requiredStaff || 1;
  if (currentStaff >= req) return 'GREEN';
  if (currentStaff >= req / 2) return 'YELLOW';
  return 'RED';
}

/**
 * Beitrag EINES Boots zur Sollstärke seines Turms, abhängig vom Boots-Status.
 *   AT_TOWER       → +1 (Boot liegt am Turm → zusätzlicher Bootsführer, 2 WF + 1 BF)
 *   OUT_OF_SERVICE →  0 (Boot defekt → wie normaler Turm)
 *   PATROL/DEPLOYED→ -1 (Boot unterwegs → Bootsführer nicht am Turm)
 *   sonst          →  0
 */
export function boatStaffDelta(boatStatus: BoatStatus | string | undefined): number {
  switch (boatStatus) {
    case 'AT_TOWER':
      return 1;
    case 'PATROL':
    case 'DEPLOYED':
      return -1;
    case 'OUT_OF_SERVICE':
    default:
      return 0;
  }
}

/**
 * Effektive Sollstärke = Basis-Soll (Standard 2) + Summe der Boots-Beiträge, mindestens 1.
 */
export function effectiveRequiredStaff(
  baseRequired: number | undefined,
  boatStatuses: (BoatStatus | string)[] | undefined
): number {
  const base = baseRequired || 2;
  const delta = (boatStatuses ?? []).reduce((sum, st) => sum + boatStaffDelta(st), 0);
  return Math.max(1, base + delta);
}

export interface BoatSummary {
  hasBoat: boolean;
  atTower: number;
  away: number;
  broken: number;
  /** warning = mindestens ein Boot ist unterwegs (Streife/Einsatz) → nicht am Turm. */
  warning: boolean;
}

/** Boots-Lage eines Turms für die Anzeige zusammenfassen. */
export function summarizeBoats(boatStatuses: (BoatStatus | string)[] | undefined): BoatSummary {
  const list = boatStatuses ?? [];
  const away = list.filter((s) => s === 'PATROL' || s === 'DEPLOYED').length;
  return {
    hasBoat: list.length > 0,
    atTower: list.filter((s) => s === 'AT_TOWER').length,
    away,
    broken: list.filter((s) => s === 'OUT_OF_SERVICE').length,
    warning: away > 0
  };
}
