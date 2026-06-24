/**
 * Express-Server für Turmstatus (digitales Wach- und Statussystem)
 * - SPA-Hosting (public/Turmstatus.html)
 * - Session-basierte Authentifizierung (SQLite-Store)
 * - SQLite-Datenbank für Türme, Wachgänger, Boote, -1/+1-Anfragen
 * - Live-Lagebild über WebSocket (/api/ws)
 *
 * Aufbau bewusst deckungsgleich zum DLRG-Wachplan-Generator, damit beide
 * Anwendungen später dieselbe Infrastruktur teilen / zusammengeführt werden können.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { createSessionMiddleware } = require('./db/session');
const { initDatabase, validateEnv } = require('./db/init');
const authApi = require('./api/auth');
const towersApi = require('./api/towers');
const guardsApi = require('./api/guards');
const boatsApi = require('./api/boats');
const requestsApi = require('./api/requests');
const controlTripsApi = require('./api/control-trips');
const dashboardApi = require('./api/dashboard');
const adminApi = require('./api/admin');
const teamApi = require('./api/team');
const {
  securityHeaders,
  trustProxyValue,
  overrideClientIp,
  notFoundHandler,
  jsonErrorHandler,
  installSigtermHandler,
  installFatalHandlers,
} = require('./http-common');

const app = express();
app.set('trust proxy', trustProxyValue());
// Echte Client-IP aus Proxy-Headern (CF-Connecting-IP/X-Forwarded-For) übernehmen,
// damit Audit-Log + Rate-Limiting hinter Cloudflare/NGINX die echte IP sehen.
app.use(overrideClientIp());
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

// App-Version beim Start laden (nicht im require gecacht)
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
})();

// ── GitHub-Release-Check (für /api/version), serverseitig + gecacht ──
const GITHUB_RELEASE_URL = 'https://api.github.com/repos/Toupsy/turmstatus-app/releases/latest';
const RELEASE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
let _releaseCache = { latest: null, releaseUrl: null, fetchedAt: 0 };

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0 || Number.isNaN(d)) return Number.isNaN(d) ? 0 : d;
  }
  return 0;
}

async function getLatestRelease() {
  if (Date.now() - _releaseCache.fetchedAt < RELEASE_CACHE_TTL_MS) return _releaseCache;
  try {
    const res = await fetch(GITHUB_RELEASE_URL, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'turmstatus-app' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    _releaseCache = {
      latest: String(data.tag_name || '').replace(/^v/, '') || null,
      releaseUrl: data.html_url || null,
      fetchedAt: Date.now()
    };
  } catch (err) {
    console.warn('GitHub release check failed:', err.message);
    _releaseCache = { latest: null, releaseUrl: null, fetchedAt: Date.now() - RELEASE_CACHE_TTL_MS + 15 * 60 * 1000 };
  }
  return _releaseCache;
}

// ── Umgebungsvariablen validieren ──────────────────────────────
validateEnv();

// ── Body-Parser ────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Basis-Security-Header ──────────────────────────────────────
app.use(securityHeaders());

// ── Health-Check (für Docker/K8s) ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Server starten ─────────────────────────────────────────────
async function start() {
  try {
    const { dbPath, dbRun } = require('./db/connection');

    await initDatabase();
    console.log('✓ Database ready');

    // Pragma-Queue der Haupt-Connection (foreign_keys, journal_mode=DELETE,
    // busy_timeout) abwarten, BEVOR der Session-Store seine eigene Connection
    // öffnet – sonst racet der journal_mode-Switch mit CREATE TABLE sessions.
    await dbRun('SELECT 1');

    // Session-Middleware (SQLite-Store). Referenz für WS-Upgrade-Auth behalten.
    const sessionMiddleware = createSessionMiddleware({ resave: true, saveUninitialized: true });
    app.use(sessionMiddleware);

    console.log('Registering API routes...');
    app.use('/api/auth', authApi);
    app.use('/api/towers', towersApi);
    app.use('/api/guards', guardsApi);
    app.use('/api/boats', boatsApi);
    app.use('/api/requests', requestsApi);
    app.use('/api/control-trips', controlTripsApi);
    app.use('/api/dashboard', dashboardApi);
    app.use('/api/admin', adminApi);
    app.use('/api/team', teamApi);

    // Version (public)
    app.get('/api/version', async (req, res) => {
      const { latest, releaseUrl } = await getLatestRelease();
      res.json({
        version: APP_VERSION,
        latest,
        releaseUrl,
        updateAvailable: !!latest && compareVersions(latest, APP_VERSION) > 0
      });
    });

    // Config (public) – Frontend liest Enums/Map-Defaults daraus
    app.get('/api/config', (req, res) => {
      const configPath = path.join(__dirname, 'config.json');
      try {
        res.json(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
      } catch (error) {
        console.error('Config load error:', error);
        res.status(500).json({ error: 'Config not available' });
      }
    });

    console.log('✓ API routes registered');

    // Static + SPA (NACH den API-Routen)
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'Turmstatus.html'));
    });

    // 404 + Error-Handler
    app.use(notFoundHandler());
    app.use(jsonErrorHandler());

    const server = app.listen(PORT, HOST, () => {
      console.log('🛟 Turmstatus läuft');
      console.log(`   URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
      console.log(`   Datenbank: ${dbPath}`);
    });

    // Live-Lagebild (WebSocket /api/ws)
    const { setupRealtime } = require('./realtime');
    setupRealtime(server, sessionMiddleware);

    // ── Admin-Panel IM SELBEN Prozess auf ADMIN_PORT mitbedienen ──────
    // GRUND (SQLITE_CORRUPT-Dauerfix): Lief das Admin-Panel als zweiter Container
    // (admin-server.js) neben diesem Server, öffneten ZWEI Prozesse dieselbe
    // turmstatus.db auf dem geteilten Volume → transientes „database disk image is
    // malformed". Ein Prozess, der beide Ports bedient, öffnet die DB nur einmal.
    // Die Admin-App teilt sich dieselbe Session-Middleware (= dieselbe DB-Verbindung).
    // RUN_EMBEDDED_ADMIN=0 → klassischer Zwei-Prozess-Betrieb (nur mit getrennter DB!).
    const adminPort = process.env.ADMIN_PORT;
    if (adminPort && process.env.RUN_EMBEDDED_ADMIN !== '0') {
      const { createAdminApp } = require('./admin-server');
      const adminApp = createAdminApp({ sessionMiddleware });
      adminApp.listen(adminPort, HOST, () => {
        console.log('🔐 Turmstatus Admin-Panel (eingebettet) läuft');
        console.log(`   URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${adminPort}`);
      });
    }

    installSigtermHandler(server, 'Server');
  } catch (error) {
    console.error('❌ Fehler beim Starten des Servers:', error.message);
    process.exit(1);
  }
}

installFatalHandlers();

start();
