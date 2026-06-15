// ============================================================
// Türme-API – Liste mit abgeleitetem Status, CRUD (Hauptwache/Turmführer)
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireRole } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');
const { deriveTowerStatus } = require('../status');

const MAX_NAME_LEN = 120;

router.use(requireAuth);

// GET /api/towers – alle Türme mit abgeleitetem Status + Besetzungszahl
router.get('/', async (req, res) => {
  try {
    const towers = await dbAll('SELECT * FROM towers ORDER BY name');
    const counts = await dbAll(
      "SELECT tower_id, COUNT(*) AS n FROM guards WHERE status = 'IN_AREA' AND tower_id IS NOT NULL GROUP BY tower_id"
    );
    const byTower = Object.fromEntries(counts.map(c => [c.tower_id, c.n]));
    res.json({
      towers: towers.map(t => {
        const current = byTower[t.id] || 0;
        return {
          id: t.id,
          name: t.name,
          callSign: t.call_sign,
          latitude: t.latitude,
          longitude: t.longitude,
          requiredStaff: t.required_staff,
          currentStaff: current,
          status: deriveTowerStatus(current, t.required_staff)
        };
      })
    });
  } catch (error) {
    console.error('Get towers error:', error);
    res.status(500).json({ error: 'Failed to fetch towers' });
  }
});

// POST /api/towers – Turm anlegen [HAUPTWACHE]
router.post('/', requireRole('HAUPTWACHE'), express.json(), async (req, res) => {
  try {
    const { name, callSign, latitude, longitude, requiredStaff } = req.body;
    if (!name || typeof name !== 'string' || name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: 'Ungültiger oder fehlender Name' });
    }
    const result = await dbRun(
      'INSERT INTO towers (name, call_sign, latitude, longitude, required_staff) VALUES (?, ?, ?, ?, ?)',
      [name, callSign || null, latitude ?? null, longitude ?? null, Number(requiredStaff) || 2]
    );
    await recordAudit(req, 'tower_create', 'tower', result.lastID, { name });
    broadcast('towers-updated');
    res.status(201).json({ id: result.lastID, message: 'Tower created' });
  } catch (error) {
    console.error('Create tower error:', error);
    res.status(500).json({ error: 'Failed to create tower' });
  }
});

// PATCH /api/towers/:id – bearbeiten [HAUPTWACHE | TURMFUEHRER(eigener Turm)]
router.patch('/:id', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Turm-ID' });

    // Turmführer darf nur den eigenen Turm bearbeiten; Hauptwache jeden.
    if (req.user.role !== 'HAUPTWACHE') {
      if (req.user.role !== 'TURMFUEHRER' || req.user.tower_id !== id) {
        return res.status(403).json({ error: 'Keine Berechtigung für diesen Turm' });
      }
    }

    const tower = await dbGet('SELECT * FROM towers WHERE id = ?', [id]);
    if (!tower) return res.status(404).json({ error: 'Tower not found' });

    const { name, callSign, latitude, longitude, requiredStaff } = req.body;
    if (name !== undefined && (typeof name !== 'string' || !name || name.length > MAX_NAME_LEN)) {
      return res.status(400).json({ error: 'Ungültiger Name' });
    }

    await dbRun(
      `UPDATE towers SET
         name = ?, call_sign = ?, latitude = ?, longitude = ?, required_staff = ?
       WHERE id = ?`,
      [
        name ?? tower.name,
        callSign ?? tower.call_sign,
        latitude ?? tower.latitude,
        longitude ?? tower.longitude,
        requiredStaff !== undefined ? Number(requiredStaff) || tower.required_staff : tower.required_staff,
        id
      ]
    );
    await recordAudit(req, 'tower_update', 'tower', id);
    broadcast('towers-updated');
    res.json({ id, message: 'Tower updated' });
  } catch (error) {
    console.error('Update tower error:', error);
    res.status(500).json({ error: 'Failed to update tower' });
  }
});

// DELETE /api/towers/:id [HAUPTWACHE]
router.delete('/:id', requireRole('HAUPTWACHE'), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Turm-ID' });

    const tower = await dbGet('SELECT id FROM towers WHERE id = ?', [id]);
    if (!tower) return res.status(404).json({ error: 'Tower not found' });

    await dbRun('DELETE FROM towers WHERE id = ?', [id]);
    await recordAudit(req, 'tower_delete', 'tower', id);
    broadcast('towers-updated');
    res.json({ message: 'Tower deleted' });
  } catch (error) {
    console.error('Delete tower error:', error);
    res.status(500).json({ error: 'Failed to delete tower' });
  }
});

module.exports = router;
