// ============================================================
// Authentication API Routes (Turmstatus)
// Struktur identisch zum Wachplan-Generator – /me liefert zusätzlich
// role / full_name / tower_id für das rollenbasierte Frontend.
// ============================================================

const express = require('express');
const router = express.Router();
const bcryptjs = require('bcryptjs');
const { dbRun, dbGet } = require('../db/connection');
const { recordAudit } = require('../db/audit');
const { passwordHashRounds } = require('../password');

const MIN_PASSWORD_LENGTH = 10;
const REGISTRATION_MODE = process.env.REGISTRATION_MODE || 'disabled'; // disabled | open | code

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await dbGet(
      'SELECT id, username, full_name, role, tower_id, is_admin FROM users WHERE id = ? AND is_active = 1',
      [req.session.userId]
    );
    if (!user) return res.status(401).json({ error: 'User not found' });

    res.json({
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      towerId: user.tower_id,
      isAdmin: user.is_admin === 1
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── In-Memory Brute-Force-Schutz: IP- + Account-basiert ────
const _loginAttempts = new Map();
const _accountLockouts = new Map();
const LOGIN_MAX = 10, LOGIN_WINDOW_MS = 15 * 60 * 1000;

function _cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of _loginAttempts.entries()) {
    if (now - entry.first > LOGIN_WINDOW_MS) _loginAttempts.delete(key);
  }
  for (const [key, entry] of _accountLockouts.entries()) {
    if (now - entry.first > LOGIN_WINDOW_MS) _accountLockouts.delete(key);
  }
}
function _attemptEntry(ip) {
  const now = Date.now();
  let e = _loginAttempts.get(ip);
  if (!e || now - e.first > LOGIN_WINDOW_MS) { e = { count: 0, first: now }; _loginAttempts.set(ip, e); }
  return e;
}
function _accountLockoutEntry(username) {
  const now = Date.now();
  let e = _accountLockouts.get(username);
  if (!e || now - e.first > LOGIN_WINDOW_MS) { e = { count: 0, first: now }; _accountLockouts.set(username, e); }
  return e;
}
const _isRateLimited = ip => _attemptEntry(ip).count >= LOGIN_MAX;
const _isAccountLocked = username => _accountLockoutEntry(username).count >= LOGIN_MAX;
const _recordFail = (ip, username) => { _attemptEntry(ip).count++; _accountLockoutEntry(username).count++; };
const _resetAttempts = (ip, username) => { _loginAttempts.delete(ip); _accountLockouts.delete(username); };

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', express.json(), async (req, res) => {
  const ip = req.ip || 'unknown';
  const { username, password, rememberMe } = req.body;

  _cleanupExpiredEntries();

  if (_isRateLimited(ip)) {
    return res.status(429).json({ error: 'Zu viele Login-Versuche. Bitte später erneut versuchen.' });
  }
  if (username && _isAccountLocked(username)) {
    return res.status(429).json({ error: 'Zu viele fehlgeschlagene Login-Versuche für dieses Konto. Bitte später erneut versuchen.' });
  }

  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await dbGet(
      'SELECT id, password_hash, is_admin, role FROM users WHERE username = ? AND is_active = 1',
      [username]
    );

    if (!user) {
      _recordFail(ip, username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const validPassword = await bcryptjs.compare(password, user.password_hash);
    if (!validPassword) {
      _recordFail(ip, username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    _resetAttempts(ip, username);

    // Session-Fixation verhindern: neue Session-ID NACH erfolgreichem Login
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error:', regenErr);
        return res.status(500).json({ error: 'Failed to start session' });
      }
      req.session.userId = user.id;
      req.session.isAdmin = user.is_admin === 1;

      if (rememberMe === true) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 Tage
      }

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Failed to save session' });
        }
        dbRun('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id])
          .catch(e => console.error('last_login update failed:', e));
        recordAudit(req, 'login', 'user', user.id);

        res.json({
          success: true,
          userId: user.id,
          username,
          role: user.role,
          isAdmin: user.is_admin === 1,
          message: 'Login successful'
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────
router.post('/logout', (req, res) => {
  if (req.session.userId) recordAudit(req, 'logout', 'user', req.session.userId);
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true, message: 'Logged out' });
  });
});

