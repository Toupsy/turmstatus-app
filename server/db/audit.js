// ============================================================
// Audit-Helfer – schreibt Mutationen ins audit_log (über die zentrale Verbindung)
// ============================================================

const { dbRun } = require('./connection');
const { clientIpFromHeaders } = require('../http-common');

/** Client-IP aus Cloudflare-/Reverse-Proxy-Headern oder req.ip ableiten. */
function clientIp(req) {
  return clientIpFromHeaders(req) || req.ip || null;
}

/**
 * Audit-Eintrag schreiben (fire-and-forget-freundlich, aber awaitbar).
 * Fehler werden geloggt, nicht geworfen – Audit darf die Mutation nie blockieren.
 */
async function recordAudit(req, action, entityType = null, entityId = null, details = null) {
  try {
    await dbRun(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.session?.userId || null,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        clientIp(req)
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { recordAudit, clientIp };
