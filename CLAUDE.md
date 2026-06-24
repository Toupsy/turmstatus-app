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
- **Start:** `npm start` → `server/server.js` (Port 3002). Admin-Panel (Port 3003) wird per
  `ADMIN_PORT` **im selben Prozess** mitbedient (eingebettet, EIN DB-Öffner); `server/admin-server.js`
  bleibt Standalone-Entry-Point (eigene DB) bzw. liefert `createAdminApp()` für die Einbettung.
- **Tests:** `npm test` (Node `--test`).

---

## Codebase-Map (1 Zeile pro Modul)

**Backend `server/`:**
```
server.js          Express (Port 3002), Static aus ../public, Route-Registration, /api/version, /api/config, WS
admin-server.js    createAdminApp({sessionMiddleware}) (vom Haupt-Prozess auf ADMIN_PORT eingebettet) + Standalone-Start (require.main-Guard, eigene DB)
realtime.js        WebSocket-Server (/api/ws): broadcast(type) an ALLE Clients (gemeinsames Lagebild)
status.js          Reine Statuslogik: deriveTowerStatus() (DOM-/DB-frei, testbar)
middleware.js      requireAuth (lädt req.user inkl. Rolle) + requireRole(...) (HAUPTWACHE darf alles)
http-common.js     Geteilte HTTP-Bausteine: securityHeaders, trustProxyValue (TRUST_PROXY-Env), overrideClientIp (req.ip aus CF-Connecting-IP/X-Forwarded-For – Audit+Rate-Limit; fälschbar ohne Origin-Lockdown), 404/Error/Signal-Handler
config.json        Enums/Labels (Rollen, Status, Gründe) + Map-Defaults → GET /api/config
db/connection.js   Zentrale SQLite-Verbindung: getDb()/dbRun/dbGet/dbAll/dbPath
db/init.js         Schema-Init, idempotente ALTER TABLE-Migrationen, Demo-Seed (Türme/Boote), Admin-Seed, validateEnv()
db/schema.sql      Schema (users, towers, guards, boats, minus_one_requests, audit_log; sessions via connect-sqlite3)
db/crypto.js       AES-256-GCM + deriveKey (PBKDF2 100k) – Schicht für künftige verschlüsselte Daten (mergebar)
db/session.js      createSessionMiddleware (SQLite-Store, DRY für beide Server)
db/ids.js          parsePositiveInt (strikte ID-Validierung, kein '5abc'→5)
db/audit.js        recordAudit(req, action, ...) → audit_log
api/auth.js        login/logout/me/init/needs-setup/registration/register/password + Brute-Force-Schutz
api/towers.js      Türme: Liste mit abgeleitetem Status, CRUD [HAUPTWACHE | WACHFUEHRER(eigener)]
api/guards.js      Wachgänger: Liste, CRUD, Status/Position
api/boats.js       Boote: Liste, CRUD, Status/Position
api/requests.js    -1/+1-Workflow: beantragen → genehmigen/ablehnen → Rückkehr
api/control-trips.js Kontrollfahrt-Anfragen: Bootsführer beantragt → WACHFUEHRER(eigene Wache) genehmigt/lehnt ab (Admin view-only); NOCH ohne Boot-Statuslogik – grober Workflow-Rahmen
api/dashboard.js   GET /summary – Lage-Kennzahlen
api/admin.js       App-Admin (is_admin): Benutzerverwaltung (legt v.a. WACHFUEHRER an) + Audit-Log + GET /towers (Haupt- UND Admin-Server)
api/team.js        Wachführer verwalten EIGENES Wachpersonal (WACHGAENGER/BOOTSFUEHRER), streng auf eigene Wache (tower_id) gescoped
```
**Pfad-Konvention:** `server/*` → `../public`/`../data`; `server/db/*` → `../../data`.

**Frontend `public/js/`** — Ladereihenfolge in `Turmstatus.html` beachten:
```
state.js   Globaler Zustand (appConfig, currentUser, towers, guards, boats, requests, controlTrips, users, _map); Rollen-Helfer isHauptwache/isWachfuehrer/isBootsfuehrer/canManage(App-Admin)/canManageTeam(Wachführer)
utils.js   escapeHtml, showToast, fmtTime, labelOf, statusPill, openModal/closeModal
api.js     apiGet/apiPost/apiPatch/apiDelete (Session-Cookies, JSON)
auth.js    Login/Setup/Register-Modal + User-Header + Passwortwechsel
map.js     Leaflet-Karte: initMap(), renderMap() (Türme farbcodiert, Wachgänger/Boote als Marker)
views.js   Datenladen (refreshX) + Rendering aller Tabellen/Modals + -1/+1-Aktionen + Kontrollfahrt-Aktionen; Benutzerverwaltung schaltet per userApiBase() zwischen /api/admin/users (App-Admin) und /api/team/members (Wachführer)
ws.js      WebSocket-Client (/api/ws) → Refresh je Event + 30-s-Polling-Fallback
init.js    Bootstrap: Config laden → Auth → onAuthenticated(); Tab-Steuerung; Event-Listener
```
**Ladereihenfolge:** state → utils → api → auth → map → views → ws → init.
`public/admin.html` ist self-contained (eigenes Inline-JS, da Admin-Server-CSP keine externen Skripte erlaubt).

