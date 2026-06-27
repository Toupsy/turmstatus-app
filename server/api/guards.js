// ============================================================
// Wachgänger-API – Lageobjekte, Status & Position (Wachführer, scoped)
//
// Mandanten-Modell (Scope-Isolation): Jeder Wachgänger (Lageobjekt) gehört genau
// EINEM Wachführer (owner_id) und kann nur dessen eigenen Türmen zugeordnet werden.
// Admin sieht alle (read-only).
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireWachfuehrer, viewScope } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const GUARD_STATUS = ['IN_AREA', 'MINUS_ONE', 'DEPLOYED', 'BREAK'];

router.use(requireAuth);

// Prüft, ob ein Turm dem Wachführer gehört. towerId null = ok.
async function ownTowerOrNull(req, towerId) {
  if (!towerId) return { ok: true, value: null };
  const id = parsePositiveInt(towerId);
  if (!id) return { ok: false };
  const tower = await dbGet('SELECT owner_id FROM towers WHERE id = ?', [id]);
  if (!tower || tower.owner_id !== req.user.id) return { ok: false };
  return { ok: true, value: id };
}

// GET /api/guards – Wachgänger des eigenen Scopes (Admin: alle)
router.get('/', async (req, res) => {
  try {
    const scope = viewScope(req.user);
    const guards = scope.all
      ? await dbAll(`SELECT g.*, t.name AS tower_name FROM guards g LEFT JOIN towers t ON t.id = g.tower_id ORDER BY g.name`)
      : await dbAll(`SELECT g.*, t.name AS tower_name FROM guards g LEFT JOIN towers t ON t.id = g.tower_id WHERE g.owner_id = ? ORDER BY g.name`, [scope.scopeId]);
    res.json({
      guards: guards.map(g => ({
        id: g.id,
        userId: g.user_id,
        towerId: g.tower_id,
        towerName: g.tower_name,
        ownerId: g.owner_id,
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

// POST /api/guards – Wachgänger anlegen [WACHFUEHRER] (owner_id = anlegender Wachführer)
router.post('/', requireWachfuehrer, express.json(), async (req, res) => {
  try {
    const { name, towerId, userId, latitude, longitude } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name erforderlich' });

    const tower = await ownTowerOrNull(req, towerId);
    if (!tower.ok) return res.status(400).json({ error: 'Turm gehört nicht zur eigenen Wache' });

    const result = await dbRun(
      'INSERT INTO guards (name, tower_id, user_id, latitude, longitude, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, tower.value, userId ? parsePositiveInt(userId) : null, latitude ?? null, longitude ?? null, req.user.id]
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
// Der eigene Wachführer (owner) oder der verknüpfte Wachgänger selbst. Admin: NEIN (read-only).
function canModifyGuard(user, guard) {
  if (user.role === 'WACHFUEHRER' && guard.owner_id === user.id) return true;
  if (guard.user_id && guard.user_id === user.id) return true;
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

// DELETE /api/guards/:id [WACHFUEHRER, nur eigener Wachgänger]
router.delete('/:id', requireWachfuehrer, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Wachgänger-ID' });
    const guard = await dbGet('SELECT id, owner_id FROM guards WHERE id = ?', [id]);
    if (!guard) return res.status(404).json({ error: 'Guard not found' });
    if (guard.owner_id !== req.user.id) return res.status(403).json({ error: 'Kein eigener Wachgänger' });

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
