-- ============================================================
-- Turmstatus – Datenbank-Schema (SQLite 3)
-- Digitales Wach- und Statussystem für Wasserrettung
-- ============================================================

-- Users (Authentifizierung + Rolle)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'WACHGAENGER',   -- HAUPTWACHE | WACHFUEHRER | WACHGAENGER | BOOTSFUEHRER
  tower_id INTEGER,                            -- Stationierung (welcher Turm) – optional, informativ
  owner_id INTEGER,                            -- Scope-Isolation: Wachführer, dem dieses Personal-Konto gehört (NULL bei WF/Admin)
  is_admin BOOLEAN DEFAULT 0,                  -- 1 = Admin-Panel-Zugriff (App-Admin)
  is_active BOOLEAN DEFAULT 1,
  last_login DATETIME,                         -- Letzter erfolgreicher Login (UTC), NULL = noch nie
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tower_id) REFERENCES towers(id) ON DELETE SET NULL
);

-- Türme (Wachtürme)
CREATE TABLE IF NOT EXISTS towers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  call_sign TEXT,                              -- Funkrufname
  latitude REAL,
  longitude REAL,
  required_staff INTEGER NOT NULL DEFAULT 2,   -- Sollstärke (für abgeleitete Turmfarbe)
  owner_id INTEGER,                            -- Scope-Isolation: Wachführer, dem dieser Turm gehört
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Demo-Konfiguration: Türme-Vorlage. Vom App-Admin gepflegt; beim Anlegen jedes
-- neuen Wachführer-Kontos werden diese Türme als Startkonfiguration in dessen Scope
-- (towers.owner_id = neuer Wachführer) kopiert.
CREATE TABLE IF NOT EXISTS tower_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  call_sign TEXT,
  latitude REAL,
  longitude REAL,
  required_staff INTEGER NOT NULL DEFAULT 2,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Demo-Konfiguration: Boote-Vorlage. Vom App-Admin gepflegt; beim Anlegen jedes
-- neuen Wachführer-Kontos werden diese Boote als Startkonfiguration in dessen Scope
-- (boats.owner_id = neuer Wachführer) kopiert. Wie tower_templates, mit Status/Position.
CREATE TABLE IF NOT EXISTS boat_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  call_sign TEXT,
  status TEXT NOT NULL DEFAULT 'AT_TOWER',     -- AT_TOWER | PATROL | DEPLOYED | OUT_OF_SERVICE
  latitude REAL,
  longitude REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Wachgänger (Lageobjekt / mobile Einheit)
CREATE TABLE IF NOT EXISTS guards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                             -- optionale Verknüpfung zu users
  tower_id INTEGER,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_AREA',      -- IN_AREA | MINUS_ONE | DEPLOYED | BREAK
  latitude REAL,
  longitude REAL,
  owner_id INTEGER,                            -- Scope-Isolation: Wachführer, dem dieser Wachgänger gehört
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (tower_id) REFERENCES towers(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Boote (Rettungsboote)
CREATE TABLE IF NOT EXISTS boats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  call_sign TEXT,
  tower_id INTEGER,
  status TEXT NOT NULL DEFAULT 'AT_TOWER',     -- AT_TOWER | PATROL | DEPLOYED | OUT_OF_SERVICE
  latitude REAL,
  longitude REAL,
  owner_id INTEGER,                            -- Scope-Isolation: Wachführer, dem dieses Boot gehört
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tower_id) REFERENCES towers(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -1 / +1 Workflow (Bereich verlassen / Rückkehr)
CREATE TABLE IF NOT EXISTS minus_one_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guard_id INTEGER NOT NULL,
  requested_by INTEGER,                        -- users.id
  reason TEXT NOT NULL,                        -- PAUSE | TOILET | CATERING | MATERIAL | OTHER
  note TEXT,                                   -- Freitext
  status TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING | APPROVED | REJECTED | RETURNED
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME,
  decided_by INTEGER,                          -- users.id
  returned_at DATETIME,
  FOREIGN KEY (guard_id) REFERENCES guards(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Kontrollfahrt-Anfragen (nur Bootsführer beantragen; Genehmigen/Ablehnen durch
-- Hauptwache/Wachführer). Bewusst noch OHNE Boot-Statuslogik – erst der Workflow-
-- Rahmen (beantragen → genehmigen/ablehnen), die Folgeaktionen kommen später.
CREATE TABLE IF NOT EXISTS control_trip_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boat_id INTEGER NOT NULL,
  requested_by INTEGER,                        -- users.id (Bootsführer)
  note TEXT,                                   -- Freitext (z. B. Anlass der Kontrollfahrt)
  status TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING | APPROVED | REJECTED
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME,
  decided_by INTEGER,                          -- users.id
  FOREIGN KEY (boat_id) REFERENCES boats(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit-Log (DSGVO Art. 5 Abs. 1 f – Accountability, Art. 32 – Sicherheit)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                             -- NULL für System-Events
  action TEXT NOT NULL,
  entity_type TEXT,                            -- 'user' | 'tower' | 'guard' | 'boat' | 'request' | null
  entity_id INTEGER,
  details TEXT,                                -- JSON-String mit Zusatzinfos
  ip_address TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_guards_tower ON guards(tower_id);
CREATE INDEX IF NOT EXISTS idx_boats_tower ON boats(tower_id);
CREATE INDEX IF NOT EXISTS idx_towers_owner ON towers(owner_id);
CREATE INDEX IF NOT EXISTS idx_guards_owner ON guards(owner_id);
CREATE INDEX IF NOT EXISTS idx_boats_owner ON boats(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_owner ON users(owner_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON minus_one_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_guard ON minus_one_requests(guard_id);
CREATE INDEX IF NOT EXISTS idx_control_trips_status ON control_trip_requests(status);
CREATE INDEX IF NOT EXISTS idx_control_trips_boat ON control_trip_requests(boat_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
