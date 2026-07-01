// ============================================================
// config.ts – Enums/Labels + Karten-Defaults (Single Source of Truth)
// Wird von Server (GET /api/config) und von den SPAs importiert.
// ============================================================

export const ROLES = ['HAUPTWACHE', 'WACHFUEHRER', 'WACHGAENGER', 'BOOTSFUEHRER'] as const;
export type Role = (typeof ROLES)[number];

export const GUARD_STATUSES = ['IN_AREA', 'MINUS_ONE', 'DEPLOYED', 'BREAK'] as const;
export type GuardStatus = (typeof GUARD_STATUSES)[number];

export const BOAT_STATUSES = ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'] as const;
export type BoatStatus = (typeof BOAT_STATUSES)[number];

export const TOWER_STATUSES = ['GREEN', 'YELLOW', 'RED'] as const;
export type TowerStatus = (typeof TOWER_STATUSES)[number];

export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REASONS = ['PAUSE', 'TOILET', 'CATERING', 'MATERIAL', 'OTHER'] as const;
export type Reason = (typeof REASONS)[number];

export const config = {
  roles: ROLES,
  roleLabels: {
    HAUPTWACHE: 'Hauptwache',
    WACHFUEHRER: 'Wachführer',
    WACHGAENGER: 'Wachgänger',
    BOOTSFUEHRER: 'Bootsführer'
  } satisfies Record<Role, string>,
  requestStatus: {
    PENDING: 'Offen',
    APPROVED: 'Genehmigt',
    REJECTED: 'Abgelehnt',
    RETURNED: 'Zurück (+1)'
  } satisfies Record<RequestStatus, string>,
  guardStatus: {
    IN_AREA: 'Im Bereich',
    MINUS_ONE: '-1 (Bereich verlassen)',
    DEPLOYED: 'Im Einsatz',
    BREAK: 'Pause'
  } satisfies Record<GuardStatus, string>,
  boatStatus: {
    AT_TOWER: 'Am Turm',
    PATROL: 'Streife',
    DEPLOYED: 'Im Einsatz',
    OUT_OF_SERVICE: 'Außer Dienst'
  } satisfies Record<BoatStatus, string>,
  towerStatus: {
    GREEN: 'Besetzt',
    YELLOW: 'Reduziert',
    RED: 'Kritisch'
  } satisfies Record<TowerStatus, string>,
  reasons: {
    PAUSE: 'Pause',
    TOILET: 'Toilette',
    CATERING: 'Verpflegung',
    MATERIAL: 'Material',
    OTHER: 'Sonstiges'
  } satisfies Record<Reason, string>,
  map: {
    center: [54.21449, 11.08967] as [number, number], // DLRG Hauptwache Dahme
    zoom: 15,
    minZoom: 7,
    bounds: [
      [53.3, 7.2],
      [55.2, 11.4]
    ] as [[number, number], [number, number]], // Schleswig-Holstein
    seaBearing: 90, // Osten (Seeseite)
    patrolOffsetMeters: 150
  }
} as const;

export type AppConfig = typeof config;
