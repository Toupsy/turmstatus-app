// ============================================================
// Türme-API – Liste mit abgeleitetem Status, CRUD (Wachführer, scoped)
//
// Mandanten-Modell (Scope-Isolation, wie Wachplan-Generator): Jeder Turm gehört
// genau EINEM Wachführer (owner_id). Ein Wachführer sieht & verwaltet ausschließlich
// seine eigenen Türme; andere Wachführer sehen sie nicht. Der App-Admin (HAUPTWACHE)
// sieht ALLE Türme – aber rein ansehend (kein Anlegen/Ändern/Löschen).
// ============================================================

const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireWachfuehrer, viewScope } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');
const { deriveTowerStatus } = require('../status');

const MAX_NAME_LEN = 120;
const MAX_STAFF = 99;

// Klammert eine gemeldete Personenzahl auf eine nicht-negative Ganzzahl im erlaubten Bereich.
function clampStaff(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_STAFF);
}

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

// GET /api/towers – Türme des eigenen Scopes (Admin: alle) mit abgeleitetem Status
router.get('/', async (req, res) => {
  try {
    const scope = viewScope(req.user);
    const towers = scope.all
      ? await dbAll('SELECT * FROM towers ORDER BY name')
      : await dbAll('SELECT * FROM towers WHERE owner_id = ? ORDER BY name', [scope.scopeId]);
    const counts = await dbAll(
      "SELECT tower_id, COUNT(*) AS n FROM guards WHERE status = 'IN_AREA' AND tower_id IS NOT NULL GROUP BY tower_id"
    );
    const byTower = Object.fromEntries(counts.map(c => [c.tower_id, c.n]));
    res.json({
      towers: towers.map(t => {
        // Effektive Ist-Besetzung = gezählte IN_AREA-Wachgänger (mit Account/Objekt)
        // PLUS manuell vom Wachführer gemeldete Anwesende (ohne eigene Accounts).
        const guardStaff = byTower[t.id] || 0;
        const presentStaff = t.present_staff || 0;
        const current = guardStaff + presentStaff;
        return {
          id: t.id,
          name: t.name,
          callSign: t.call_sign,
          latitude: t.latitude,
          longitude: t.longitude,
          requiredStaff: t.required_staff,
          presentStaff,
          guardStaff,
          ownerId: t.owner_id,
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

// POST /api/towers – Turm anlegen [WACHFUEHRER] (owner_id = anlegender Wachführer)
router.post('/', requireWachfuehrer, express.json(), async (req, res) => {
  try {
    const { name, callSign, latitude, longitude, requiredStaff, presentStaff } = req.body;
    if (!name || typeof name !== 'string' || name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: 'Ungültiger oder fehlender Name' });
    }
    const lat = parseCoord(latitude, 'lat');
    const lng = parseCoord(longitude, 'lng');
    if (!lat.ok || !lng.ok) return res.status(400).json({ error: 'Ungültige Koordinaten' });
    const result = await dbRun(
      'INSERT INTO towers (name, call_sign, latitude, longitude, required_staff, present_staff, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, callSign || null, lat.value, lng.value, Number(requiredStaff) || 2, clampStaff(presentStaff), req.user.id]
    );
    await recordAudit(req, 'tower_create', 'tower', result.lastID, { name });
    broadcast('towers-updated');
    res.status(201).json({ id: result.lastID, message: 'Tower created' });
  } catch (error) {
    console.error('Create tower error:', error);
    res.status(500).json({ error: 'Failed to create tower' });
  }
});

// Lädt einen Turm NUR, wenn er dem anfragenden Wachführer gehört. Sonst { error }.
async function loadOwnTower(req, id) {
  const tower = await dbGet('SELECT * FROM towers WHERE id = ?', [id]);
  if (!tower) return { error: 404 };
  if (tower.owner_id !== req.user.id) return { error: 403 };
  return { tower };
}

// PATCH /api/towers/:id – bearbeiten/positionieren [WACHFUEHRER, nur eigener Turm]
router.patch('/:id', requireWachfuehrer, express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Turm-ID' });

    const { tower, error } = await loadOwnTower(req, id);
    if (error === 404) return res.status(404).json({ error: 'Tower not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein eigener Turm' });

    const { name, callSign, latitude, longitude, requiredStaff, presentStaff } = req.body;
    if (name !== undefined && (typeof name !== 'string' || !name || name.length > MAX_NAME_LEN)) {
      return res.status(400).json({ error: 'Ungültiger Name' });
    }
    const lat = parseCoord(latitude, 'lat');
    const lng = parseCoord(longitude, 'lng');
    if (!lat.ok || !lng.ok) return res.status(400).json({ error: 'Ungültige Koordinaten' });

    await dbRun(
      `UPDATE towers SET
         name = ?, call_sign = ?, latitude = ?, longitude = ?, required_staff = ?, present_staff = ?
       WHERE id = ?`,
      [
        name ?? tower.name,
        callSign ?? tower.call_sign,
        latitude !== undefined ? lat.value : tower.latitude,
        longitude !== undefined ? lng.value : tower.longitude,
        requiredStaff !== undefined ? Number(requiredStaff) || tower.required_staff : tower.required_staff,
        presentStaff !== undefined ? clampStaff(presentStaff) : tower.present_staff,
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

// DELETE /api/towers/:id [WACHFUEHRER, nur eigener Turm]
router.delete('/:id', requireWachfuehrer, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Turm-ID' });

    const { error } = await loadOwnTower(req, id);
    if (error === 404) return res.status(404).json({ error: 'Tower not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein eigener Turm' });

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
