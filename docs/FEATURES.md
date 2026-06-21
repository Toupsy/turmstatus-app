# Feature- & Änderungs-Historie

> Historie funktionaler Änderungen. Stabiles Wissen → CLAUDE.md, aktueller Stand → HANDOFF.md.

## DB-Härtung & Ein-Prozess-Betrieb (Ports + DB-Zugriff vom Wachplan-Generator übernommen)
Die im Schwester-Projekt erprobte SQLite-/Port-Logik 1:1 nach Turmstatus übertragen –
Voraussetzung für den robusten NAS-Betrieb und die spätere Zusammenführung beider Apps:

- **EIN Prozess für beide Ports:** `server.js` bettet das Admin-Panel (3003) über `ADMIN_PORT`
  via `createAdminApp({sessionMiddleware})` in den Hauptprozess (3002) ein. `docker-compose.yml`
  + `docker-compose.build.yml` starten nur noch **einen** Container (vorher zwei Container auf
  demselben Volume → `SQLITE_CORRUPT`). `RUN_EMBEDDED_ADMIN=0` = klassischer Zwei-Prozess-Betrieb.
- **`journal_mode=DELETE` statt WAL** an allen Writer-Connections (`connection.js`/`init.js`/
  `session.js`) + `busy_timeout`; `OPEN_FULLMUTEX`. WAL ist prozessübergreifend nicht kohärent.
- **Sessions in eigener `sessions.db`** (`SESSION_DB_PATH`) statt in `turmstatus.db`; behebt den
  `mode: 0o666`→`OPEN_MEMORY`-Bug (Sessions lagen in-memory). Store-Methoden + `touch` mit
  Retry/No-Write gewrappt; `destroyUserSessions()` über die Store-Connection.
- **Start-Robustheit:** Init-Lock (atomares mkdir), `PRAGMA integrity_check`, Auto-Heilung
  einer reinen `sessions`-Korruption (DROP+VACUUM), transienter DB-Retry in `dbRun/dbGet/dbAll`.
- **Regressionstest** `test/db-journal-mode.test.js` (DELETE-Modus + paralleler Init + gleichzeitige Writes).
- **Vorbereitet (NICHT umgesetzt):** geteilte Konten / Daten-Querverweis zwischen beiden Apps –
  `DATABASE_PATH`/`SESSION_DB_PATH` erlauben später eine gemeinsame User-/Session-DB.

## v0.1.0 – Tech-Stack-Umbau auf den Wachplan-Generator-Stack
Vollständiger Neubau der Turmstatus-App von FastAPI/PostgreSQL/React auf
**Express + SQLite + Vanilla JS**, deckungsgleich zum DLRG-Wachplan-Generator
(Vorbereitung der späteren Zusammenführung).

- **Infrastruktur** 1:1 vom Schwester-Projekt übernommen: zentrale SQLite-Verbindung,
  Session-Store, ID-Parsing, AES-Crypto-Schicht (`db/connection|session|ids|crypto`).
- **Auth**: Session-Cookies + bcryptjs, Login/Setup/Register, eigener Passwortwechsel,
  Brute-Force-Schutz (IP + Account). `/api/auth/me` liefert Rolle/Name/Turm.
- **Domäne**: Türme (mit abgeleiteter Statusfarbe), Wachgänger (Status/Position), Boote
  (Status/Position), `-1/+1`-Workflow (beantragen → genehmigen/ablehnen → Rückkehr),
  Dashboard-Kennzahlen.
- **Rollen** serverseitig erzwungen (HAUPTWACHE/TURMFUEHRER/WACHGAENGER).
- **Realtime**: WebSocket-Broadcast aller Lageänderungen an alle Clients + 30-s-Polling-Fallback.
- **Frontend**: Vanilla-JS-SPA mit Leaflet-Einsatzkarte, Dashboard, Anfragen-Tab,
  Verwaltungs-Tab (Admin). Separates self-contained Admin-Panel (Port 3003).
- **Audit-Log** auf allen Mutationen; Admin-Ansicht.
- **Demo-Seed**: 4 Türme + 2 Boote an Ostsee-Koordinaten beim Erststart (wenn leer).
- **Deployment**: Single Multi-Arch-Image (GHCR), `docker-compose.yml` + `.build.yml`,
  Semantic Release, CI (`npm test`).
- **Tests**: `status`, `ids`, `crypto`, Integrationstest (Server-Boot + -1/+1-Workflow).