---

## Datenmodell (SQLite, `db/schema.sql`)
```
users   id, username, password_hash, full_name, role[HAUPTWACHE|WACHFUEHRER|WACHGAENGER|BOOTSFUEHRER],
        tower_id(FK), is_admin, is_active, last_login, created_at, updated_at
towers  id, name, call_sign, latitude, longitude, required_staff, created_at
guards  id, user_id(FK), tower_id(FK), name, status[IN_AREA|MINUS_ONE|DEPLOYED|BREAK], lat, lng, updated_at
boats   id, name, call_sign, tower_id(FK), status[AT_TOWER|PATROL|DEPLOYED|OUT_OF_SERVICE], lat, lng, updated_at
minus_one_requests  id, guard_id(FK), requested_by(FK), reason[PAUSE|TOILET|CATERING|MATERIAL|OTHER],
                    note, status[PENDING|APPROVED|REJECTED|RETURNED], rejection_reason,
                    created_at, decided_at, decided_by(FK), returned_at
control_trip_requests  id, boat_id(FK), requested_by(FK), note, status[PENDING|APPROVED|REJECTED],
                    rejection_reason, created_at, decided_at, decided_by(FK)
audit_log  id, user_id(FK), action, entity_type, entity_id, details(JSON), ip_address, timestamp
```
**Turmfarbe (`status.js`):** besetzt = Wachgänger mit Status `IN_AREA`.
`GREEN` ≥ Sollstärke, `YELLOW` ≥ 50 %, sonst `RED`.
**Rollen serverseitig erzwungen** (`middleware.js` + endpunktspezifische Gates):
- **App-Admin** (`is_admin`, Rolle HAUPTWACHE): Account-Verwaltung (legt Wachführer an) + **reine Ansicht**.
  Hat **KEINE** operativen Bestätigungsrechte – -1- und Kontrollfahrt-Genehmigung sind ihm verwehrt
  (eigene Gates in `requests.js`/`control-trips.js`, NICHT über `requireRole` mit HAUPTWACHE-Bypass).
- **Wachführer**: sieht alles; **genehmigt/lehnt ab** (-1 + Kontrollfahrten) **nur für die eigene Wache**
  (Turm-Match); verwaltet eigenes Personal (Turm).
- **Wachgänger**: sieht alles; darf nur **-1 beantragen**.
- **Bootsführer**: wie Wachgänger + darf **Kontrollfahrten beantragen**.

