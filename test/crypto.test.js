const { test } = require('node:test');
const assert = require('node:assert');

// MASTER_SECRET/SALT vor dem Laden setzen (deriveKey liest sie aus env)
process.env.MASTER_SECRET = process.env.MASTER_SECRET || '0123456789012345678901234567890123';
process.env.SALT = process.env.SALT || '0123456789012345';

const { encryptState, decryptState } = require('../server/db/crypto');

test('encrypt/decrypt round-trip (gleicher User)', () => {
  const plain = JSON.stringify({ hello: 'welt', n: 42 });
  const { encrypted, iv, authTag } = encryptState(plain, 1);
  const back = decryptState(encrypted, iv, authTag, 1);
  assert.strictEqual(back, plain);
});

test('Entschlüsselung mit falschem User-Key schlägt fehl', () => {
  const plain = JSON.stringify({ secret: true });
  const { encrypted, iv, authTag } = encryptState(plain, 1);
  assert.throws(() => decryptState(encrypted, iv, authTag, 2));
});
