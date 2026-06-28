const { test } = require('node:test');
const assert = require('node:assert');
const {
  deriveTowerStatus,
  boatStaffDelta,
  effectiveRequiredStaff,
  summarizeBoats
} = require('../server/status');

test('deriveTowerStatus: voll besetzt → GREEN', () => {
  assert.strictEqual(deriveTowerStatus(2, 2), 'GREEN');
  assert.strictEqual(deriveTowerStatus(3, 2), 'GREEN');
});

test('deriveTowerStatus: halb besetzt → YELLOW', () => {
  assert.strictEqual(deriveTowerStatus(1, 2), 'YELLOW');
  assert.strictEqual(deriveTowerStatus(2, 4), 'YELLOW');
});

test('deriveTowerStatus: unterbesetzt → RED', () => {
  assert.strictEqual(deriveTowerStatus(0, 2), 'RED');
  assert.strictEqual(deriveTowerStatus(1, 4), 'RED');
});

test('deriveTowerStatus: Sollstärke 0 wird als 1 behandelt', () => {
  assert.strictEqual(deriveTowerStatus(0, 0), 'RED');
  assert.strictEqual(deriveTowerStatus(1, 0), 'GREEN');
});

test('boatStaffDelta: Boots-Status → Beitrag zur Sollstärke', () => {
  assert.strictEqual(boatStaffDelta('AT_TOWER'), 1);        // +1 Bootsführer
  assert.strictEqual(boatStaffDelta('PATROL'), -1);         // Boot unterwegs
  assert.strictEqual(boatStaffDelta('DEPLOYED'), -1);       // Boot im Einsatz
  assert.strictEqual(boatStaffDelta('OUT_OF_SERVICE'), 0);  // defekt → wie normal
  assert.strictEqual(boatStaffDelta(undefined), 0);
});

test('effectiveRequiredStaff: Standard-Turm ohne Boot → Basis (2)', () => {
  assert.strictEqual(effectiveRequiredStaff(2, []), 2);
  assert.strictEqual(effectiveRequiredStaff(undefined, []), 2); // Default 2
});

test('effectiveRequiredStaff: Boot am Turm → 2 WF + 1 BF = 3', () => {
  assert.strictEqual(effectiveRequiredStaff(2, ['AT_TOWER']), 3);
});

test('effectiveRequiredStaff: Boot außer Dienst → wie normaler Turm (2)', () => {
  assert.strictEqual(effectiveRequiredStaff(2, ['OUT_OF_SERVICE']), 2);
});

test('effectiveRequiredStaff: Boot auf Streife/Einsatz → 1 (Boot weg)', () => {
  assert.strictEqual(effectiveRequiredStaff(2, ['PATROL']), 1);
  assert.strictEqual(effectiveRequiredStaff(2, ['DEPLOYED']), 1);
});

test('effectiveRequiredStaff: nie unter 1', () => {
  assert.strictEqual(effectiveRequiredStaff(1, ['PATROL']), 1);
  assert.strictEqual(effectiveRequiredStaff(2, ['PATROL', 'DEPLOYED', 'PATROL']), 1);
});

test('summarizeBoats: Lage zusammenfassen + Warnung bei Boot unterwegs', () => {
  assert.deepStrictEqual(summarizeBoats([]), { hasBoat: false, atTower: 0, away: 0, broken: 0, warning: false });
  assert.deepStrictEqual(summarizeBoats(['AT_TOWER']), { hasBoat: true, atTower: 1, away: 0, broken: 0, warning: false });
  assert.deepStrictEqual(summarizeBoats(['PATROL']), { hasBoat: true, atTower: 0, away: 1, broken: 0, warning: true });
  assert.deepStrictEqual(summarizeBoats(['OUT_OF_SERVICE']), { hasBoat: true, atTower: 0, away: 0, broken: 1, warning: false });
});
