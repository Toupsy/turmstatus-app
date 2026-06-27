// ============================================================
// -1 / +1 Workflow-API (Bereich verlassen / Rückkehr) – scoped
// beantragen → genehmigen/ablehnen → Rückkehr
//
// Mandanten-Modell (Scope-Isolation): Anfragen betreffen immer einen Wachgänger,
// der genau einem Wachführer gehört (guard.owner_id). Jeder sieht nur Anfragen seines
// eigenen Scopes; genehmigen/ablehnen darf NUR der Wachführer, dem der Wachgänger
// gehört. Der App-Admin sieht alles (read-only), darf aber NICHT entscheiden.
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireRole, viewScope } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const REASONS = ['PAUSE', 'TOILET', 'CATERING', 'MATERIAL', 'OTHER'];
const MAX_NOTE_LEN = 500;

router.use(requireAuth);

// GET /api/requests?status=PENDING – Anfragen des eigenen Scopes (Admin: alle)
router.get('/', async (req, res) => {
  try {
    const scope = viewScope(req.user);
    const status = req.query.status;
    const conds = [];
    const params = [];
    if (['APPROVED', 'PENDING', 'REJECTED', 'RETURNED'].includes(status)) { conds.push('r.status = ?'); params.push(status); }
    if (!scope.all) { conds.push('g.owner_id = ?'); params.push(scope.scopeId); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const rows = await dbAll(
      `SELECT r.*, g.name AS guard_name, g.tower_id AS guard_tower_id, g.owner_id AS guard_owner_id, t.name AS tower_name,
              ub.username AS requested_by_name, ud.username AS decided_by_name
         FROM minus_one_requests r
         JOIN guards g ON g.id = r.guard_id
         LEFT JOIN towers t ON t.id = g.tower_id
         LEFT JOIN users ub ON ub.id = r.requested_by
         LEFT JOIN users ud ON ud.id = r.decided_by
         ${where}
        ORDER BY r.created_at DESC`,
      params
    );
    res.json({
      requests: rows.map(r => ({
        id: r.id,
        guardId: r.guard_id,
        guardName: r.guard_name,
        towerId: r.guard_tower_id,
        towerName: r.tower_name,
        ownerId: r.guard_owner_id,
        reason: r.reason,
        note: r.note,
        status: r.status,
        rejectionReason: r.rejection_reason,
        requestedBy: r.requested_by_name,
        decidedBy: r.decided_by_name,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
        returnedAt: r.returned_at
      }))
    });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// POST /api/requests/minus-one – -1 beantragen [WACHGAENGER | BOOTSFUEHRER | WACHFUEHRER]
router.post('/minus-one', requireRole('WACHGAENGER', 'BOOTSFUEHRER', 'WACHFUEHRER'), express.json(), async (req, res) => {
  try {
    const guardId = parsePositiveInt(req.body.guardId);
    const { reason, note } = req.body;
    if (!guardId) return res.status(400).json({ error: 'guardId erforderlich' });
    if (!REASONS.includes(reason)) return res.status(400).json({ error: 'Ungültiger Grund' });
    if (note && (typeof note !== 'string' || note.length > MAX_NOTE_LEN)) {
      return res.status(400).json({ error: 'Notiz zu lang' });
    }

    const guard = await dbGet('SELECT * FROM guards WHERE id = ?', [guardId]);
    if (!guard) return res.status(404).json({ error: 'Guard not found' });

    // Nur im eigenen Scope beantragbar (Admin hat keinen Scope → 403).
    const scope = viewScope(req.user);
    if (scope.all || guard.owner_id !== scope.scopeId) {
      return res.status(403).json({ error: 'Wachgänger gehört nicht zur eigenen Wache' });
    }

    // Keine doppelte offene Anfrage pro Wachgänger
    const open = await dbGet(
      "SELECT id FROM minus_one_requests WHERE guard_id = ? AND status IN ('PENDING','APPROVED')",
      [guardId]
    );
    if (open) return res.status(409).json({ error: 'Es existiert bereits eine offene Anfrage für diesen Wachgänger' });

    const result = await dbRun(
      'INSERT INTO minus_one_requests (guard_id, requested_by, reason, note) VALUES (?, ?, ?, ?)',
      [guardId, req.user.id, reason, note || null]
    );
    await recordAudit(req, 'request_create', 'request', result.lastID, { guardId, reason });
    broadcast('requests-updated');
    res.status(201).json({ id: result.lastID, message: '-1 beantragt' });
  } catch (error) {
    console.error('Create minus-one error:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Hilfsfunktion: Anfrage in bestimmtem Status laden
async function loadRequest(id) {
  return dbGet('SELECT * FROM minus_one_requests WHERE id = ?', [id]);
}

// Genehmigen/Ablehnen darf NUR der Wachführer, dem der Wachgänger gehört (owner-Match).
// Der App-Admin hat bewusst KEINE Bestätigungsrechte (reine Ansicht).
async function loadDecidableRequest(req, id) {
  const reqRow = await loadRequest(id);
  if (!reqRow) return { error: 404, message: 'Request not found' };
  const guard = await dbGet('SELECT * FROM guards WHERE id = ?', [reqRow.guard_id]);
  if (req.user.role !== 'WACHFUEHRER' || !guard || guard.owner_id !== req.user.id) {
    return { error: 403, message: 'Nur der Wachführer der eigenen Wache darf entscheiden' };
  }
  return { reqRow, guard };
}

// POST /api/requests/:id/approve [WACHFUEHRER(Owner)] → Wachgänger auf MINUS_ONE
router.post('/:id/approve', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Anfrage-ID' });
    const { reqRow, error, message } = await loadDecidableRequest(req, id);
    if (error) return res.status(error).json({ error: message });
    if (reqRow.status !== 'PENDING') return res.status(409).json({ error: 'Anfrage ist nicht mehr offen' });

    await dbRun(
      "UPDATE minus_one_requests SET status = 'APPROVED', decided_at = CURRENT_TIMESTAMP, decided_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await dbRun("UPDATE guards SET status = 'MINUS_ONE', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reqRow.guard_id]);
    await recordAudit(req, 'request_approve', 'request', id);
    broadcast('requests-updated');
    res.json({ id, message: 'Genehmigt' });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// POST /api/requests/:id/reject [WACHFUEHRER(Owner)]
router.post('/:id/reject', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Anfrage-ID' });
    const { reqRow, error, message } = await loadDecidableRequest(req, id);
    if (error) return res.status(error).json({ error: message });
    if (reqRow.status !== 'PENDING') return res.status(409).json({ error: 'Anfrage ist nicht mehr offen' });

    const rejection = (req.body.rejectionReason || '').slice(0, MAX_NOTE_LEN) || null;
    await dbRun(
      "UPDATE minus_one_requests SET status = 'REJECTED', decided_at = CURRENT_TIMESTAMP, decided_by = ?, rejection_reason = ? WHERE id = ?",
      [req.user.id, rejection, id]
    );
    await recordAudit(req, 'request_reject', 'request', id);
    broadcast('requests-updated');
    res.json({ id, message: 'Abgelehnt' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// POST /api/requests/:id/return – +1 / Rückkehr melden [eigener Scope]
router.post('/:id/return', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Anfrage-ID' });
    const reqRow = await loadRequest(id);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    // Nur im eigenen Scope zurückmeldbar (Admin hat keinen Scope → 403).
    const guard = await dbGet('SELECT owner_id FROM guards WHERE id = ?', [reqRow.guard_id]);
    const scope = viewScope(req.user);
    if (scope.all || !guard || guard.owner_id !== scope.scopeId) {
      return res.status(403).json({ error: 'Anfrage gehört nicht zur eigenen Wache' });
    }
    if (reqRow.status !== 'APPROVED') return res.status(409).json({ error: 'Nur genehmigte Anfragen können zurückgemeldet werden' });

    await dbRun(
      "UPDATE minus_one_requests SET status = 'RETURNED', returned_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );
    await dbRun("UPDATE guards SET status = 'IN_AREA', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reqRow.guard_id]);
    await recordAudit(req, 'request_return', 'request', id);
    broadcast('requests-updated');
    res.json({ id, message: '+1 / Rückkehr gemeldet' });
  } catch (error) {
    console.error('Return request error:', error);
    res.status(500).json({ error: 'Failed to return request' });
  }
});

module.exports = router;
