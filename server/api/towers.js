// ============================================================
// Türme-API – Liste mit abgeleitetem Status, CRUD (Wachführer/Admin-Fallback)
//
// Architektur: Türme sind STATIONS-Infrastruktur. Sie werden vom WACHFUEHRER
// angelegt, auf der Karte positioniert (lat/lng) und gelöscht – nicht an einen
// einzelnen Wachführer gebunden (jeder Wachführer der Wache darf jeden Turm
// pflegen). HAUPTWACHE (App-Admin) wird von requireRole als technischer Fallback
// durchgelassen (z. B. Erst-Setup), agiert in der UI aber rein ansehend.
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

// Validiert einen optionalen Koordinatenwert: null/undefined erlaubt, sonst Zahl im
// gültigen Bereich. Gibt { ok, value } zurück (value ist null, wenn nicht gesetzt).
function parseCoord(value, kind) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n)) return { ok: false };
  if (kind === 'lat' && (n < -90 || n > 90)) return { ok: false };
  if (kind === 'lng' && (n < -180 || n > 180)) return { ok: false };
  return { ok: true, value: n };
}

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

// POST /api/towers – Turm anlegen [WACHFUEHRER | HAUPTWACHE-Fallback]
router.post('/', requireRole('WACHFUEHRER'), express.json(), async (req, res) => {
  try {
    const { name, callSign, latitude, longitude, requiredStaff } = req.body;
    if (!name || typeof name !== 'string' || name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: 'Ungültiger oder fehlender Name' });
    }
    const lat = parseCoord(latitude, 'lat');
    const lng = parseCoord(longitude, 'lng');
    if (!lat.ok || !lng.ok) return res.status(400).json({ error: 'Ungültige Koordinaten' });
    const result = await dbRun(
      'INSERT INTO towers (name, call_sign, latitude, longitude, required_staff) VALUES (?, ?, ?, ?, ?)',
      [name, callSign || null, lat.value, lng.value, Number(requiredStaff) || 2]
    );
    await recordAudit(req, 'tower_create', 'tower', result.lastID, { name });
    broadcast('towers-updated');
    res.status(201).json({ id: result.lastID, message: 'Tower created' });
  } catch (error) {
    console.error('Create tower error:', error);
    res.status(500).json({ error: 'Failed to create tower' });
  }
});

// PATCH /api/towers/:id – bearbeiten/positionieren [WACHFUEHRER | HAUPTWACHE-Fallback]
// Türme gehören der Wache, nicht einem einzelnen Wachführer → jeder Wachführer darf
// jeden Turm pflegen (Stammdaten + Kartenposition).
router.patch('/:id', requireRole('WACHFUEHRER'), express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Turm-ID' });

    const tower = await dbGet('SELECT * FROM towers WHERE id = ?', [id]);
    if (!tower) return res.status(404).json({ error: 'Tower not found' });

    const { name, callSign, latitude, longitude, requiredStaff } = req.body;
    if (name !== undefined && (typeof name !== 'string' || !name || name.length > MAX_NAME_LEN)) {
      return res.status(400).json({ error: 'Ungültiger Name' });
    }
    const lat = parseCoord(latitude, 'lat');
    const lng = parseCoord(longitude, 'lng');
    if (!lat.ok || !lng.ok) return res.status(400).json({ error: 'Ungültige Koordinaten' });

    await dbRun(
      `UPDATE towers SET
         name = ?, call_sign = ?, latitude = ?, longitude = ?, required_staff = ?
       WHERE id = ?`,
      [
        name ?? tower.name,
        callSign ?? tower.call_sign,
        latitude !== undefined ? lat.value : tower.latitude,
        longitude !== undefined ? lng.value : tower.longitude,
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

// DELETE /api/towers/:id [WACHFUEHRER | HAUPTWACHE-Fallback]
router.delete('/:id', requireRole('WACHFUEHRER'), async (req, res) => {
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
