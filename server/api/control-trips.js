// ============================================================
// Kontrollfahrt-Anfragen – Bootsführer beantragen, Hauptwache/Wachführer
// genehmigen oder lehnen ab.
//
// BEWUSST GROB: vorerst nur der Workflow-Rahmen (beantragen → genehmigen/ablehnen).
// Es wird noch KEIN Boot-Status o. Ä. gesetzt – diese Folgelogik kommt später.
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireRole } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const MAX_NOTE_LEN = 500;

router.use(requireAuth);

// GET /api/control-trips?status=PENDING – Anfragen auflisten (gemeinsames Lagebild)
router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    const where = ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? 'WHERE c.status = ?' : '';
    const rows = await dbAll(
      `SELECT c.*, b.name AS boat_name, b.call_sign AS boat_call_sign, b.tower_id AS boat_tower_id,
              t.name AS tower_name, ub.username AS requested_by_name, ud.username AS decided_by_name
         FROM control_trip_requests c
         JOIN boats b ON b.id = c.boat_id
         LEFT JOIN towers t ON t.id = b.tower_id
         LEFT JOIN users ub ON ub.id = c.requested_by
         LEFT JOIN users ud ON ud.id = c.decided_by
         ${where}
        ORDER BY c.created_at DESC`,
      where ? [status] : []
    );
    res.json({
      controlTrips: rows.map(c => ({
        id: c.id,
        boatId: c.boat_id,
        boatName: c.boat_name,
        boatCallSign: c.boat_call_sign,
        towerId: c.boat_tower_id,
        towerName: c.tower_name,
        note: c.note,
        status: c.status,
        rejectionReason: c.rejection_reason,
        requestedBy: c.requested_by_name,
        decidedBy: c.decided_by_name,
        createdAt: c.created_at,
        decidedAt: c.decided_at
      }))
    });
  } catch (error) {
    console.error('Get control trips error:', error);
    res.status(500).json({ error: 'Failed to fetch control trips' });
  }
});

// POST /api/control-trips – Kontrollfahrt beantragen [BOOTSFUEHRER]
router.post('/', requireRole('BOOTSFUEHRER'), express.json(), async (req, res) => {
  try {
    const boatId = parsePositiveInt(req.body.boatId);
    const { note } = req.body;
    if (!boatId) return res.status(400).json({ error: 'boatId erforderlich' });
    if (note && (typeof note !== 'string' || note.length > MAX_NOTE_LEN)) {
      return res.status(400).json({ error: 'Notiz zu lang' });
    }

    const boat = await dbGet('SELECT id FROM boats WHERE id = ?', [boatId]);
    if (!boat) return res.status(404).json({ error: 'Boat not found' });

    // Keine doppelte offene Anfrage pro Boot.
    const open = await dbGet(
      "SELECT id FROM control_trip_requests WHERE boat_id = ? AND status = 'PENDING'",
      [boatId]
    );
    if (open) return res.status(409).json({ error: 'Es existiert bereits eine offene Kontrollfahrt-Anfrage für dieses Boot' });

    const result = await dbRun(
      'INSERT INTO control_trip_requests (boat_id, requested_by, note) VALUES (?, ?, ?)',
      [boatId, req.user.id, note || null]
    );
    await recordAudit(req, 'control_trip_create', 'control_trip', result.lastID, { boatId });
    broadcast('control-trips-updated');
    res.status(201).json({ id: result.lastID, message: 'Kontrollfahrt beantragt' });
  } catch (error) {
    console.error('Create control trip error:', error);
    res.status(500).json({ error: 'Failed to create control trip' });
  }
});

// Lädt eine Anfrage und prüft, dass der Wachführer (falls nicht Hauptwache) nur
// Kontrollfahrten von Booten der EIGENEN Wache entscheidet.
async function loadDecidable(req, id) {
  const row = await dbGet(
    `SELECT c.*, b.tower_id AS boat_tower_id FROM control_trip_requests c
       JOIN boats b ON b.id = c.boat_id WHERE c.id = ?`,
    [id]
  );
  if (!row) return { error: 404 };
  if (req.user.role !== 'HAUPTWACHE' && row.boat_tower_id !== req.user.tower_id) return { error: 403 };
  return { row };
}

// POST /api/control-trips/:id/approve [HAUPTWACHE | WACHFUEHRER(eigene Wache)]
router.post('/:id/approve', requireRole('WACHFUEHRER'), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Anfrage-ID' });
    const { row, error } = await loadDecidable(req, id);
    if (error === 404) return res.status(404).json({ error: 'Request not found' });
    if (error === 403) return res.status(403).json({ error: 'Keine Berechtigung für diese Wache' });
    if (row.status !== 'PENDING') return res.status(409).json({ error: 'Anfrage ist nicht mehr offen' });

    await dbRun(
      "UPDATE control_trip_requests SET status = 'APPROVED', decided_at = CURRENT_TIMESTAMP, decided_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await recordAudit(req, 'control_trip_approve', 'control_trip', id);
    broadcast('control-trips-updated');
    res.json({ id, message: 'Genehmigt' });
  } catch (error) {
    console.error('Approve control trip error:', error);
    res.status(500).json({ error: 'Failed to approve control trip' });
  }
});

// POST /api/control-trips/:id/reject [HAUPTWACHE | WACHFUEHRER(eigene Wache)]
router.post('/:id/reject', requireRole('WACHFUEHRER'), express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Anfrage-ID' });
    const { row, error } = await loadDecidable(req, id);
    if (error === 404) return res.status(404).json({ error: 'Request not found' });
    if (error === 403) return res.status(403).json({ error: 'Keine Berechtigung für diese Wache' });
    if (row.status !== 'PENDING') return res.status(409).json({ error: 'Anfrage ist nicht mehr offen' });

    const rejection = (req.body.rejectionReason || '').slice(0, MAX_NOTE_LEN) || null;
    await dbRun(
      "UPDATE control_trip_requests SET status = 'REJECTED', decided_at = CURRENT_TIMESTAMP, decided_by = ?, rejection_reason = ? WHERE id = ?",
      [req.user.id, rejection, id]
    );
    await recordAudit(req, 'control_trip_reject', 'control_trip', id);
    broadcast('control-trips-updated');
    res.json({ id, message: 'Abgelehnt' });
  } catch (error) {
    console.error('Reject control trip error:', error);
    res.status(500).json({ error: 'Failed to reject control trip' });
  }
});

module.exports = router;
