// ============================================================
// Wachgänger-API – Lageobjekte, Status & Position
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireRole } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const GUARD_STATUS = ['IN_AREA', 'MINUS_ONE', 'DEPLOYED', 'BREAK'];

router.use(requireAuth);

// GET /api/guards – alle Wachgänger (gemeinsames Lagebild)
router.get('/', async (req, res) => {
  try {
    const guards = await dbAll(
      `SELECT g.*, t.name AS tower_name
         FROM guards g LEFT JOIN towers t ON t.id = g.tower_id
        ORDER BY g.name`
    );
    res.json({
      guards: guards.map(g => ({
        id: g.id,
        userId: g.user_id,
        towerId: g.tower_id,
        towerName: g.tower_name,
        name: g.name,
        status: g.status,
        latitude: g.latitude,
        longitude: g.longitude,
        updatedAt: g.updated_at
      }))
    });
  } catch (error) {
    console.error('Get guards error:', error);
    res.status(500).json({ error: 'Failed to fetch guards' });
  }
});

// POST /api/guards – Wachgänger anlegen [HAUPTWACHE]
router.post('/', requireRole('HAUPTWACHE'), express.json(), async (req, res) => {
  try {
    const { name, towerId, userId, latitude, longitude } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name erforderlich' });

    const result = await dbRun(
      'INSERT INTO guards (name, tower_id, user_id, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
      [name, towerId ? parsePositiveInt(towerId) : null, userId ? parsePositiveInt(userId) : null, latitude ?? null, longitude ?? null]
    );
    await recordAudit(req, 'guard_create', 'guard', result.lastID, { name });
    broadcast('guards-updated');
    res.status(201).json({ id: result.lastID, message: 'Guard created' });
  } catch (error) {
    console.error('Create guard error:', error);
    res.status(500).json({ error: 'Failed to create guard' });
  }
});

// Hilfsfunktion: darf der aktuelle User diesen Wachgänger ändern?
function canModifyGuard(user, guard) {
  if (user.role === 'HAUPTWACHE') return true;
  if (user.role === 'WACHFUEHRER' && guard.tower_id === user.tower_id) return true;
  if (guard.user_id && guard.user_id === user.id) return true; // eigener Wachgänger
  return false;
}

// PATCH /api/guards/:id/status – Status setzen
router.patch('/:id/status', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Wachgänger-ID' });

    const status = req.body.status;
    if (!GUARD_STATUS.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

    const guard = await dbGet('SELECT * FROM guards WHERE id = ?', [id]);
    if (!guard) return res.status(404).json({ error: 'Guard not found' });
    if (!canModifyGuard(req.user, guard)) return res.status(403).json({ error: 'Keine Berechtigung' });

    await dbRun('UPDATE guards SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    await recordAudit(req, 'guard_status', 'guard', id, { status });
    broadcast('guards-updated');
    res.json({ id, status, message: 'Status updated' });
  } catch (error) {
    console.error('Update guard status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/guards/:id/position – Position aktualisieren
router.patch('/:id/position', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Wachgänger-ID' });

    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'latitude/longitude erforderlich (Zahl)' });
    }

    const guard = await dbGet('SELECT * FROM guards WHERE id = ?', [id]);
    if (!guard) return res.status(404).json({ error: 'Guard not found' });
    if (!canModifyGuard(req.user, guard)) return res.status(403).json({ error: 'Keine Berechtigung' });

    await dbRun('UPDATE guards SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [latitude, longitude, id]);
    broadcast('guards-updated');
    res.json({ id, message: 'Position updated' });
  } catch (error) {
    console.error('Update guard position error:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// DELETE /api/guards/:id [HAUPTWACHE]
router.delete('/:id', requireRole('HAUPTWACHE'), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Wachgänger-ID' });
    const guard = await dbGet('SELECT id FROM guards WHERE id = ?', [id]);
    if (!guard) return res.status(404).json({ error: 'Guard not found' });

    await dbRun('DELETE FROM guards WHERE id = ?', [id]);
    await recordAudit(req, 'guard_delete', 'guard', id);
    broadcast('guards-updated');
    res.json({ message: 'Guard deleted' });
  } catch (error) {
    console.error('Delete guard error:', error);
    res.status(500).json({ error: 'Failed to delete guard' });
  }
});

module.exports = router;
