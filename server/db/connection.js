// ============================================================
// Zentrale SQLite Datenbankverbindung
// (deckungsgleich mit dem Wachplan-Generator – nur DB-Name turmstatus.db,
//  damit beide Apps später dieselbe Infrastruktur teilen können)
// ============================================================

const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'turmstatus.db');
let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Database connection error:', err);
        db = null;
        return;
      }
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) console.warn('⚠ Foreign keys error:', err.message);
      });
      db.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) console.warn('⚠ WAL mode error:', err.message);
      });
      db.run('PRAGMA busy_timeout = 5000', (err) => {
        if (err) console.warn('⚠ Busy timeout error:', err.message);
      });
    });

    db.on('error', (err) => {
      console.error('❌ Database error:', err);
    });
  }
  return db;
}

// Promisify für async/await
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().run(query, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

module.exports = { getDb, dbRun, dbGet, dbAll, dbPath };
