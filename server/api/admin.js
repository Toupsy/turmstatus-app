// ============================================================
// Admin-API – Benutzerverwaltung + Audit-Log (nur HAUPTWACHE / is_admin)
// Wird vom Haupt-Server (in-App) UND vom Admin-Server (Port 3001) gemountet.
// ============================================================

const express = require('express');
const router = express.Router();
const bcryptjs = require('bcryptjs');
const { dbRun, dbGet, dbAll } = require('../db/connection');
const { parsePositiveInt } = require('../db/ids');
const { recordAudit } = require('../db/audit');
const { broadcast } = require('../realtime');

const ROLES = ['HAUPTWACHE', 'WACHFUEHRER', 'WACHGAENGER', 'BOOTSFUEHRER'];
const MIN_PASSWORD_LENGTH = 10;

// Admin-Gate: Session nötig + is_admin. (Eigenständig, damit der Admin-Server
// dieselbe Datei ohne die volle requireAuth-Kette nutzen kann.)
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await dbGet('SELECT id, is_admin FROM users WHERE id = ? AND is_active = 1', [req.session.userId]);
    if (!user || user.is_admin !== 1) return res.status(403).json({ error: 'Admin-Rechte erforderlich' });
    req.adminUserId = user.id;
    next();
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
}

router.use(requireAdmin);

// GET /api/admin/towers – schlanke Turmliste (Admin-Panel hat keinen /api/towers-Mount)
router.get('/towers', async (req, res) => {
  try {
    const towers = await dbAll('SELECT id, name FROM towers ORDER BY name');
    res.json({ towers });
  } catch (error) {
    console.error('List towers (admin) error:', error);
    res.status(500).json({ error: 'Failed to list towers' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await dbAll(
      `SELECT u.id, u.username, u.full_name, u.role, u.tower_id, u.is_admin, u.is_active, u.last_login, u.created_at,
              t.name AS tower_name
         FROM users u LEFT JOIN towers t ON t.id = u.tower_id
        ORDER BY u.username`
    );
    res.json({
      users: users.map(u => ({
        id: u.id, username: u.username, fullName: u.full_name, role: u.role,
        towerId: u.tower_id, towerName: u.tower_name,
        isAdmin: u.is_admin === 1, isActive: u.is_active === 1,
        lastLogin: u.last_login, createdAt: u.created_at
      }))
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/admin/users – Benutzer anlegen
router.post('/users', express.json(), async (req, res) => {
  try {
    const { username, password, fullName, role, towerId, isAdmin } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username und Passwort erforderlich' });
    if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` });
    const userRole = ROLES.includes(role) ? role : 'WACHGAENGER';
    const admin = isAdmin === true || userRole === 'HAUPTWACHE' ? 1 : 0;

    const hash = await bcryptjs.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (username, password_hash, full_name, role, tower_id, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hash, fullName || null, userRole, towerId ? parsePositiveInt(towerId) : null, admin]
    );
    await recordAudit(req, 'admin_user_create', 'user', result.lastID, { username, role: userRole });
    res.status(201).json({ id: result.lastID, message: 'User created' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username bereits vergeben' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id – Rolle/Turm/Status/Name ändern
router.patch('/users/:id', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { fullName, role, towerId, isActive, isAdmin } = req.body;
    const userRole = role !== undefined ? (ROLES.includes(role) ? role : user.role) : user.role;
    let admin = isAdmin !== undefined ? (isAdmin ? 1 : 0) : user.is_admin;
    if (userRole === 'HAUPTWACHE') admin = 1;
    let active = isActive !== undefined ? (isActive ? 1 : 0) : user.is_active;

    // Letzten aktiven Admin nicht entrechten/deaktivieren
    if ((admin === 0 || active === 0) && user.is_admin === 1) {
      const others = await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND is_active = 1 AND id != ?', [id]);
      if (others.n === 0) return res.status(400).json({ error: 'Der letzte aktive Admin kann nicht deaktiviert/entrechtet werden' });
    }

    await dbRun(
      'UPDATE users SET full_name = ?, role = ?, tower_id = ?, is_admin = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        fullName !== undefined ? (fullName || null) : user.full_name,
        userRole,
        towerId !== undefined ? (towerId ? parsePositiveInt(towerId) : null) : user.tower_id,
        admin, active, id
      ]
    );
    await recordAudit(req, 'admin_user_update', 'user', id);
    broadcast('users-updated');
    res.json({ id, message: 'User updated' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', express.json(), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` });
    }
    const user = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hash = await bcryptjs.hash(newPassword, 10);
    await dbRun('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, id]);
    await recordAudit(req, 'admin_password_reset', 'user', id);
    res.json({ id, message: 'Password reset' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
    const user = await dbGet('SELECT id, is_admin FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.is_admin === 1) {
      const others = await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id != ?', [id]);
      if (others.n === 0) return res.status(400).json({ error: 'Der letzte Admin kann nicht gelöscht werden' });
    }
    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    await recordAudit(req, 'admin_user_delete', 'user', id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/audit-log?limit=200
router.get('/audit-log', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const rows = await dbAll(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.timestamp,
              u.username AS actor
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.timestamp DESC LIMIT ?`,
      [limit]
    );
    res.json({
      entries: rows.map(r => ({
        id: r.id, actor: r.actor, action: r.action,
        entityType: r.entity_type, entityId: r.entity_id,
        details: r.details, ipAddress: r.ip_address, timestamp: r.timestamp
      }))
    });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
