const { test } = require('node:test');
const assert = require('node:assert');
const { deriveTowerStatus } = require('../server/status');

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
