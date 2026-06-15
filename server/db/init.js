// ============================================================
// Database Initialization
// SQLite Setup, Schema Migration, Environment Validation, Seed
// (Aufbau analog zum Wachplan-Generator – an die Turmstatus-Domäne angepasst)
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

// ── Demo-Seed: Türme + Boote an Ostsee-Koordinaten (nur wenn towers leer) ──
const SEED_TOWERS = [
  { name: 'Turm 1', call_sign: '9/12', latitude: 54.0145, longitude: 13.7680, required_staff: 2 },
  { name: 'Turm 2', call_sign: '9/14', latitude: 54.0182, longitude: 13.7725, required_staff: 2 },
  { name: 'Turm 3', call_sign: '9/16', latitude: 54.0221, longitude: 13.7771, required_staff: 2 },
  { name: 'Turm 4', call_sign: '9/18', latitude: 54.0260, longitude: 13.7818, required_staff: 2 }
];
const SEED_BOATS = [
  { name: 'Boot 78/1', call_sign: '78/1', towerIdx: 0, status: 'AT_TOWER', latitude: 54.0140, longitude: 13.7700 },
  { name: 'Boot 78/2', call_sign: '78/2', towerIdx: 2, status: 'PATROL', latitude: 54.0210, longitude: 13.7790 }
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
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Failed to open database:', err);
        reject(err);
        return;
      }

      console.log('✓ Database connection established:', dbPath);

      // Drop legacy/incorrect sessions table; connect-sqlite3 recreates it correctly.
      db.run('DROP TABLE IF EXISTS sessions', () => {});

      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      db.exec(schema, (err) => {
        if (err) {
          console.error('❌ Failed to execute schema:', err);
          db.close(() => reject(err));
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

        // Domain-Seed (Türme/Boote) + Admin-Seed nacheinander
        seedDomain(db, () => seedAdmin(db, (err) => {
          if (err) db.close(() => reject(err));
          else db.close((closeErr) => closeErr ? reject(closeErr) : resolve());
        }));
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
