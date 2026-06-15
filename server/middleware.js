// ============================================================
// Auth- & Rollen-Middleware (Turmstatus)
// Rollen serverseitig erzwungen: HAUPTWACHE | TURMFUEHRER | WACHGAENGER
// ============================================================

const { dbGet } = require('./db/connection');

// Authentifizierung: Session nötig. Lädt den User (mit Rolle) an req.user.
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await dbGet(
      'SELECT id, username, full_name, role, tower_id, is_admin, is_active FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!user || user.is_active === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

// Rollenprüfung: erlaubt nur die übergebenen Rollen (HAUPTWACHE ist immer erlaubt).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'HAUPTWACHE') return next(); // Hauptwache darf alles
    if (roles.includes(req.user.role)) return next();
    res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
  };
}

module.exports = { requireAuth, requireRole };
