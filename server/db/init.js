// ============================================================
// Database Initialization
// SQLite Setup, Schema Migration, Environment Validation, Seed
// (Aufbau deckungsgleich zum Wachplan-Generator – an die Turmstatus-Domäne angepasst:
//  Integritäts-Check, Session-Auto-Heilung, Init-Lock, journal_mode=DELETE)
// ============================================================

const sqlite3 = require('sqlite3');
const bcryptjs = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ Created data directory');
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'turmstatus.db');

const DB_BUSY_TIMEOUT_MS = Number.parseInt(process.env.DB_BUSY_TIMEOUT_MS || '30000', 10);
const INTEGRITY_RETRIES = Number.parseInt(process.env.DB_INTEGRITY_RETRIES || '6', 10);
const TRANSIENT_INTEGRITY_CODES = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_PROTOCOL']);
const INIT_LOCK_TIMEOUT_MS = Number.parseInt(process.env.DB_INIT_LOCK_TIMEOUT_MS || '60000', 10);
const INIT_LOCK_STALE_MS = Number.parseInt(process.env.DB_INIT_LOCK_STALE_MS || '120000', 10);

// ── Demo-Seed: Türme + Boote an der DLRG-Wache Dahme/Ostsee (nur wenn towers leer) ──
// Koordinaten an der Strandpromenade Dahme (Holstein); die Hauptwache liegt am
// zentralen Strandzugang, weitere Türme verteilen sich nordwärts/südwärts entlang
// der Promenade. Der Wachführer kann sie in der App frei verschieben/ergänzen.
const SEED_TOWERS = [
  { name: 'Hauptwache Dahme', call_sign: '06/01', latitude: 54.21449, longitude: 11.08967, required_staff: 3 },
  { name: 'Turm Nord', call_sign: '06/02', latitude: 54.21880, longitude: 11.09060, required_staff: 2 },
  { name: 'Turm Seebrücke', call_sign: '06/03', latitude: 54.21270, longitude: 11.08870, required_staff: 2 },
  { name: 'Turm Süd', call_sign: '06/04', latitude: 54.20950, longitude: 11.08740, required_staff: 2 }
];
const SEED_BOATS = [
  { name: 'Motorrettungsboot Dahme', call_sign: '06/Boot 1', towerIdx: 0, status: 'AT_TOWER', latitude: 54.21470, longitude: 11.09120 },
  { name: 'Rettungsboard-Streife', call_sign: '06/Boot 2', towerIdx: 0, status: 'PATROL', latitude: 54.21680, longitude: 11.09300 }
];

