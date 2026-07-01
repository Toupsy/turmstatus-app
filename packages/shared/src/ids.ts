// ============================================================
// ids.ts – Sicheres Parsing numerischer Route-IDs.
// Akzeptiert ausschließlich positive Ganzzahlen. '5abc' (parseInt → 5),
// '' / undefined (→ NaN) oder '1.5' ergeben null, damit keine
// ungültigen/teilgeparsten Werte in DB-Queries fließen.
// ============================================================

/** @returns positive Ganzzahl oder null bei ungültiger Eingabe */
export function parsePositiveInt(paramStr: unknown): number | null {
  const id = parseInt(paramStr as string, 10);
  return Number.isInteger(id) && id > 0 && String(id) === String(paramStr).trim() ? id : null;
}
