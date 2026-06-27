# HANDOFF – Entwicklungsfortschritt

Statusdokument zum Projekt **Turmstatus** (digitales Wach- und Statussystem Wasserrettung).

## Aktueller Stand
**Voller Tech-Stack-Umbau abgeschlossen.** Die App wurde von
FastAPI/PostgreSQL/React auf den Stack des **DLRG-Wachplan-Generators** umgestellt:
**Express + SQLite + Vanilla JS**, Session-Auth, WebSocket-Lagebild, Admin-Server,
GHCR-Multi-Arch-Image + Semantic Release. Infrastruktur (db/, session, crypto, ids,
auth) ist absichtlich deckungsgleich zum Schwester-Projekt → spätere Zusammenführung möglich.

## Zuletzt (Mandanten-Modell: vollständige Scope-Isolation pro Wachführer + Karte auf Dahme)
**Vom Nutzer bestätigte Zielarchitektur** (deckungsgleich zum Wachplan-Generator, wo jeder
Wachführer-Account nur seine eigenen Daten verwaltet): **Jeder Wachführer ist ein eigener
Mandant.** Er **sieht, verwaltet und genehmigt ausschließlich sein Eigenes** – andere
Wachführer-Scopes sind für ihn komplett unsichtbar. Der App-Admin legt Wachführer an und
**sieht alles read-only** (Einblick in jedes WF-Panel). *(Eine frühere Zwischenversion hatte
die Verwaltung „stationsweit" gemacht – das wurde wieder ersetzt.)*

- **Scope-Isolation (`owner_id`):** Neue Spalte **`owner_id`** auf `towers`/`guards`/`boats`
  (= Wachführer, dem das Objekt gehört) und auf **`users`** (= Wachführer, dem ein
  Personal-Konto gehört). Schema (`db/schema.sql`) + idempotente Migrationen (`db/init.js`).
  Neuer Helfer `middleware.js`: `viewScope(user)` (Admin → alle; WF → eigene `id`;
  Wachgänger/Bootsführer → `owner_id` ihres WF), `requireWachfuehrer` (striktes WF-Gate **ohne**
  HAUPTWACHE-Bypass → Admin echt view-only), `isAdmin`.
- **Alle Router gescoped:** `towers`/`guards`/`boats`/`requests`/`control-trips`/`team`/`dashboard`
  filtern GET nach Scope; Schreib-/Genehmigungsrechte sind an den **Owner** gebunden
  (Turm/Boot/Wachgänger gehört dem WF). `requests`/`control-trips` genehmigt nur der **Owner-WF**
  (Turm-Match durch Owner-Match ersetzt). `team` scoped Personal über `users.owner_id` statt
  `tower_id`. Antworten liefern `ownerId` mit.
- **Türme/Boote-Verwaltung (DIVERA-artig, WF-only):** „📍 Turm auf Karte setzen" (Klick → Modal
  mit Position), **verschiebbare** Turm-Marker (Drag → PATCH), Turm-/Boot-Modals + Tabellen-
  Aktionen, **Boot↔Turm-Zuordnung**. Karten-Marker/Tabellen-Editoren nur für den WF; Admin nur Ansicht.
- **Geo:** Kartenzentrum auf **DLRG Hauptwache Dahme** (`54.21449, 11.08967`, Zoom 15) in
  `server/config.json` + Fallback in `public/js/map.js`. **Kein Demo-Seed mehr** für Türme/Boote
  (ownerlose Seeds wären für keinen WF sichtbar) – jeder WF legt seine Objekte selbst an.
- **Admin-Profil:** „Profil ansehen" zeigt den **gesamten Scope** eines WF (alle seine
  Türme/Boote/Wachgänger), clientseitig per `ownerId === WF.id` gefiltert.