> **Falle:** `requireRole(...)` lässt HAUPTWACHE immer durch („darf alles"). Für die Genehmigungs-
> Endpunkte ist das bewusst NICHT genutzt – stattdessen prüfen `loadDecidableRequest()` /
> `loadDecidable()` explizit `role==='WACHFUEHRER' && tower_id===<Wache der Anfrage>`. Wer einen
> neuen operativen Bestätigungs-Endpunkt baut, darf den Admin NICHT per `requireRole` durchlassen.

**Konten-Hierarchie (Account-Anlage):** Der **App-Admin** (`is_admin`, technischer Administrator – NICHT „die Hauptwache", die liegt extern) legt über `/api/admin/*` v. a. **Wachführer** an und weist ihnen ihre Wache (`tower_id`) zu. **Wachführer** legen über `/api/team/*` das **eigene** Wachpersonal (Wachgänger/Bootsführer) an – `tower_id` wird serverseitig auf die eigene Wache erzwungen, sodass kein Wachführer in eine fremde Wache eingreifen kann. Es muss nicht jeder Wachgänger ein eigenes Konto haben (ein gemeinsames Konto pro Wache genügt, ist aber nicht erzwungen).
**Hinweis (NOCH OFFEN):** „Hauptwache" als von der App-Admin-Rolle getrennte, externe Instanz ist konzeptionell gewünscht, aber noch nicht modelliert – aktuell ist `role=HAUPTWACHE` + `is_admin=1` der App-Admin. Kontrollfahrt-Folgelogik (Boot-Status etc.) folgt später.

---

## DB-Zugriff & Ports (deckungsgleich Wachplan-Generator – nicht abweichen!)

**EIN Prozess öffnet die DB (SQLITE_CORRUPT-Dauerfix):** SQLite koordiniert gleichzeitige
Zugriffe nur **innerhalb eines Prozesses** zuverlässig. Liefen App (3002) und Admin-Panel
(3003) als **zwei** Container auf demselben Volume, öffneten zwei Prozesse dieselbe
`turmstatus.db` → transientes `SQLITE_CORRUPT: database disk image is malformed`. **Fix:**
`server.js` bettet das Admin-Panel via `createAdminApp({sessionMiddleware})` (aus
`admin-server.js`) auf `ADMIN_PORT` in den **Hauptprozess** ein (teilt dieselbe
Session-Middleware/DB-Verbindung); `docker-compose*.yml` starten nur noch **EINEN** Container
für beide Ports. `admin-server.js` bleibt als Standalone-Entry-Point (`require.main`-Guard)
für getrennten Betrieb erhalten – dann aber **nur mit eigener DB**. `RUN_EMBEDDED_ADMIN=0`
schaltet das Einbetten ab.

**Journal-Modus = DELETE (nicht WAL!):** WALs `-shm`-mmap ist prozessübergreifend nicht
kohärent. `journal_mode=DELETE` + `busy_timeout` an **allen** Writer-Connections:
`db/connection.js` (getDb, FULLMUTEX), `db/init.js` (Startup-Connection, konvertiert WAL→DELETE
zurück) und `db/session.js` (Store-Connection). **NIEMALS** wieder `WAL` setzen
(Regressionstest `test/db-journal-mode.test.js`).

**Sessions in eigener Datei (`sessions.db`):** Der Session-Store schreibt **nicht** mehr in
`turmstatus.db` (zweiter Writer = Korruption), sondern in eine eigene Datei (`SESSION_DB_PATH`).
Pfad als `{ dir, db: basename }` an connect-sqlite3 (NIE `mode: 0o666` – Bit `0x80` =
`OPEN_MEMORY` → Sessions lägen unbemerkt in-memory). `destroyUserSessions()` löscht über die
Store-Connection. Store-Methoden + `touch` mit Retry/No-Write gewrappt (`SESSION_TOUCH_WRITES=1`
reaktiviert das per-Request-UPDATE).

**Init-Robustheit (`db/init.js`):** `acquireInitLock()` (atomares mkdir-Lock) serialisiert
parallele Starter; `checkIntegrity()` (`PRAGMA integrity_check`) beim Start; betrifft die
Beschädigung NUR die wegwerfbare `sessions`-Tabelle, heilt `healSessionCorruption()` automatisch
(DROP+VACUUM+Re-Check, Opt-out `DB_NO_SESSION_AUTOHEAL=1`). Sonst Recovery-Hinweis + Abbruch
(`DB_ALLOW_CORRUPT_START=1` nur für Notrettung). Reihenfolge in `server.js`: `initDatabase()` →
`await dbRun('SELECT 1')` (Pragma-Queue) → Session-Store erzeugen.

**Konto-Überschneidung / Querverweis (Zukunft, NOCH NICHT umgesetzt):** Beide Apps haben ihr
eigenes `users`/Schema. Für später geteilte Konten (Wachführer-Zugriff auf beide Apps) bzw.
Daten-Querverweis (Wachgänger aus dem Generator → Turmstatus) sind die Env-Schalter
`DATABASE_PATH` + `SESSION_DB_PATH` bereits vorhanden: zwei Deployments können so später auf
eine gemeinsame User-/Session-DB zeigen. Bewusst **nicht** vorgebaut – erst bei echtem Bedarf.

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
- **Cookie `secure` (`db/session.js`):** Ein explizit gesetztes `COOKIE_SECURE` (true/false) hat IMMER
  Vorrang; nur wenn es **nicht** gesetzt ist, gilt `NODE_ENV=production` als Default. **Falle (gefixt):**
  Früher war es ein ODER → in production wurde `secure=true` erzwungen, auch bei `COOKIE_SECURE=false`.
  Ohne TLS (HTTP-only) verwarf der Browser dann das `Secure`-Cookie still → jeder authentifizierte
  Request kam ohne Session an („Not authenticated", u. a. beim Benutzer-Anlegen im Admin-Panel).

---

## Testing
`npm test` → Node `--test` (`test/*.test.js`):
- `status.test.js` – Turmfarben-Ableitung (reine Logik).
- `ids.test.js` – ID-Parsing.
- `crypto.test.js` – AES-Round-Trip + falscher Key.
- `db-journal-mode.test.js` – Regressionsschutz: `journal_mode=delete` (kein WAL), parallele
  `initDatabase()` serialisieren (Init-Lock), gleichzeitige Writes zweier Connections ohne `SQLITE_CORRUPT`.
- `api.test.js` – **Integrationstest**: bootet den Server (eigene temp-DB), prüft Auth-Gate,
  Login, Seed-Türme und den vollständigen -1/+1-Workflow.
- **Hinweis:** `npm install` im frischen Container nötig (sonst `Cannot find module 'dotenv'`/sqlite3-Fehler).
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
