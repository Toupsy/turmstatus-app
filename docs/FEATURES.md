# Feature- & Änderungs-Historie

> Historie funktionaler Änderungen. Stabiles Wissen → CLAUDE.md, aktueller Stand → HANDOFF.md.

## Rollen-Hierarchie, Wachführer-Personalverwaltung, Bootsführer + Kontrollfahrten; Cookie-Fix

**Bugfix „Not authenticated" beim Benutzer-Anlegen im Admin-Panel:** In `db/session.js`
wurde das Session-Cookie-`secure`-Flag per ODER gesetzt (`COOKIE_SECURE==='true' || NODE_ENV==='production'`).
In production (Default in `.env`) war `secure` damit **immer** true – auch bei `COOKIE_SECURE=false`.
Ohne TLS (HTTP-only) verwarf der Browser das `Secure`-Cookie still → jeder authentifizierte Request
kam ohne Session an („Not authenticated"). Jetzt hat ein **explizit gesetztes `COOKIE_SECURE` Vorrang**;
nur ohne Angabe greift der `NODE_ENV=production`-Default.

**Rollenmodell & Konten-Hierarchie (erste, grobe Version):**
- Rolle `TURMFUEHRER` → **`WACHFUEHRER`** umbenannt (Code + idempotente DB-Migration in `db/init.js`).
- Neue Rolle **`BOOTSFUEHRER`** (wie Wachgänger, darf zusätzlich Kontrollfahrten beantragen).
- **App-Admin** (`is_admin`) legt über das Admin-Panel / `/api/admin/*` v. a. **Wachführer** an und
  weist die Wache (Turm) zu; Admin-Panel hat dafür jetzt ein Turm-Feld (`GET /api/admin/towers`).
- **Wachführer** verwalten über den neuen Router `api/team.js` (`/api/team/members`) ihr **eigenes**
  Wachpersonal (Wachgänger/Bootsführer) – `tower_id` serverseitig auf die eigene Wache erzwungen,
  damit kein Wachführer in eine fremde Wache eingreift. Frontend: „Verwaltung"-Tab ist jetzt auch für
  Wachführer sichtbar und schaltet (über `userApiBase()`) zwischen Admin- und Team-Endpunkt.

**Kontrollfahrten (`api/control-trips.js`, `control_trip_requests`):** Bootsführer beantragen eine
Kontrollfahrt für ein Boot; Hauptwache/Wachführer (eigene Wache) genehmigen oder lehnen ab.
Bewusst **noch ohne Boot-Statuslogik** – nur der Workflow-Rahmen, mit Audit + Live-Broadcast
(`control-trips-updated`). Neuer „Kontrollfahrten"-Bereich im Anfragen-Tab.

**Noch offen:** „Hauptwache" als von der App-Admin-Rolle getrennte, externe Instanz; Folgelogik der
Kontrollfahrt (Boot-Status etc.).

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
