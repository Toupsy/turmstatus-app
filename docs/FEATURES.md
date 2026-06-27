# Feature- & Änderungs-Historie

> Historie funktionaler Änderungen. Stabiles Wissen → CLAUDE.md, aktueller Stand → HANDOFF.md.

## Admin positioniert Türme + Boote in der Standard-Config (Vorlagen-Boote + Demo-Karte)

Bisher konnte der App-Admin nur **Vorlagen-Türme** (`tower_templates`) als Standard-Config pflegen,
und Positionen nur über Zahlenfelder. Neu kann er auch **Boote** vorkonfigurieren und beide
**direkt auf einer Karte positionieren** – diese Positionen erbt jeder **neue** Wachführer.
- **Vorlagen-Boote (`boat_templates`):** neue Admin-gepflegte Tabelle (name, call_sign, status,
  latitude, longitude). API `GET/POST/PATCH/DELETE /api/admin/boat-templates` (admin-gated;
  Wachführer → 403; Status- und Koordinaten-Validierung wie bei den Turm-Vorlagen).
- **Vererbung beim Anlegen:** `POST /api/admin/users` mit role=WACHFUEHRER klont die Vorlagen-Boote
  via `applyBoatTemplates()` in den Scope des neuen Wachführers (`boats.owner_id`) – **ohne**
  Turm-Zuordnung (`tower_id = NULL`), die der Wachführer später selbst vornimmt. Läuft neben der
  bestehenden Turm-Vererbung; bestehende Wachführer bleiben unverändert.
- **Demo-Konfigurations-Karte:** im Verwaltung-Tab eine eigene Leaflet-Karte (`#template-map`).
  Vorlagen-Türme (📍) und -Boote (⛵) sind **verschiebbare Marker** – ein **Drag** speichert die
  neue Position per PATCH (`moveTowerTemplate`/`moveBoatTemplate`). Ein **Rechtsklick** auf die
  Karte legt einen Vorlagen-Turm/-Boot an der angeklickten Stelle an (Modal mit vorbefüllter
  lat/lng). Das Kontextmenü ist nun generisch (`openMapContextMenu()`) und wird von Einsatz- und
  Demo-Karte geteilt (`map.js`: `initTemplateMap`/`renderTemplateMap`).
- **UI:** Panels „Demo-Konfiguration · Karte/Boote" + Vorlagen-Boot-Modal; Tabellen mit
  Bearbeiten/Löschen wie bei den Turm-Vorlagen (`views.js`, `Turmstatus.html`, `init.js`,
  `state.js:boatTemplates`).

## Rechtsklick auf der Karte: Turm/Boot direkt platzieren + Boot-Position

