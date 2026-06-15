# Turmstatus – Projektkontext

> **Doku-Landkarte (Token-sparend lesen!):**
> - **CLAUDE.md** (diese Datei, immer geladen): Architektur, Datenmodell, Konventionen & Fallen. Schlank halten.
> - **HANDOFF.md**: Schnelleinstieg + aktueller Arbeits-/Review-Stand. **Zuerst lesen.**
> - **docs/FEATURES.md**: ausführliche Feature-/Bugfix-Historie (nur bei Bedarf öffnen).
> - **README.md / ARCHITECTURE.md / docs/**: Nutzer-Doku, Architekturkonzept, Deployment.
>
> **Schwester-Projekt:** Diese App ist bewusst **deckungsgleich** zum
> **DLRG-Wachplan-Generator** (`Toupsy/wachplan-generator`) aufgebaut – gleiche
> Infrastruktur (Express + SQLite + Vanilla JS, Session-Auth, AES-Crypto-Schicht,
> Admin-Server, GHCR/Semantic-Release). Ziel: beide Programme später zusammenführen.
> Beim Ändern der Infrastruktur möglichst **beide Codebases parallel** halten.

## Git-Workflow
- **Niemals direkt auf `main` committen/pushen.** Branch: `feature/<name>` oder `fix/<name>`.
- **Versioning:** automatisch via Semantic Release nach Merge auf `main` (Commit-Prefix
  `fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major, `chore:` → kein Bump).
  Source of Truth: `package.json:version`; `@semantic-release/git` committet den Bump zurück.
  `GET /api/version` → `{ version, latest, updateAvailable, releaseUrl }` (latest gecacht 6 h von GitHub).
- Remote: `https://github.com/Toupsy/turmstatus-app`

---

## Was ist das?
Digitales **Wach- und Statussystem** für einen Wasserrettungsdienst an der Ostsee.
Ersetzt den Funkverkehr (`-1` beim Verlassen, `+1` bei Rückkehr) durch einen digitalen
Genehmigungs-Workflow und zeigt die Lage aller **Türme, Wachgänger, Boote** in **Echtzeit**
auf einer OpenStreetMap-Karte (Leaflet).

- **Frontend:** reines **Vanilla JS** (kein Framework), `public/Turmstatus.html` + `public/js/*`.
- **Backend:** **Express + SQLite**, Session-Auth (bcryptjs), WebSocket-Live-Lagebild.
- **Start:** `npm start` → `server/server.js` (Port 3000); Admin: `server/admin-server.js` (Port 3001).
- **Tests:** `npm test` (Node `--test`).

---

## Codebase-Map (1 Zeile pro Modul)

**Backend `server/`:**
```
server.js          Express (Port 3000), Static aus ../public, Route-Registration, /api/version, /api/config, WS
admin-server.js    Admin-Server (Port 3001), gleiches Image, anderer Entry-Point (Benutzerverwaltung + Audit)
realtime.js        WebSocket-Server (/api/ws): broadcast(type) an ALLE Clients (gemeinsames Lagebild)
status.js          Reine Statuslogik: deriveTowerStatus() (DOM-/DB-frei, testbar)
middleware.js      requireAuth (lädt req.user inkl. Rolle) + requireRole(...) (HAUPTWACHE darf alles)
config.json        Enums/Labels (Rollen, Status, Gründe) + Map-Defaults → GET /api/config
db/connection.js   Zentrale SQLite-Verbindung: getDb()/dbRun/dbGet/dbAll/dbPath
db/init.js         Schema-Init, idempotente ALTER TABLE-Migrationen, Demo-Seed (Türme/Boote), Admin-Seed, validateEnv()
db/schema.sql      Schema (users, towers, guards, boats, minus_one_requests, audit_log; sessions via connect-sqlite3)
db/crypto.js       AES-256-GCM + deriveKey (PBKDF2 100k) – Schicht für künftige verschlüsselte Daten (mergebar)
db/session.js      createSessionMiddleware (SQLite-Store, DRY für beide Server)
db/ids.js          parsePositiveInt (strikte ID-Validierung, kein '5abc'→5)
db/audit.js        recordAudit(req, action, ...) → audit_log
api/auth.js        login/logout/me/init/needs-setup/registration/register/password + Brute-Force-Schutz
api/towers.js      Türme: Liste mit abgeleitetem Status, CRUD [HAUPTWACHE | TURMFUEHRER(eigener)]
api/guards.js      Wachgänger: Liste, CRUD, Status/Position
api/boats.js       Boote: Liste, CRUD, Status/Position
api/requests.js    -1/+1-Workflow: beantragen → genehmigen/ablehnen → Rückkehr
api/dashboard.js   GET /summary – Lage-Kennzahlen
api/admin.js       Admin-only: Benutzerverwaltung + Audit-Log (vom Haupt- UND Admin-Server gemountet)
```
**Pfad-Konvention:** `server/*` → `../public`/`../data`; `server/db/*` → `../../data`.

**Frontend `public/js/`** — Ladereihenfolge in `Turmstatus.html` beachten:
```
state.js   Globaler Zustand (appConfig, currentUser, towers, guards, boats, requests, users, _map)
utils.js   escapeHtml, showToast, fmtTime, labelOf, statusPill, openModal/closeModal
api.js     apiGet/apiPost/apiPatch/apiDelete (Session-Cookies, JSON)
auth.js    Login/Setup/Register-Modal + User-Header + Passwortwechsel
map.js     Leaflet-Karte: initMap(), renderMap() (Türme farbcodiert, Wachgänger/Boote als Marker)
views.js   Datenladen (refreshX) + Rendering aller Tabellen/Modals + -1/+1-Aktionen
ws.js      WebSocket-Client (/api/ws) → Refresh je Event + 30-s-Polling-Fallback
init.js    Bootstrap: Config laden → Auth → onAuthenticated(); Tab-Steuerung; Event-Listener
```
**Ladereihenfolge:** state → utils → api → auth → map → views → ws → init.
`public/admin.html` ist self-contained (eigenes Inline-JS, da Admin-Server-CSP keine externen Skripte erlaubt).

---

## Datenmodell (SQLite, `db/schema.sql`)
```
users   id, username, password_hash, full_name, role[HAUPTWACHE|TURMFUEHRER|WACHGAENGER],
        tower_id(FK), is_admin, is_active, last_login, created_at, updated_at
towers  id, name, call_sign, latitude, longitude, required_staff, created_at
guards  id, user_id(FK), tower_id(FK), name, status[IN_AREA|MINUS_ONE|DEPLOYED|BREAK], lat, lng, updated_at
boats   id, name, call_sign, tower_id(FK), status[AT_TOWER|PATROL|DEPLOYED|OUT_OF_SERVICE], lat, lng, updated_at
minus_one_requests  id, guard_id(FK), requested_by(FK), reason[PAUSE|TOILET|CATERING|MATERIAL|OTHER],
                    note, status[PENDING|APPROVED|REJECTED|RETURNED], rejection_reason,
                    created_at, decided_at, decided_by(FK), returned_at
audit_log  id, user_id(FK), action, entity_type, entity_id, details(JSON), ip_address, timestamp
```
**Turmfarbe (`status.js`):** besetzt = Wachgänger mit Status `IN_AREA`.
`GREEN` ≥ Sollstärke, `YELLOW` ≥ 50 %, sonst `RED`.
**Rollen serverseitig erzwungen** (`middleware.js`): HAUPTWACHE darf alles; Turmführer nur eigenen Turm; Wachgänger nur eigenen Status/-1.

---

## Konventionen & Fallen (können Bugs verursachen)
- **DB-Migrationen:** `schema.sql` nutzt `CREATE TABLE IF NOT EXISTS` → neue Spalten greifen
  NICHT auf Bestands-DBs. Für jede neue Spalte **idempotente `ALTER TABLE ... ADD COLUMN`** in
  `db/init.js` (Fehler „duplicate column name" bewusst ignorieren).
- **DB-Verbindung:** `db/connection.js` exportiert **kein** `db`-Feld, nur `getDb()`/`dbRun`/
  `dbGet`/`dbAll`. Für eine rohe Verbindung immer `getDb()` nutzen.
- **Realtime:** Jede Mutation in den `api/*`-Routen ruft `broadcast('<typ>-updated')` → alle
  Clients refreshen. Neue mutierende Endpunkte daher **immer** broadcasten, sonst kein Live-Update
  (es greift nur das 30-s-Polling). Typen siehe `ws.js:_handleEvent`.
- **Audit:** Jede Mutation `recordAudit(req, action, entityType, entityId, details?)` aufrufen.
- **IDs:** Route-IDs immer über `parsePositiveInt()` validieren (keine teilgeparsten IDs in Queries).
- **Kein Framework:** Re-Render via komplettem `innerHTML`-Replace; alle Nutzer-Eingaben über
  `escapeHtml()`/`textContent` (XSS).
- **CSP:** Haupt-Server erlaubt `unpkg.com` (Leaflet) + OSM-Tiles. Admin-Server nur `'self'`
  (deshalb ist `admin.html` self-contained). Beim Zentralisieren erhalten.
- **Crypto-Schicht:** `db/crypto.js` ist (identisch zum Wachplan-Generator) vorhanden, aber im
  Lagebild noch ungenutzt – bereit für künftige verschlüsselte Daten. `MASTER_SECRET`/`SALT`
  nicht ändern, sobald verschlüsselte Daten existieren.
- **Timezone:** SQLite-Zeitstempel sind UTC; im Frontend (`fmtTime`) als UTC interpretiert und lokal formatiert.

---

## Testing
`npm test` → Node `--test` (`test/*.test.js`):
- `status.test.js` – Turmfarben-Ableitung (reine Logik).
- `ids.test.js` – ID-Parsing.
- `crypto.test.js` – AES-Round-Trip + falscher Key.
- `api.test.js` – **Integrationstest**: bootet den Server (eigene temp-DB), prüft Auth-Gate,
  Login, Seed-Türme und den vollständigen -1/+1-Workflow.
**CI:** `.github/workflows/test.yml` (`npm ci` + `npm test`, Node 20) bei jedem push/PR → roter Test blockt Merge.

---

## Doku aktuell halten (Wartungsvertrag – gilt für JEDE Session/JEDEN Agenten)
| Was hat sich geändert? | Datei |
|---|---|
| Neues Feature / Bugfix (funktional) | **docs/FEATURES.md** |
| Architektur, Datenmodell, neue Konvention/Falle, neue/umbenannte Moduldatei | **CLAUDE.md** (Abschnitt + Codebase-Map) |
| Arbeitsstand, offene ToDos | **HANDOFF.md** |
| Deployment / Datenschutz | `docs/*` |

Faustregel: **CLAUDE.md = stabiles Wissen**, **FEATURES.md = Historie**, **HANDOFF.md = aktueller Stand**.
