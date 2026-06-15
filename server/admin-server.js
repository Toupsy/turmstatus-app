// ============================================================
// Admin-Server – separater Port (3001) für das Admin-Panel
// Gleiches Image, anderer Entry-Point (analog Wachplan-Generator).
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const { createSessionMiddleware } = require('./db/session');
const { initDatabase, validateEnv } = require('./db/init');
const authApi = require('./api/auth');
const adminApi = require('./api/admin');

const app = express();
app.set('trust proxy', 1);
const ADMIN_PORT = process.env.ADMIN_PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

validateEnv();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; frame-ancestors 'self'");
  if (process.env.NODE_ENV === 'production')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admin-panel', timestamp: new Date().toISOString() });
});

async function start() {
  try {
    const { dbPath } = require('./db/connection');
    await initDatabase();
    console.log('✓ Database ready');

    app.use(createSessionMiddleware({ resave: false, saveUninitialized: false }));

    console.log('Registering admin API routes...');
    app.use('/api/auth', authApi);
    app.use('/api/admin', adminApi);
    console.log('✓ Admin API routes registered');

    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
    app.get('/admin.html', (req, res) => res.redirect('/'));

    app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.url, service: 'admin-panel' }));
    app.use((err, req, res, next) => { console.error('Error:', err); res.status(500).json({ error: 'Internal server error' }); });

    const server = app.listen(ADMIN_PORT, HOST, () => {
      console.log('🔐 Turmstatus Admin-Panel läuft');
      console.log(`   URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${ADMIN_PORT}`);
      console.log(`   Datenbank: ${dbPath}`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM empfangen, fahre herunter...');
      server.close(() => { console.log('Admin-Server beendet'); process.exit(0); });
    });
  } catch (error) {
    console.error('❌ Fehler beim Starten des Admin-Servers:', error.message);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => console.error('❌ Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));

start();
