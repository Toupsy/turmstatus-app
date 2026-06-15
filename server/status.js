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

module.exports = { deriveTowerStatus };