- **Rollen-Anlage:** Admin legt **Wachführer** an; Wachführer legt nur **Wachgänger + Bootsführer**
  an (kein „Turmführer").
- **Tests:** `api.test.js` komplett auf Isolation umgeschrieben (WF1 baut Scope; WF2 sieht/ändert
  nichts davon → 403/400/leer; -1- & Kontrollfahrt nur durch Owner-WF; Admin sieht alle).
  `npm test` → **27/27 grün**.
- **Offen/Folge:** Admin-API (`/api/admin/*`) legt Personal weiterhin ohne `owner_id` an (Admin
  legt v. a. Wachführer an – Personal kommt über den WF). `users.tower_id` ist jetzt nur noch
  informative Stationierung (Scope läuft über `owner_id`).

## Zuletzt (Cloudflare-/Proxy-IP-Helper vom Wachplan-Generator übernommen)
- Neuer gemeinsamer `server/http-common.js` mit `trustProxyValue()`, `overrideClientIp()`,
  `clientIpFromHeaders()`, Security-Headern und gemeinsamen 404/Error/SIGTERM-Handlern.
- `server.js` und `admin-server.js` nutzen jetzt `TRUST_PROXY` (Default `1`) statt festem
  `trust proxy = 1` und übernehmen `CF-Connecting-IP` → `X-Real-IP` → `X-Forwarded-For` in
  `req.ip`; dadurch sehen Audit-Log und Login-Rate-Limit hinter Cloudflare/NGINX die echte IP.
- `server/db/audit.js` nutzt denselben Header-Pfad; `docs/nginx.cloudflare.conf.example`
  dokumentiert die fälschungssichere NGINX-Variante mit Cloudflare-IP-Ranges.
- Regressionsschutz: `test/http-common.test.js` prüft 404-Header-Sent, Header-Priorität und
  IPv6-Kanonisierung.

## Zuletzt (Genehmiger-Modell: Wachführer entscheidet, Admin view-only)
- **App-Admin ist jetzt rein ansehend** + Account-Verwaltung; **keine** operativen Bestätigungen mehr.
- **-1- und Kontrollfahrt-Genehmigung** nur durch den **Wachführer der eigenen Wache** (Turm-Match) –
  serverseitig über explizite Gates in `requests.js`/`control-trips.js` (kein `requireRole`-HAUPTWACHE-
  Bypass). Frontend blendet operative Aktionen für den Admin aus.
- Neuer read-only **„Profil ansehen"**-Dialog für den Admin (Lage einer Wache, ohne Aktionen).
- `api.test.js` deckt ab: Admin-Genehmigung → 403, Wachführer der Wache → 200 (−1 + Kontrollfahrt).
- Manuell per curl verifiziert. **Offen:** Boot-PATCH erlaubt am API noch den HAUPTWACHE-Bypass
  (UI blendet es aus); „Hauptwache" als externe Instanz weiterhin nicht getrennt modelliert.

## Davor (Rollen-Hierarchie, Wachführer-Personalverwaltung, Bootsführer/Kontrollfahrten, Cookie-Fix)
- **Bugfix „Not authenticated"** beim Benutzer-Anlegen im Admin-Panel: Session-Cookie-`secure`
  war in production immer `true` (ODER-Logik) und ignorierte `COOKIE_SECURE=false` → über HTTP
  verwarf der Browser das Cookie. Jetzt hat explizites `COOKIE_SECURE` Vorrang (`db/session.js`).
- **Rollen:** `TURMFUEHRER` → **`WACHFUEHRER`** umbenannt (Code + idempotente DB-Migration); neue
  Rolle **`BOOTSFUEHRER`**.
- **Konten-Hierarchie:** App-Admin (`is_admin`) legt über `/api/admin/*` Wachführer an (+ Wache);
  Wachführer legen über neuen `/api/team/*` ihr eigenes Personal an – strikt auf die eigene
  `tower_id` gescoped. „Verwaltung"-Tab jetzt auch für Wachführer (Team-Scope via `userApiBase()`).
- **Kontrollfahrten:** neuer Workflow-Rahmen `api/control-trips.js` + Tabelle `control_trip_requests`
  (Bootsführer beantragt → HW/Wachführer genehmigt/lehnt ab; **noch ohne** Boot-Statuslogik).
- **Verifikation:** Unit-Tests grün; voller Rollen-/Kontrollfahrt-Flow manuell per curl geprüft
  (Admin→Wachführer→Team-Anlage, Scoping-403s, Bootsführer-Antrag→Genehmigung). Hinweis: der
  Integrationstest `api.test.js` lässt sich in dieser Sandbox nicht booten (Port-Bindung wird
  abgeschossen) – Logik unverändert HAUPTWACHE-kompatibel.
- **Offen:** „Hauptwache" als von der App-Admin-Rolle getrennte externe Instanz; Kontrollfahrt-Folgelogik.

## Davor (DB-/Port-Härtung vom Wachplan-Generator übernommen)
Die bewährte SQLite-/Port-Logik des Schwester-Projekts ist jetzt auch hier umgesetzt:
- **EIN Prozess, beide Ports:** Admin-Panel (3003) wird per `ADMIN_PORT` in den Hauptprozess
  (3002) eingebettet (`createAdminApp({sessionMiddleware})`); beide `docker-compose*.yml` nur
  noch **ein** Container. (Vorher: zwei Container auf einem Volume → `SQLITE_CORRUPT`.)
- **`journal_mode=DELETE`** (kein WAL) + `busy_timeout` + `OPEN_FULLMUTEX` an allen Writer-
  Connections; **Sessions in eigener `sessions.db`** (`OPEN_MEMORY`-Bug behoben); Init-Lock +
  `integrity_check` + Session-Auto-Heilung in `db/init.js`; transienter DB-Retry.
- Neuer Regressionstest `test/db-journal-mode.test.js`. `npm test` → **16/16 grün**.
- **Querverweis/geteilte Konten** beider Apps bewusst **noch nicht** gebaut; `DATABASE_PATH`/
  `SESSION_DB_PATH` sind die vorgesehenen Schalter für eine spätere gemeinsame User-/Session-DB.

## Meilensteine
### ✅ M1 – Infrastruktur (deckungsgleich Wachplan-Generator)
- `db/connection.js`, `db/session.js`, `db/ids.js`, `db/crypto.js` 1:1 übernommen (nur DB-Name `turmstatus.db`).
- `db/init.js`: Schema-Init, idempotente Migrationen, `validateEnv()`, Demo-Seed (Türme/Boote), Admin-Seed.
- `db/audit.js` (`recordAudit`), `middleware.js` (`requireAuth`/`requireRole`).

### ✅ M2 – Domänen-Backend (Express)
- Router: `auth`, `towers`, `guards`, `boats`, `requests`, `dashboard`, `admin`.
- `-1`/`+1`-Workflow vollständig (beantragen → genehmigen/ablehnen → Rückkehr) mit Statuslogik.
- Abgeleitete Turmfarbe (`status.js`), Audit-Log auf allen Mutationen, Realtime-Broadcast.
- `server.js` (Port 3002) + `admin-server.js` (Port 3003), `/api/version`, `/api/config`, `/health`.

### ✅ M3 – Frontend (Vanilla JS + Leaflet)
- SPA `public/Turmstatus.html` + `public/js/*` (state/utils/api/auth/map/views/ws/init).
- Tabs: Karte (OSM/Leaflet, farbcodierte Türme + Marker), Dashboard, Anfragen, Verwaltung (Admin).
- Login/Setup/Register, Passwortwechsel, rollenbasierte UI, WS-Live + 30-s-Polling-Fallback.
- `public/admin.html` (self-contained) für den Admin-Server.

### ✅ M4 – Tests & CI
- `npm test` (Node `--test`): status, ids, crypto, Integrationstest (Server-Boot + -1/+1).
- Workflows: `test.yml`, `docker.yml` (Multi-Arch GHCR), `release.yml` (Semantic Release).

### ✅ M5 – Deployment & Doku
- `Dockerfile`, `docker-compose.yml` (GHCR), `docker-compose.build.yml` (lokal), `.env.example`.
- `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `docs/PORTAINER.md`, `docs/FEATURES.md`.

## Standard-Zugänge
- Hauptwache (Admin): `ADMIN_USERNAME` / `ADMIN_PASSWORD` (Seed beim Erststart).
- Demo-Lagebild: 4 Türme + 2 Boote werden beim ersten Start angelegt (wenn `towers` leer).

## Bewusst offen / nächste Schritte
- **Zusammenführung mit dem Wachplan-Generator**: Da Infrastruktur deckungsgleich ist, könnten
  beide Domänen (Wachplan-Erstellung + Live-Lagebild) künftig in einer App / einem Image vereint
  werden (gemeinsame `users`/Session, getrennte Domänen-Tabellen). Noch nicht umgesetzt.
- **Live-GPS** der Wachgänger aus dem Browser (Endpoint `PATCH /guards/:id/position` vorhanden).
- **Einsatzverwaltung** (Operation-Modell) – im alten Stack vorbereitet, hier noch nicht portiert.
- **Backend-Tests** weiter ausbauen (mehr Rollen-/Fehlerpfade).

## Verifikation (Kurzform)
1. `npm ci && npm test` → grün.
2. Lokal: `MASTER_SECRET=… SALT=… SESSION_SECRET=… ADMIN_PASSWORD=… npm start`,
   `GET /health` → ok, Login Hauptwache → Karte mit Seed-Türmen + Dashboard.
3. Wachgänger anlegen → `-1` beantragen → in Hauptwache genehmigen → Status/Karte ändern sich
   (live via WS) → `+1` zurück. Alle Schritte im Audit-Log.