// Validate environment variables
function validateEnv() {
  const required = ['MASTER_SECRET', 'SALT', 'SESSION_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Set them in docker-compose.yml or .env file');
    process.exit(1);
  }

  if (process.env.MASTER_SECRET.length < 32) {
    console.error('❌ MASTER_SECRET must be at least 32 characters');
    process.exit(1);
  }
  if (process.env.SALT.length < 16) {
    console.error('❌ SALT must be at least 16 characters');
    process.exit(1);
  }
  if (process.env.SESSION_SECRET.length < 16) {
    console.error('❌ SESSION_SECRET must be at least 16 characters');
    process.exit(1);
  }

  const registrationMode = process.env.REGISTRATION_MODE || 'disabled';
  if (!['disabled', 'open', 'code'].includes(registrationMode)) {
    console.error('❌ REGISTRATION_MODE must be one of: disabled, open, code');
    process.exit(1);
  }
  if (registrationMode === 'code' && !process.env.REGISTRATION_CODE) {
    console.error('❌ REGISTRATION_CODE required when REGISTRATION_MODE=code');
    process.exit(1);
  }

  console.log('✓ Environment variables validated');
}

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX,
      (err) => {
      let releaseInitLock = null;
      if (err) {
        console.error('❌ Failed to open database:', err);
        reject(err);
        return;
      }

      console.log('✓ Database connection established:', dbPath);
      if (typeof db.configure === 'function') db.configure('busyTimeout', DB_BUSY_TIMEOUT_MS);

      // Rollback-Journal (DELETE) statt WAL – früh und auf DERSELBEN Verbindung, die
      // gleich das Schema schreibt. WAL ist zwischen zwei Prozessen auf einem geteilten
      // Volume nicht prozess-kohärent und korrumpiert die DB (s. connection.js). Setzt
      // zudem eine bestehende WAL-DB beim Start auf DELETE zurück, bevor irgendetwas
      // geschrieben wird. Init-Lock serialisiert parallele Starter (App + Admin-Panel).
      acquireInitLock()
        .then((release) => {
          releaseInitLock = release;
          return configureStartupConnection(db);
        })
        .then(() => checkIntegrity(db))
        .then(() => proceedAfterIntegrity())
        .catch((integErr) => {
          if (integErr && integErr.isInitLockError) {
            db.close(() => reject(integErr));
            return;
          }
          if (isTransientIntegrityError(integErr)) {
            console.warn('⚠ Database integrity check skipped: database is busy/locked.');
            console.warn('   This is not corruption. Another process is currently using ' + dbPath);
            proceedAfterIntegrity();
            return;
          }
          // Auto-Heilung: Ist die Beschädigung auf die (wegwerfbare) sessions-Tabelle
          // beschränkt, kann sie gefahrlos entfernt werden – connect-sqlite3 legt sie
          // beim nächsten Session-Schreiben neu an. Nutzer/Daten bleiben unberührt.
          healSessionCorruption(db, integErr).then((healed) => {
            if (healed) { proceedAfterIntegrity(); return; }

            console.error('');
            console.error('============================================================');
            console.error('❌ DATENBANK-INTEGRITÄTSPRÜFUNG FEHLGESCHLAGEN');
            console.error('   ' + integErr.message);
            console.error('   Datei: ' + dbPath);
            console.error('   Vermutlich beschädigt (SQLITE_CORRUPT). Wiederherstellung:');
            console.error('     1) Container stoppen');
            console.error('     2) sqlite3 turmstatus.db ".recover" | sqlite3 turmstatus.db.recovered');
            console.error('     3) recovered-DB nach Prüfung einspielen, -wal/-shm löschen');
            console.error('============================================================');
            console.error('');
            if (process.env.DB_ALLOW_CORRUPT_START !== '1') {
              console.error('   Start wird abgebrochen. Setze DB_ALLOW_CORRUPT_START=1 nur zur Notfall-Datenrettung.');
              db.close((closeErr) => {
                if (releaseInitLock) releaseInitLock();
                reject(closeErr || integErr);
              });
              return;
            }
            proceedAfterIntegrity();
          });
        });

      function proceedAfterIntegrity() {
        // Drop legacy/incorrectly-structured sessions table; connect-sqlite3 recreates it.
        // Nur bei altem/falschem Schema droppen – sonst würden persistente Sessions
        // (Merke-mich) bei jedem Neustart gelöscht.
        db.all('PRAGMA table_info(sessions)', (err, cols) => {
          if (err || !cols || cols.length === 0) return;
          const names = cols.map(c => c.name);
          if (names.includes('expiryDate') || names.includes('session')) {
            db.run('DROP TABLE IF EXISTS sessions', () => {});
          }
        });

        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');

        db.exec(schema, (err) => {
          if (err) {
            console.error('❌ Failed to execute schema:', err);
            db.close(() => {
              if (releaseInitLock) releaseInitLock();
              reject(err);
            });
            return;
          }

          console.log('✓ Database schema initialized');

          // Idempotente Migrationen (greifen NICHT über CREATE TABLE IF NOT EXISTS auf
          // Bestands-DBs). Für jede neue Spalte ein ALTER TABLE; Fehler ("duplicate
          // column name") werden bewusst ignoriert. sqlite3 serialisiert Statements.
          db.run("ALTER TABLE users ADD COLUMN last_login DATETIME", () => {});
          db.run("ALTER TABLE users ADD COLUMN full_name TEXT", () => {});
          db.run("ALTER TABLE users ADD COLUMN tower_id INTEGER", () => {});
          db.run("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1", () => {});

          // Rollen-Umbenennung TURMFUEHRER → WACHFUEHRER (Bestands-DBs). Idempotent:
          // greift nur, solange noch alte Rollenwerte existieren.
          db.run("UPDATE users SET role = 'WACHFUEHRER' WHERE role = 'TURMFUEHRER'", () => {});

          // Domain-Seed (Türme/Boote) + Admin-Seed nacheinander
          seedDomain(db, () => seedAdmin(db, (seedErr) => {
            db.close((closeErr) => {
              if (releaseInitLock) releaseInitLock();
              if (seedErr) reject(seedErr);
              else if (closeErr) reject(closeErr);
              else resolve();
            });
          }));
        });
      } // end proceedAfterIntegrity
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Datei-basiertes Init-Lock (mkdir ist atomar): serialisiert mehrere Prozesse, die
// dieselbe DB gleichzeitig initialisieren (z. B. App + standalone Admin-Panel beim
// Hochfahren). Verhindert Schema-/Migrations-Races. Stale-Locks (Crash) werden
// nach INIT_LOCK_STALE_MS entfernt.
function acquireInitLock() {
  const lockDir = `${dbPath}.init.lock`;
  const started = Date.now();

  return new Promise(async (resolve, reject) => {
    while (true) {
      try {
        fs.mkdirSync(lockDir);
        fs.writeFileSync(path.join(lockDir, 'owner'), `${process.pid}\n${new Date().toISOString()}\n`);
        return resolve(() => {
          try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch {}
        });
      } catch (err) {
        if (!err || err.code !== 'EEXIST') {
          if (err) err.isInitLockError = true;
          return reject(err);
        }

        try {
          const stat = fs.statSync(lockDir);
          if (Date.now() - stat.mtimeMs > INIT_LOCK_STALE_MS) {
            console.warn('Stale database init lock removed: ' + lockDir);
            fs.rmSync(lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {}

        if (Date.now() - started > INIT_LOCK_TIMEOUT_MS) {
          const timeout = new Error(`Timed out waiting for database init lock: ${lockDir}`);
          timeout.isInitLockError = true;
          return reject(timeout);
        }

        await sleep(250);
      }
    }
  });
}

function runDb(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

async function configureStartupConnection(db) {
  // Queue these explicitly before any schema writes or integrity reads.
  await runDb(db, `PRAGMA busy_timeout = ${DB_BUSY_TIMEOUT_MS}`);
  await runDb(db, 'PRAGMA journal_mode = DELETE');
}

function isTransientIntegrityError(err) {
  if (!err) return false;
  if (TRANSIENT_INTEGRITY_CODES.has(err.code)) return true;
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(String(err.message || ''));
}

// Führt PRAGMA integrity_check aus und lehnt ab, wenn die DB beschädigt ist.
function checkIntegrity(db) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const runCheck = () => {
      db.all('PRAGMA integrity_check', (err, rows) => {
        if (err) {
          if (isTransientIntegrityError(err) && attempt < INTEGRITY_RETRIES) {
            attempt += 1;
            setTimeout(runCheck, 250 * attempt);
            return;
          }
          reject(err);
          return;
        }
        const lines = (rows || []).map(r => r && r.integrity_check).filter(Boolean);
        if (lines.length === 1 && lines[0] === 'ok') {
          console.log('✓ Database integrity check: ok');
          resolve();
        } else {
          reject(new Error('integrity_check: ' + (lines.join('; ') || 'unbekannter Fehler')));
        }
      });
    };
    runCheck();
  });
}

// Prüft, ob eine integrity_check-Meldung AUSSCHLIESSLICH die (wegwerfbare)
// sessions-Tabelle/ihren Autoindex betrifft.
function isSessionsOnlyCorruption(message) {
  const m = String(message || '').toLowerCase();
  if (!m.includes('sessions')) return false;
  if (/\bidx_[a-z0-9_]+/.test(m)) return false;
  const autoIdxTables = [...m.matchAll(/sqlite_autoindex_([a-z0-9_]+?)_\d+/g)].map(x => x[1]);
  if (autoIdxTables.some(t => t !== 'sessions')) return false;
  return true;
}

// Versucht, eine auf die sessions-Tabelle beschränkte Beschädigung automatisch zu
// beheben: Tabelle droppen, VACUUM, erneut per integrity_check verifizieren.
// Per DB_NO_SESSION_AUTOHEAL=1 abschaltbar.
function healSessionCorruption(db, integErr) {
  return new Promise((resolve) => {
    if (process.env.DB_NO_SESSION_AUTOHEAL === '1') return resolve(false);
    if (!isSessionsOnlyCorruption(integErr && integErr.message)) return resolve(false);

    console.warn('⚠ DB-Beschädigung betrifft nur die (wegwerfbare) sessions-Tabelle – versuche Auto-Heilung…');
    db.run('DROP TABLE IF EXISTS sessions', (dropErr) => {
      if (dropErr) {
        console.error('   Auto-Heilung fehlgeschlagen (DROP sessions): ' + dropErr.message);
        return resolve(false);
      }
      db.run('VACUUM', () => {
        checkIntegrity(db)
          .then(() => {
            console.log('✓ Auto-Heilung erfolgreich: beschädigte sessions-Tabelle entfernt.');
            console.log('  Sessions sind wegwerfbar – Nutzer/Daten unberührt. Bitte erneut anmelden.');
            resolve(true);
          })
          .catch(() => resolve(false));
      });
    });
  });
}

// Türme/Boote anlegen, falls noch keine vorhanden (Demo-Lagebild beim Erststart)
function seedDomain(db, done) {
  db.get('SELECT COUNT(*) AS count FROM towers', (err, row) => {
    if (err || (row && row.count > 0)) return done();

    db.serialize(() => {
      const towerIds = [];
      let pending = SEED_TOWERS.length;
      if (pending === 0) return done();

      SEED_TOWERS.forEach((t, idx) => {
        db.run(
          'INSERT INTO towers (name, call_sign, latitude, longitude, required_staff) VALUES (?, ?, ?, ?, ?)',
          [t.name, t.call_sign, t.latitude, t.longitude, t.required_staff],
          function () {
            towerIds[idx] = this.lastID;
            if (--pending === 0) {
              let bp = SEED_BOATS.length;
              if (bp === 0) { console.log('✓ Seeded demo towers'); return done(); }
              SEED_BOATS.forEach((b) => {
                db.run(
                  'INSERT INTO boats (name, call_sign, tower_id, status, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
                  [b.name, b.call_sign, towerIds[b.towerIdx] || null, b.status, b.latitude, b.longitude],
                  () => { if (--bp === 0) { console.log('✓ Seeded demo towers + boats'); done(); } }
                );
              });
            }
          }
        );
      });
    });
  });
}

// Auto-create admin (Hauptwache) if ADMIN_USERNAME + ADMIN_PASSWORD set and none exists
function seedAdmin(db, done) {
  db.get("SELECT COUNT(*) as count FROM users WHERE is_admin = 1", async (err, row) => {
    if (err) return done(err);

    const autoUser = process.env.ADMIN_USERNAME;
    const autoPass = process.env.ADMIN_PASSWORD;

    if (row.count === 0 && autoUser && autoPass) {
      try {
        const hash = await bcryptjs.hash(autoPass, 10);
        db.run(
          "INSERT INTO users (username, password_hash, full_name, role, is_admin) VALUES (?, ?, ?, 'HAUPTWACHE', 1)",
          [autoUser, hash, 'Hauptwache'],
          (insertErr) => {
            if (insertErr && !insertErr.message.includes('UNIQUE')) {
              console.error('❌ Failed to create default admin:', insertErr.message);
            } else if (!insertErr) {
              console.log(`✓ Default admin (Hauptwache) created: ${autoUser}`);
            }
            done();
          }
        );
      } catch (hashErr) {
        console.error('❌ Hash error:', hashErr.message);
        done();
      }
    } else {
      if (row.count === 0) console.log('⚠ No admin user. Set ADMIN_USERNAME + ADMIN_PASSWORD or use /api/auth/init');
      done();
    }
  });
}

// Audit logging helper (für direkte db-Verbindung, z. B. System-Events)
function auditLog(db, userId, action, entityType = null, entityId = null, details = null, ipAddress = null) {
  return new Promise((resolve, reject) => {
    const detailsStr = details ? JSON.stringify(details) : null;
    db.run(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId, detailsStr, ipAddress],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

// Main initialization (CLI)
async function main() {
  try {
    validateEnv();
    await initDatabase();
    console.log('✓ Database initialization complete');
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

module.exports = { initDatabase, validateEnv, auditLog };

if (require.main === module) {
  main();
}
