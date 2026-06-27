// ============================================================
// Boote-API – Rettungsboote: Liste, CRUD, Status/Position
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireRole } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const BOAT_STATUS = ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];

router.use(requireAuth);

// GET /api/boats
router.get('/', async (req, res) => {
  try {
    const boats = await dbAll(
      `SELECT b.*, t.name AS tower_name
         FROM boats b LEFT JOIN towers t ON t.id = b.tower_id
        ORDER BY b.name`
    );
    res.json({
      boats: boats.map(b => ({
        id: b.id,
        name: b.name,
        callSign: b.call_sign,
        towerId: b.tower_id,
        towerName: b.tower_name,
        status: b.status,
        latitude: b.latitude,
        longitude: b.longitude,
        updatedAt: b.updated_at
      }))
    });
  } catch (error) {
    console.error('Get boats error:', error);
    res.status(500).json({ error: 'Failed to fetch boats' });
  }
});

// POST /api/boats [WACHFUEHRER | HAUPTWACHE-Fallback]
router.post('/', requireRole('WACHFUEHRER'), express.json(), async (req, res) => {
  try {
    const { name, callSign, towerId, status, latitude, longitude } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name erforderlich' });
    if (status && !BOAT_STATUS.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

    const result = await dbRun(
      'INSERT INTO boats (name, call_sign, tower_id, status, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
      [name, callSign || null, towerId ? parsePositiveInt(towerId) : null, status || 'AT_TOWER', latitude ?? null, longitude ?? null]
    );
    await recordAudit(req, 'boat_create', 'boat', result.lastID, { name });
    broadcast('boats-updated');
    res.status(201).json({ id: result.lastID, message: 'Boat created' });
  } catch (error) {
    console.error('Create boat error:', error);
    res.status(500).json({ error: 'Failed to create boat' });
  }
});

// PATCH /api/boats/:id – Status/Position/Stammdaten/Turm-Zuordnung [WACHFUEHRER | HAUPTWACHE-Fallback]
router.patch('/:id', requireRole('WACHFUEHRER'), express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Boot-ID' });

    const boat = await dbGet('SELECT * FROM boats WHERE id = ?', [id]);
    if (!boat) return res.status(404).json({ error: 'Boat not found' });

    const { name, callSign, towerId, status, latitude, longitude } = req.body;
    if (status && !BOAT_STATUS.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

    await dbRun(
      `UPDATE boats SET name = ?, call_sign = ?, tower_id = ?, status = ?, latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name ?? boat.name,
        callSign ?? boat.call_sign,
        towerId !== undefined ? (towerId ? parsePositiveInt(towerId) : null) : boat.tower_id,
        status ?? boat.status,
        latitude ?? boat.latitude,
        longitude ?? boat.longitude,
        id
      ]
    );
    await recordAudit(req, 'boat_update', 'boat', id, status ? { status } : null);
    broadcast('boats-updated');
    res.json({ id, message: 'Boat updated' });
  } catch (error) {
    console.error('Update boat error:', error);
    res.status(500).json({ error: 'Failed to update boat' });
  }
});

// DELETE /api/boats/:id [WACHFUEHRER | HAUPTWACHE-Fallback]
router.delete('/:id', requireRole('WACHFUEHRER'), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Boot-ID' });
    const boat = await dbGet('SELECT id FROM boats WHERE id = ?', [id]);
    if (!boat) return res.status(404).json({ error: 'Boat not found' });

    await dbRun('DELETE FROM boats WHERE id = ?', [id]);
    await recordAudit(req, 'boat_delete', 'boat', id);
    broadcast('boats-updated');
    res.json({ message: 'Boat deleted' });
  } catch (error) {
    console.error('Delete boat error:', error);
    res.status(500).json({ error: 'Failed to delete boat' });
  }
});

module.exports = router;
