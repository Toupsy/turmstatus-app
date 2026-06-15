// ============================================================
// Verschlüsselung (AES-256-GCM, pro-User abgeleiteter Key)
// ============================================================
// Identisch zum Wachplan-Generator: dieselbe deriveKey/encrypt/decrypt-API,
// damit beim späteren Zusammenführen beider Apps die Plan-Verschlüsselung
// ohne Anpassung übernommen werden kann. Im Turmstatus-Lagebild werden derzeit
// keine verschlüsselten Blobs gespeichert (Live-Daten), die Schicht steht aber
// bereit (z. B. für künftige Einsatz-/Wachplan-Daten).

const crypto = require('crypto');

const _keyCache = new Map();

function deriveKey(userId) {
  const cacheKey = String(userId);
  let key = _keyCache.get(cacheKey);
  if (!key) {
    key = crypto.pbkdf2Sync(
      userId + process.env.MASTER_SECRET,
      process.env.SALT,
      100000,
      32,
      'sha256'
    );
    _keyCache.set(cacheKey, key);
  }
  return key;
}

function encryptState(plainJSON, userId) {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainJSON, 'utf8'),
    cipher.final()
  ]);

  return { encrypted, iv, authTag: cipher.getAuthTag() };
}

function decryptState(encrypted, iv, authTag, userId) {
  const key = deriveKey(userId);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

module.exports = { deriveKey, encryptState, decryptState };
