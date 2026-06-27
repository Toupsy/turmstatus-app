// ============================================================
// Boote-API – Rettungsboote: Liste, CRUD, Status/Position (Wachführer, scoped)
//
// Mandanten-Modell (Scope-Isolation): Jedes Boot gehört genau EINEM Wachführer
// (owner_id) und kann nur dessen eigenen Türmen zugeordnet werden. Admin sieht alle
// Boote (read-only).
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireWachfuehrer, viewScope } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const BOAT_STATUS = ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];

router.use(requireAuth);

// Prüft, ob ein Turm dem Wachführer gehört (für Boot↔Turm-Zuordnung). towerId null = ok.
async function ownTowerOrNull(req, towerId) {
  if (!towerId) return { ok: true, value: null };
  const id = parsePositiveInt(towerId);
  if (!id) return { ok: false };
  const tower = await dbGet('SELECT owner_id FROM towers WHERE id = ?', [id]);
  if (!tower || tower.owner_id !== req.user.id) return { ok: false };
  return { ok: true, value: id };
}

// GET /api/boats – Boote des eigenen Scopes (Admin: alle)
router.get('/', async (req, res) => {
  try {
    const scope = viewScope(req.user);
    const boats = scope.all
      ? await dbAll(`SELECT b.*, t.name AS tower_name FROM boats b LEFT JOIN towers t ON t.id = b.tower_id ORDER BY b.name`)
      : await dbAll(`SELECT b.*, t.name AS tower_name FROM boats b LEFT JOIN towers t ON t.id = b.tower_id WHERE b.owner_id = ? ORDER BY b.name`, [scope.scopeId]);
    res.json({
      boats: boats.map(b => ({
        id: b.id,
        name: b.name,
        callSign: b.call_sign,
        towerId: b.tower_id,
        towerName: b.tower_name,
        ownerId: b.owner_id,
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

// POST /api/boats [WACHFUEHRER] (owner_id = anlegender Wachführer)
router.post('/', requireWachfuehrer, express.json(), async (req, res) => {
  try {
    const { name, callSign, towerId, status, latitude, longitude } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name erforderlich' });
    if (status && !BOAT_STATUS.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

    const tower = await ownTowerOrNull(req, towerId);
    if (!tower.ok) return res.status(400).json({ error: 'Turm gehört nicht zur eigenen Wache' });

    const result = await dbRun(
      'INSERT INTO boats (name, call_sign, tower_id, status, latitude, longitude, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, callSign || null, tower.value, status || 'AT_TOWER', latitude ?? null, longitude ?? null, req.user.id]
    );
    await recordAudit(req, 'boat_create', 'boat', result.lastID, { name });
    broadcast('boats-updated');
    res.status(201).json({ id: result.lastID, message: 'Boat created' });
  } catch (error) {
    console.error('Create boat error:', error);
    res.status(500).json({ error: 'Failed to create boat' });
  }
});

// Lädt ein Boot NUR, wenn es dem anfragenden Wachführer gehört.
async function loadOwnBoat(req, id) {
  const boat = await dbGet('SELECT * FROM boats WHERE id = ?', [id]);
  if (!boat) return { error: 404 };
  if (boat.owner_id !== req.user.id) return { error: 403 };
  return { boat };
}

// PATCH /api/boats/:id – Status/Position/Stammdaten/Turm-Zuordnung [WACHFUEHRER, nur eigenes Boot]
router.patch('/:id', requireWachfuehrer, express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Boot-ID' });

    const { boat, error } = await loadOwnBoat(req, id);
    if (error === 404) return res.status(404).json({ error: 'Boat not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein eigenes Boot' });

    const { name, callSign, towerId, status, latitude, longitude } = req.body;
    if (status && !BOAT_STATUS.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

    let towerVal = boat.tower_id;
    if (towerId !== undefined) {
      const tower = await ownTowerOrNull(req, towerId);
      if (!tower.ok) return res.status(400).json({ error: 'Turm gehört nicht zur eigenen Wache' });
      towerVal = tower.value;
    }

    await dbRun(
      `UPDATE boats SET name = ?, call_sign = ?, tower_id = ?, status = ?, latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name ?? boat.name,
        callSign ?? boat.call_sign,
        towerVal,
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

// DELETE /api/boats/:id [WACHFUEHRER, nur eigenes Boot]
router.delete('/:id', requireWachfuehrer, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Boot-ID' });
    const { error } = await loadOwnBoat(req, id);
    if (error === 404) return res.status(404).json({ error: 'Boat not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein eigenes Boot' });

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