Bisher war die Turm-Platzierung wenig intuitiv (Button „📍 Turm auf Karte setzen" → Linksklick).
Neu gibt es für den **Wachführer** ein **Rechtsklick-Kontextmenü** direkt auf der Karte:
- **Rechtsklick (contextmenu)** auf eine beliebige Stelle öffnet ein kleines Menü mit den
  angeklickten Koordinaten und zwei Aktionen: **„📍 Turm hier anlegen"** und **„⛵ Boot hier
  anlegen"** – das jeweilige Modal öffnet sich mit **vorbefüllter lat/lng**. Nur für den
  Wachführer; Linksklick/Scroll/Zoom schließt das Menü, es wird an den Viewport geklemmt
  (`map.js`: `showMapContextMenu`/`hideMapContextMenu`).
- **Boote bekommen jetzt eine Kartenposition:** Das Boot-Modal hat neue lat/lng-Felder
  (`boat-modal-lat`/`-lng` + Positions-Hinweis); `openBoatModal(boat, lat, lng)` und `saveBoat`
  reichen die Koordinaten durch. Die Boote-API (`POST`/`PATCH /api/boats`) akzeptierte
  `latitude`/`longitude` bereits – jetzt sind sie auch aus dem UI setzbar. Boot-Marker (⛵)
  erscheinen damit an der gewählten Stelle.
- Der bestehende Button-Workflow („Turm auf Karte setzen", Drag-to-move der Turm-Marker) bleibt
  unverändert erhalten; der Tipp-Text nennt jetzt zusätzlich den Rechtsklick.

## Demo-Konfiguration: Vorlagen-Türme für neue Wachführer

Damit ein neu angelegter Wachführer nicht bei null startet, kann der App-Admin eine
**Demo-Konfiguration** von Türmen pflegen, die jeder **neue** Wachführer automatisch erbt.
- **Tabelle `tower_templates`** (Admin-gepflegt). API `GET/POST/PATCH/DELETE
  /api/admin/tower-templates` (admin-gated; Wachführer → 403).
- **Vererbung beim Anlegen:** `POST /api/admin/users` mit role=WACHFUEHRER klont alle Vorlagen-
  Türme via `applyTowerTemplates()` in den Scope des neuen Wachführers (`towers.owner_id`).
  Bestehende Wachführer bleiben unverändert.
- **UI:** Panel „Demo-Konfiguration · Türme" im Verwaltung-Tab (nur Admin), Vorlagen-Modal
  (Name/Funk/Sollstärke/Koordinaten), Anlegen/Bearbeiten/Löschen.
- **Tests:** Vorlagen-CRUD admin-only + neuer Wachführer erbt Vorlage (28/28 grün).

## Mandanten-Modell: Scope-Isolation pro Wachführer + Karte auf DLRG Hauptwache Dahme

Geklärte Zielarchitektur (deckungsgleich zum Wachplan-Generator): **Jeder Wachführer ist ein
eigener Mandant.** Er sieht, verwaltet und genehmigt ausschließlich sein Eigenes; andere
Wachführer-Scopes sind komplett unsichtbar. Der App-Admin legt Wachführer an und sieht alles
read-only.

- **Scope-Isolation über `owner_id`:** Neue Spalte `owner_id` auf `towers`/`guards`/`boats` (=
  Eigentümer-Wachführer) und auf `users` (= Wachführer, dem ein Personal-Konto gehört). Schema +
  idempotente Migrationen. Helfer in `middleware.js`: `viewScope(user)` (Admin → alle; WF → eigene
  id; Wachgänger/Bootsführer → owner_id ihres WF), `requireWachfuehrer` (WF-Gate ohne Admin-Bypass),
  `isAdmin`.
- **Alle Router gescoped:** `towers`/`guards`/`boats`/`requests`/`control-trips`/`team`/`dashboard`
  filtern Lesezugriffe nach Scope; Schreiben/Genehmigen ist an den Owner gebunden. -1- und
  Kontrollfahrt-Genehmigung erfolgt durch den **Owner-Wachführer** (Owner-Match statt Turm-Match).
  `team` scoped Personal über `users.owner_id`.
- **Türme & Boote verwaltet der Wachführer (DIVERA-artig):** „📍 Turm auf Karte setzen" platziert
  per Karten-Klick einen Turm (Modal mit vorbefüllter Position); bestehende Turm-Marker sind **per
  Drag verschiebbar** (`dragend` → PATCH lat/lng). Turm-/Boot-Modals (Anlegen/Bearbeiten), Lösch-
  Buttons, Inline-Auswahl für **Boot↔Turm-Zuordnung** und Boot-Status. Nur für den Wachführer
  sichtbar; der App-Admin sieht read-only (Profil-Dialog zeigt den gesamten Scope eines WF).
  Koordinaten-Validierung (`parseCoord`: lat/lng-Range, sonst 400).
- **Standort Dahme:** Kartenzentrum auf die **DLRG Hauptwache Dahme** (Strandpromenade,
  `54.21449, 11.08967`, Zoom 15) in `server/config.json` + Fallback in `public/js/map.js`. **Kein
  Demo-Seed** mehr für Türme/Boote (ownerlose Seeds wären für keinen Wachführer sichtbar) – jeder
  Wachführer legt seine Objekte selbst an.
- **Rollen-Anlage:** Admin legt **Wachführer** an; Wachführer legt nur **Wachgänger + Bootsführer**
  an (kein „Turmführer").
- **Tests:** `api.test.js` auf Isolation umgeschrieben (WF1 baut Scope; WF2 sieht/ändert davon
  nichts → 403/400/leer; -1- & Kontrollfahrt nur durch Owner-WF; Admin sieht alle). `npm test` →
  27/27 grün.

## Cloudflare-/Proxy-IP-Helper vom Wachplan-Generator übernommen

Infrastruktur-Härtung für den Betrieb hinter Cloudflare/NGINX:
- Neuer gemeinsamer `server/http-common.js` bündelt Security-Header, `TRUST_PROXY`-Parsing,
  Proxy-IP-Ermittlung, 404/Error-Handler und SIGTERM/Fatal-Handler.
- `TRUST_PROXY` ist jetzt konfigurierbar (Default `1`) und wird in Haupt- und Admin-App genutzt.
- `overrideClientIp()` setzt `req.ip` aus `CF-Connecting-IP` → `X-Real-IP` → linkestes
  `X-Forwarded-For`. Damit greifen Audit-Log und Login-Rate-Limit auf die echte Besucher-IP zu,
  auch wenn NGINX noch nicht umgebaut ist.
- `docs/nginx.cloudflare.conf.example` zeigt die fälschungssichere Variante: Nur Cloudflare-IP-Ranges
  dürfen `CF-Connecting-IP` liefern; NGINX reicht genau diese eine IP weiter.
- Neuer Regressionstest `test/http-common.test.js` für 404-Handling, Header-Priorität und IPv6.

## Genehmiger-Modell: Wachführer entscheidet, App-Admin ist view-only

Verfeinerung des Rechtemodells gemäß Zielarchitektur:
- **App-Admin** (`is_admin`/HAUPTWACHE) hat **keine operativen Bestätigungsrechte** mehr. Die
  -1- und Kontrollfahrt-Genehmigung erfolgt nun ausschließlich durch den **Wachführer der eigenen
  Wache** (Turm-Match). Admin behält: Account-Verwaltung (Wachführer anlegen) + reine Ansicht.
- **Server:** `requests.js` und `control-trips.js` nutzen für approve/reject NICHT mehr
  `requireRole('HAUPTWACHE')` (das ließ den Admin durch), sondern explizite Gates
  (`loadDecidableRequest`/`loadDecidable`): `role==='WACHFUEHRER' && tower_id===<Wache der Anfrage>`.
- **Frontend:** Genehmigen/Ablehnen-Buttons (−1 + Kontrollfahrt) nur für den Wachführer der
  betroffenen Wache; dem Admin werden alle operativen Aktionen (−1/+1 beantragen, Boot-Status,
  Genehmigen) ausgeblendet. Neuer read-only **„Profil ansehen"**-Dialog: der Admin sieht die Lage
  einer Wache (Turm/Wachgänger/Boote) ohne jede Bestätigungsmöglichkeit.
- **Tests:** `api.test.js` prüft jetzt explizit, dass der Admin −1 und Kontrollfahrt **nicht**
  genehmigen darf (403) und der Wachführer der Wache erfolgreich (200).

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
