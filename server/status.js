// ============================================================
// status.js – Reine Statuslogik (DOM-/DB-frei, daher gut testbar)
// ============================================================

/**
 * Turmfarbe aus Ist-/Soll-Besetzung ableiten.
 * besetzt = Wachgänger mit Status IN_AREA.
 *   GREEN  ≥ Sollstärke
 *   YELLOW ≥ 50 % der Sollstärke
 *   RED    sonst
 * @returns {'GREEN'|'YELLOW'|'RED'}
 */
function deriveTowerStatus(currentStaff, requiredStaff) {
  const req = requiredStaff || 1;
  if (currentStaff >= req) return 'GREEN';
  if (currentStaff >= req / 2) return 'YELLOW';
  return 'RED';
}

/**
 * Beitrag EINES Boots zur Sollstärke seines Turms, abhängig vom Boots-Status.
 *   AT_TOWER       → +1 (Boot liegt am Turm → zusätzlicher Bootsführer, 2 WF + 1 BF)
 *   OUT_OF_SERVICE →  0 (Boot defekt → wie normaler Turm, keine Boots-Crew nötig)
 *   PATROL/DEPLOYED→ -1 (Boot unterwegs → Bootsführer ist nicht am Turm)
 *   sonst          →  0
 * @returns {number}
 */
function boatStaffDelta(boatStatus) {
  switch (boatStatus) {
    case 'AT_TOWER': return 1;
    case 'PATROL':
    case 'DEPLOYED': return -1;
    case 'OUT_OF_SERVICE':
    default: return 0;
  }
}

/**
 * Effektive Sollstärke eines Turms = Basis-Soll (Standard 2) plus die Summe der
 * Boots-Beiträge, mindestens 1. Ein Turm braucht standardmäßig 2 Wachgänger;
 * liegt ein Boot am Turm, kommt ein Bootsführer hinzu (→ 3 = 2 WF + 1 BF).
 * @param {number} baseRequired  gespeicherte Basis-Sollstärke des Turms
 * @param {string[]} boatStatuses Status aller dem Turm zugeordneten Boote
 * @returns {number}
 */
function effectiveRequiredStaff(baseRequired, boatStatuses) {
  const base = baseRequired || 2;
  const delta = (boatStatuses || []).reduce((sum, st) => sum + boatStaffDelta(st), 0);
  return Math.max(1, base + delta);
}

/**
 * Boots-Lage eines Turms für die Anzeige zusammenfassen.
 * @param {string[]} boatStatuses Status aller dem Turm zugeordneten Boote
 * @returns {{hasBoat:boolean, atTower:number, away:number, broken:number, warning:boolean}}
 *   warning = mindestens ein Boot ist unterwegs (auf Streife / im Einsatz) → nicht am Turm.
 */
function summarizeBoats(boatStatuses) {
  const list = boatStatuses || [];
  const away = list.filter(s => s === 'PATROL' || s === 'DEPLOYED').length;
  return {
    hasBoat: list.length > 0,
    atTower: list.filter(s => s === 'AT_TOWER').length,
    away,
    broken: list.filter(s => s === 'OUT_OF_SERVICE').length,
    warning: away > 0
  };
}

module.exports = { deriveTowerStatus, boatStaffDelta, effectiveRequiredStaff, summarizeBoats };