// ── GET /api/auth/needs-setup ──────────────────────────────
router.get('/needs-setup', async (req, res) => {
  try {
    const adminExists = await dbGet('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
    res.json({ needsSetup: !adminExists || adminExists.count === 0 });
  } catch (error) {
    res.json({ needsSetup: true });
  }
});

// ── GET /api/auth/registration-status ──────────────────────
router.get('/registration-status', (req, res) => {
  res.json({ enabled: REGISTRATION_MODE !== 'disabled', requiresCode: REGISTRATION_MODE === 'code' });
});

// ── POST /api/auth/init – Erst-Admin (Hauptwache) anlegen ──
router.post('/init', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const adminExists = await dbGet('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
    if (adminExists && adminExists.count > 0) {
      return res.status(403).json({ error: 'Admin user already exists' });
    }

    const passwordHash = await bcryptjs.hash(password, passwordHashRounds());
    await dbRun(
      "INSERT INTO users (username, password_hash, full_name, role, is_admin) VALUES (?, ?, ?, 'HAUPTWACHE', 1)",
      [username, passwordHash, 'Hauptwache']
    );
    res.json({ success: true, message: 'Admin user created' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Init error:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// ── POST /api/auth/register – Selbstregistrierung (Wachgänger) ──
router.post('/register', express.json(), async (req, res) => {
  const ip = req.ip || 'unknown';
  const { username, password, code, acceptedPrivacy } = req.body;

  _cleanupExpiredEntries();

  if (REGISTRATION_MODE === 'disabled') {
    return res.status(403).json({ error: 'Registrierung ist deaktiviert' });
  }
  if (_isRateLimited(ip)) {
    return res.status(429).json({ error: 'Zu viele Registrierungsversuche. Bitte später erneut versuchen.' });
  }

  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` });
    }
    if (acceptedPrivacy !== true) {
      return res.status(400).json({ error: 'Datenschutzhinweis muss akzeptiert werden' });
    }
    if (REGISTRATION_MODE === 'code') {
      if (!code || code !== process.env.REGISTRATION_CODE) {
        _recordFail(ip, username);
        return res.status(403).json({ error: 'Registrierung nicht möglich' });
      }
    }

    const passwordHash = await bcryptjs.hash(password, passwordHashRounds());
    // Selbstregistrierte Nutzer sind immer Wachgänger ohne Admin-Rechte.
    await dbRun(
      "INSERT INTO users (username, password_hash, role, is_admin) VALUES (?, ?, 'WACHGAENGER', 0)",
      [username, passwordHash]
    );
    _resetAttempts(ip, username);

    const newUser = await dbGet('SELECT id, role FROM users WHERE username = ?', [username]);
    if (newUser) {
      req.session.regenerate((regenErr) => {
        if (regenErr) return res.status(500).json({ error: 'Session initialization failed' });
        req.session.userId = newUser.id;
        req.session.isAdmin = false;
        req.session.save((saveErr) => {
          if (saveErr) return res.status(500).json({ error: 'Session save failed' });
          res.json({ success: true, userId: newUser.id, username, role: newUser.role, isAdmin: false, message: 'Registrierung erfolgreich' });
        });
      });
    } else {
      res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
    }
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      _recordFail(ip, username);
      return res.status(400).json({ error: 'Registrierung nicht möglich' });
    }
    console.error('Registration error:', error);
    _recordFail(ip, username);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

// ── PUT /api/auth/password – eigenes Passwort ändern ───────
router.put('/password', express.json(), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [req.session.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcryptjs.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const newHash = await bcryptjs.hash(newPassword, passwordHashRounds());
    await dbRun('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newHash, req.session.userId]);
    recordAudit(req, 'password_change', 'user', req.session.userId);
    res.json({ success: true, message: 'Password changed' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
