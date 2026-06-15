const { test } = require('node:test');
const assert = require('node:assert');
const { parsePositiveInt } = require('../server/db/ids');

test('parsePositiveInt: gültige positive Ganzzahlen', () => {
  assert.strictEqual(parsePositiveInt('1'), 1);
  assert.strictEqual(parsePositiveInt('42'), 42);
  assert.strictEqual(parsePositiveInt(7), 7);
});

test('parsePositiveInt: ungültige Eingaben → null', () => {
  assert.strictEqual(parsePositiveInt('5abc'), null);  // keine teilgeparsten IDs
  assert.strictEqual(parsePositiveInt('0'), null);
  assert.strictEqual(parsePositiveInt('-3'), null);
  assert.strictEqual(parsePositiveInt(''), null);
  assert.strictEqual(parsePositiveInt(undefined), null);
  assert.strictEqual(parsePositiveInt('1.5'), null);
});
