// ============================================================
// Team-API – Wachführer verwalten ihr EIGENES Wachpersonal (WACHGAENGER + BOOTSFUEHRER).
//
// Mandanten-Modell (Scope-Isolation): Jedes Personal-Konto gehört genau EINEM Wachführer
// (users.owner_id). Ein Wachführer sieht/verwaltet ausschließlich Konten mit
// owner_id === eigene id; andere Wachführer-Scopes bleiben unsichtbar. Optionale
// Stationierung (tower_id) muss ein eigener Turm des Wachführers sein.
//
// Abgrenzung: /api/admin/* ist dem App-Admin (is_admin) vorbehalten und legt v. a.
// Wachführer an. Hier legt der Wachführer sein eigenes Personal an.
// ============================================================

const express = require('express');
const router = express.Router();
const bcryptjs = require('bcryptjs');
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { requireAuth, requireWachfuehrer } = require('../middleware');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

// Rollen, die ein Wachführer für seine Wache anlegen/verwalten darf.
const TEAM_ROLES = ['WACHGAENGER', 'BOOTSFUEHRER'];
const MIN_PASSWORD_LENGTH = 10;

router.use(requireAuth);
router.use(requireWachfuehrer); // strikt Wachführer (Admin nutzt /api/admin)

// Optionale Stationierung: tower_id muss – falls gesetzt – ein eigener Turm sein.
async function ownTowerOrNull(req, towerId) {
  if (!towerId) return { ok: true, value: null };
  const id = parsePositiveInt(towerId);
  if (!id) return { ok: false };
  const tower = await dbGet('SELECT owner_id FROM towers WHERE id = ?', [id]);
  if (!tower || tower.owner_id !== req.user.id) return { ok: false };
  return { ok: true, value: id };
}

// GET /api/team/members – Wachpersonal des eigenen Scopes (owner_id === ich)
router.get('/members', async (req, res) => {
  try {
    const members = await dbAll(
      `SELECT u.id, u.username, u.full_name, u.role, u.tower_id, u.is_active, u.last_login, u.created_at,
              t.name AS tower_name
         FROM users u LEFT JOIN towers t ON t.id = u.tower_id
        WHERE u.owner_id = ? AND u.role IN ('WACHGAENGER', 'BOOTSFUEHRER')
        ORDER BY u.username`,
      [req.user.id]
    );
    res.json({
      users: members.map(u => ({
        id: u.id, username: u.username, fullName: u.full_name, role: u.role,
        towerId: u.tower_id, towerName: u.tower_name,
        isAdmin: false, isActive: u.is_active === 1,
        lastLogin: u.last_login, createdAt: u.created_at
      }))
    });
  } catch (error) {
    console.error('List team error:', error);
    res.status(500).json({ error: 'Failed to list team' });
  }
});

// POST /api/team/members – Wachgänger/Bootsführer für die eigene Wache anlegen
router.post('/members', express.json(), async (req, res) => {
  try {
    const { username, password, fullName, role, towerId } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username und Passwort erforderlich' });
    if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` });
    const userRole = TEAM_ROLES.includes(role) ? role : 'WACHGAENGER';
    const tower = await ownTowerOrNull(req, towerId);
    if (!tower.ok) return res.status(400).json({ error: 'Turm gehört nicht zur eigenen Wache' });

    const hash = await bcryptjs.hash(password, 10);
    // owner_id wird ZWINGEND auf den anlegenden Wachführer gesetzt; is_admin immer 0.
    const result = await dbRun(
      'INSERT INTO users (username, password_hash, full_name, role, tower_id, owner_id, is_admin) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [username, hash, fullName || null, userRole, tower.value, req.user.id]
    );
    await recordAudit(req, 'team_user_create', 'user', result.lastID, { username, role: userRole });
    broadcast('users-updated');
    res.status(201).json({ id: result.lastID, message: 'User created' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username bereits vergeben' });
    }
    console.error('Create team user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Lädt ein Team-Mitglied NUR, wenn es zum eigenen Scope gehört und eine Team-Rolle hat.
async function loadOwnMember(req, id) {
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return { error: 404 };
  if (user.owner_id !== req.user.id || !TEAM_ROLES.includes(user.role)) return { error: 403 };
  return { user };
}

// PATCH /api/team/members/:id – Name/Rolle/Aktiv-Status/Stationierung (gescoped)
router.patch('/members/:id', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    const { user, error } = await loadOwnMember(req, id);
    if (error === 404) return res.status(404).json({ error: 'User not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein Mitglied der eigenen Wache' });

    const { fullName, role, isActive, towerId } = req.body;
    const userRole = role !== undefined ? (TEAM_ROLES.includes(role) ? role : user.role) : user.role;
    const active = isActive !== undefined ? (isActive ? 1 : 0) : user.is_active;
    let towerVal = user.tower_id;
    if (towerId !== undefined) {
      const tower = await ownTowerOrNull(req, towerId);
      if (!tower.ok) return res.status(400).json({ error: 'Turm gehört nicht zur eigenen Wache' });
      towerVal = tower.value;
    }

    await dbRun(
      'UPDATE users SET full_name = ?, role = ?, is_active = ?, tower_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [fullName !== undefined ? (fullName || null) : user.full_name, userRole, active, towerVal, id]
    );
    await recordAudit(req, 'team_user_update', 'user', id);
    broadcast('users-updated');
    res.json({ id, message: 'User updated' });
  } catch (error) {
    console.error('Update team user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/team/members/:id/reset-password (gescoped)
router.post('/members/:id/reset-password', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` });
    }
    const { error } = await loadOwnMember(req, id);
    if (error === 404) return res.status(404).json({ error: 'User not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein Mitglied der eigenen Wache' });

    const hash = await bcryptjs.hash(newPassword, 10);
    await dbRun('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, id]);
    await recordAudit(req, 'team_password_reset', 'user', id);
    res.json({ id, message: 'Password reset' });
  } catch (error) {
    console.error('Reset team password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/team/members/:id (gescoped)
router.delete('/members/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    const { error } = await loadOwnMember(req, id);
    if (error === 404) return res.status(404).json({ error: 'User not found' });
    if (error === 403) return res.status(403).json({ error: 'Kein Mitglied der eigenen Wache' });

    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    await recordAudit(req, 'team_user_delete', 'user', id);
    broadcast('users-updated');
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete team user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
