// ============================================================
// Admin-Server – Admin-Panel auf ADMIN_PORT (Default 3003)
// Gleiches Image, anderer Entry-Point (analog Wachplan-Generator).
//
// WICHTIG (SQLITE_CORRUPT-Ursache): Wird dieser Entry-Point als EIGENER Prozess
// neben server.js gestartet (zwei Container, gleiches Volume), öffnen ZWEI Prozesse
// dieselbe turmstatus.db. SQLite koordiniert gleichzeitige Zugriffe nur INNERHALB
// eines Prozesses zuverlässig; zwischen Prozessen auf einem (NAS-/Netzwerk-)Volume
// unzuverlässig → transientes „database disk image is malformed". Daher bettet
// server.js dieses Panel im Standard-Deployment über `createAdminApp()` in den
// HAUPTPROZESS ein (ein einziger DB-Öffner). Dieser Standalone-Start bleibt für
// Setups erhalten, die das Panel bewusst getrennt betreiben (dann aber EIGENE DB!).
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const { createSessionMiddleware } = require('./db/session');
const { initDatabase, validateEnv } = require('./db/init');
const { dbRun, dbPath } = require('./db/connection');
const authApi = require('./api/auth');
const adminApi = require('./api/admin');
const {
  securityHeaders,
  trustProxyValue,
  overrideClientIp,
  notFoundHandler,
  jsonErrorHandler,
  installSigtermHandler,
  installFatalHandlers,
} = require('./http-common');

const HOST = process.env.HOST || '0.0.0.0';

// Baut die Admin-Panel-Express-App.
// `sessionMiddleware` kann übergeben werden, damit der Hauptprozess (server.js) das
// Panel auf ADMIN_PORT mitbedienen kann, ohne eine zweite DB-Verbindung/-Prozess zu
// öffnen. Ohne Übergabe (echter Standalone-Betrieb) erzeugt die App ihre eigene.
function createAdminApp({ sessionMiddleware } = {}) {
  const app = express();
  app.set('trust proxy', trustProxyValue());
  app.use(overrideClientIp());

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(securityHeaders({ admin: true }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'admin-panel', timestamp: new Date().toISOString() });
  });

  app.use(sessionMiddleware || createSessionMiddleware({ resave: false, saveUninitialized: false }));

  app.use('/api/auth', authApi);
  app.use('/api/admin', adminApi);

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
  app.get('/admin.html', (req, res) => res.redirect('/'));

  app.use(notFoundHandler('admin-panel'));
  app.use(jsonErrorHandler());

  return app;
}

// ── Admin-Server starten (Standalone-Prozess) ───────────────────
async function start() {
  try {
    validateEnv();

    await initDatabase();
    console.log('✓ Database ready');

    // Warten, bis die Laufzeit-Connection busy_timeout/journal_mode gesetzt hat,
    // bevor connect-sqlite3 seine eigene Writer-Connection öffnet.
    await dbRun('SELECT 1');

    const ADMIN_PORT = process.env.ADMIN_PORT || 3003;
    const app = createAdminApp();

    const server = app.listen(ADMIN_PORT, HOST, () => {
      console.log('🔐 Turmstatus Admin-Panel läuft');
      console.log(`   URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${ADMIN_PORT}`);
      console.log(`   Datenbank: ${dbPath}`);
    });

    installSigtermHandler(server, 'Admin-Server');
  } catch (error) {
    console.error('❌ Fehler beim Starten des Admin-Servers:', error.message);
    process.exit(1);
  }
}

module.exports = { createAdminApp };

// Nur als eigener Prozess starten, wenn direkt aufgerufen – beim `require` aus
// server.js (eingebettetes Panel) darf KEIN zweiter Listener/DB-Prozess hochfahren.
if (require.main === module) {
  installFatalHandlers();
  start();
}
