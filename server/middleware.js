// ============================================================
// Auth- & Rollen-Middleware (Turmstatus)
// Rollen serverseitig erzwungen: HAUPTWACHE | WACHFUEHRER | WACHGAENGER | BOOTSFUEHRER
// ============================================================

const { dbGet } = require('./db/connection');

// Authentifizierung: Session nötig. Lädt den User (mit Rolle) an req.user.
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await dbGet(
      'SELECT id, username, full_name, role, tower_id, owner_id, is_admin, is_active FROM users WHERE id = ?',
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

// Strikter Wachführer-Gate OHNE HAUPTWACHE-Bypass: für die operative Stations-
// Verwaltung (Türme/Boote/Personal/Genehmigungen). Der App-Admin ist bewusst
// rein ansehend und darf hier NICHT eingreifen (vgl. Genehmigungs-Endpunkte).
function requireWachfuehrer(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role === 'WACHFUEHRER') return next();
  res.status(403).json({ error: 'Nur Wachführer dürfen das verwalten' });
}

// App-Admin? (technischer Administrator – sieht alle Mandanten read-only)
function isAdmin(user) {
  return !!user && (user.role === 'HAUPTWACHE' || user.is_admin === 1);
}

// Scope-Isolation (Mandanten-Modell): Welche Daten darf dieser User sehen?
//  - Admin (HAUPTWACHE/is_admin): { all: true } → sieht ALLE Wachführer-Scopes.
//  - Wachführer: eigener Scope (owner_id === eigene user.id).
//  - Wachgänger/Bootsführer: Scope ihres Wachführers (user.owner_id).
//  - sonst: leerer Scope (scopeId = -1, matcht nichts).
function viewScope(user) {
  if (isAdmin(user)) return { all: true, scopeId: null };
  if (user.role === 'WACHFUEHRER') return { all: false, scopeId: user.id };
  if (user.role === 'WACHGAENGER' || user.role === 'BOOTSFUEHRER') {
    return { all: false, scopeId: user.owner_id || -1 };
  }
  return { all: false, scopeId: -1 };
}

module.exports = { requireAuth, requireRole, requireWachfuehrer, isAdmin, viewScope };
