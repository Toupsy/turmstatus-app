# Feature- & Änderungs-Historie

> Historie funktionaler Änderungen. Stabiles Wissen → CLAUDE.md, aktueller Stand → HANDOFF.md.

## Kontrollfahrten (K-Fahrt): Bootsführer → Wachführer

Der Kontrollfahrten-Workflow ist zurück, jetzt in den bestehenden Anfragen-Bereich integriert
(gemeinsame Tabelle `minus_one_requests` mit neuer Spalte `kind` = `MINUS_ONE | K_FAHRT`).

- **Bootsführer** (und Wachführer) können neben `-1` eine **K-Fahrt** für ihren Wachgänger
  beantragen (`POST /api/requests/k-fahrt`, Button „K-Fahrt" in der Wachgänger-Liste). Kein Grund
  nötig, optionale Notiz. Doppelte offene/aktive K-Fahrten pro Wachgänger werden geblockt (409).
- **Der Wachführer setzt die K-Fahrt aktiv** (`POST /api/requests/:id/set-k-fahrt`, Button
  „K-Fahrt setzen"). Bewusst **nicht** über die normale Genehmigung – `POST …/approve` lehnt
  K-Fahrten mit 409 ab.
- **Beim Setzen wird der Turm automatisch um 2 WG reduziert** (`K_FAHRT_STAFF_REDUCTION`, in
  `shared/config.ts`). Die Reduktion ist rein abgeleitet (`buildTowerViews`): jede aktive K-Fahrt
  zieht 2 von der Ist-Besetzung des Turms des Wachgängers ab (min. 0) und beeinflusst so die
  Turmfarbe. `GET /api/towers` liefert dazu `activeKFahrten` + `kFahrtReduction`.
- **Beenden** über den bestehenden `+1`-/Rückkehr-Endpunkt (`POST /api/requests/:id/return`,
  Button „K-Fahrt beenden") → Status `RETURNED`, Reduktion entfällt. Anders als bei `-1` wird dabei
  kein Wachgänger-Status verändert.
- Owner-/Scope-Prüfungen wie bei `-1`; Broadcasts `requests-updated` + `towers-updated`, Audit-Log.
- Tests: `apps/api/test/domain.test.ts` deckt Beantragen, „setzen ≠ genehmigen", 2-WG-Reduktion,
  Doppel-Block und Beenden ab.

## Neubau: Full-TypeScript (Fastify + Drizzle + Svelte)

Die App wurde vom alten Stack (Express + SQLite + Vanilla JS) **komplett neu gebaut**, um sie
schneller und wartbarer zu machen. Ziel und Kern-Workflows bleiben identisch.

- **Monorepo (npm workspaces):** `packages/shared` (geteilte Status-/Validierungslogik + Typen),
  `apps/api` (Fastify + better-sqlite3/Drizzle), `apps/web` (öffentliche Svelte-SPA),
  `apps/admin` (interne Admin-SPA).
- **Schneller:** Svelte-Stores mit feingranularem Re-Rendering statt komplettem `innerHTML`-Neuaufbau;
  synchrones better-sqlite3 mit WAL; geteilte Status-Logik (kein Duplikat zwischen Server und Client).
- **Harte Admin-Grenze:** Admin-API + Admin-SPA laufen ausschließlich auf einem separaten, nur
  host-lokal gebundenen Port. Auf dem öffentlichen Port existiert `/api/admin/*` nicht (404), sodass
  die App via Cloudflare öffentlich sein kann, ohne den Admin-Bereich preiszugeben.
- **Erhalten:** Mandanten-Isolation (owner_id), Demo-Vorlagen, boots-abhängige Sollstärke, manuelle
  Ist-Besetzung, `-1/+1`-Workflow, Audit-Log, Live-Updates (WebSocket + Polling), Docker/GHCR/Semantic-Release.
- **Entfallen:** Kontrollfahrten-Workflow, Cloudflare-Preview-Mock, ungenutzte Crypto-Schicht und die
  SQLite-Multiprozess-Härtung (Einzelprozess + WAL machen sie überflüssig).
- **Tests:** Vitest – 32 Fälle (Status-/ID-Logik, Auth/Setup, Scope-Isolation, `-1/+1`, Boots-Soll,
  Admin-Grenze). Browser-Smoke beider SPAs mit Chromium.

---

_Die folgenden Einträge beziehen sich auf den alten (abgelösten) Stack und bleiben als Historie erhalten._

## Fix: Boot-/Anfrage-Änderungen wirken sofort auf die Türme (Live-Reaktivität)

Eine Boot-Status-Änderung (z. B. im Dashboard) brauchte bis zu **30 Sekunden**, bis Turm-Tabelle
und Kartenfarben sie widerspiegelten – sie aktualisierten sich nur über den Polling-Fallback.

- **Ursache:** Turmfarbe & effektive Sollstärke werden **serverseitig** in `GET /api/towers` aus
  Wachgänger- **und** Boots-Status berechnet. Im WebSocket-Client (`public/js/ws.js`) lud das Event
  `boats-updated` aber nur `refreshBoats()`/`refreshDashboard()` – **nicht** `refreshTowers()`.
  Die Türme blieben daher bis zum nächsten 30-s-Poll (`refreshAll`) stehen.
- **Fix (`public/js/ws.js`):** `boats-updated` ruft jetzt zusätzlich `refreshTowers()`. Analog ruft
  `requests-updated` jetzt ebenfalls `refreshTowers()`, da ein genehmigtes/zurückgemeldetes **-1**
  den Wachgänger-Status und damit die Ist-Besetzung der Türme ändert.
- **Wirkung:** Türme reagieren jetzt praktisch sofort (WS-Latenz statt bis zu 30 s) auf Boots- und
  -1/+1-Änderungen. Keine Backend-/Datenmodell-Änderung.

## Boots-abhängige Sollstärke + farbige Boots-Anmerkung im Dashboard

Die Sollstärke eines Turms hängt jetzt vom **Boots-Status** ab, und das Dashboard zeigt die
Boots-Lage als farbige Anmerkung an.

- **Logik (`server/status.js`, rein/testbar):** Jeder Turm hat eine **Basis-Sollstärke**
  (Standard **2**). Pro zugeordnetem Boot kommt ein Beitrag hinzu (`boatStaffDelta`):
  - **Boot am Turm** (`AT_TOWER`) → **+1** Bootsführer ⇒ Sollstärke **3** (2 WF + 1 BF).
  - **Boot außer Dienst** (`OUT_OF_SERVICE`) → **±0** ⇒ wie normaler Turm (**2**).
  - **Boot auf Streife / im Einsatz** (`PATROL`/`DEPLOYED`) → **−1** ⇒ Sollstärke **1** + Warnung
    „Boot nicht am Turm".
  - `effectiveRequiredStaff(base, boatStatuses[])` summiert die Beiträge (min. 1);
    `summarizeBoats()` liefert Lage + Warn-Flag.
- **API (`server/api/towers.js`):** `GET /api/towers` liefert je Turm neu
  `effectiveRequiredStaff`, `hasBoat`, `boatsAtTower`, `boatsAway`, `boatsBroken`, `boatWarning`;
  `status` (Farbe) wird gegen die **effektive** Sollstärke berechnet. `requiredStaff` bleibt die
  editierbare Basis-Sollstärke.
- **Dashboard (`public/js/views.js`):** neue Spalte **„Boot"** mit farbcodierten Pillen
  (grün = am Turm, rot = außer Dienst, gelb = unterwegs inkl. Warnung); Besetzung wird gegen die
  effektive Sollstärke angezeigt. Karten-Popup (`map.js`) zeigt ebenfalls effektive Sollstärke +
  „⚠ Boot nicht am Turm".
- **Preview-Mock (`public/js/preview.js`)** spiegelt die Logik; Demo-Datensatz zeigt alle Fälle
  (Boot am Turm, auf Streife, außer Dienst).
- **Tests:** `test/status.test.js` deckt `boatStaffDelta`/`effectiveRequiredStaff`/`summarizeBoats` ab.
## Türme mit dauerhaftem, lesbarem Namens-Label auf der Karte

Bisher zeigte ein Turm auf der Karte nur ein 🛟-Symbol; der **Name** stand ausschließlich im Popup
und war erst nach einem Klick sichtbar – Türme waren dadurch auf einen Blick kaum auseinanderzuhalten.

- **Dauerhaftes Label** (`public/js/map.js`, `_bindTowerLabel()`): Jeder Turm-Marker (sowohl die
  verschiebbaren Wachführer-Marker als auch die reinen Anzeige-Marker) bindet jetzt einen
  **permanenten Leaflet-Tooltip** mit Turmname + ggf. Funkrufname unterhalb des Pins.
- **Gut lesbar/hoher Kontrast** (CSS in `public/Turmstatus.html`, `.leaflet-tooltip.tower-label`):
  dunkle Plakette, heller fetter Text mit Textschatten; der Turmstatus erscheint als farbiger
  Akzentstreifen am linken Rand (GREEN/YELLOW/RED/UNKNOWN).
- **Nur Anzeige:** Keine Backend-/Datenmodell-Änderung; das Label nutzt vorhandene Turmdaten.
## Karten-Popup bleibt beim +1/-1 der Ist-Besetzung offen

Beim Anpassen der anwesenden Wachgänger (`+`/`−`-Stepper) **im Karten-Popup** eines Turms schloss
sich das Popup sofort wieder: Der Stepper löst über `scheduleRenderMap()` ein Neuzeichnen der Karte
aus, und `renderMap()` entfernt zu Beginn per `_markerLayer.clearLayers()` alle Marker (samt offener
Popups). Der Marker mit dem offenen Popup wurde neu erzeugt, das Popup blieb aber zu – der Nutzer
musste für jeden Klick erneut auf den Turm tippen.

- **Umsetzung** (`public/js/map.js` + `state.js`): Eine neue Zustands­variable `_openTowerPopupId`
  merkt sich über `popupopen`/`popupclose`-Listener (`_trackTowerPopup()`), welcher Turm gerade ein
  offenes Popup hat. `renderMap()` sichert diese ID **vor** `clearLayers()` (das sonst via
  `popupclose` die ID auf `null` setzt) und öffnet das Popup des entsprechenden neu erzeugten
  Markers nach dem Re-Render wieder (`marker.openPopup()`).
- **Effekt:** Mehrere `+`/`−`-Klicks hintereinander sind möglich, ohne das Popup neu öffnen zu
  müssen; der angezeigte Besetzungs-Wert/-Status zieht durch das Re-Render unmittelbar mit.
## Boot direkt aus der Einsatzkarte auf Streife setzen

Bisher konnte ein Boot nur über das Status-Dropdown in der Boot-Tabelle auf **Streife** (`PATROL`)
gesetzt werden. Im Lagebild fehlte der direkte Zugriff. Das Boot-Popup auf der Einsatzkarte
(`public/js/map.js`, `renderMap()`) zeigt dem **Wachführer** jetzt einen Knopf:

- **„🚤 Auf Streife setzen"** wenn das Boot nicht auf Streife ist → `setBoatStatus(id, 'PATROL')`.
- **„⚓ Zurück zum Turm"** wenn es bereits auf Streife ist → `setBoatStatus(id, 'AT_TOWER')`.

Der Knopf ist nur für Wachführer sichtbar (`isWachfuehrer()`); Admin/Wachgänger sehen weiterhin nur
die Anzeige. Genutzt wird das vorhandene `setBoatStatus()` (optimistisches Update → Marker springt
sofort seewärts/zurück, dann PATCH `/api/boats/:id` + Broadcast → alle Clients live). Owner-Scope
und Statuslogik bleiben unverändert (Backend prüft `requireWachfuehrer` + eigenes Boot).

## Boote auf Streife seewärts versetzt darstellen

Die Türme (und damit die am Turm liegenden Boote) stehen am Strand. Ein Boot auf **Streife**
(`status = PATROL`) liegt real aber auf dem Wasser, während seine gespeicherte Position weiterhin
die Strand-/Turmposition ist. Damit das Lagebild realistisch wirkt, wird ein Streifen-Boot auf der
Karte jetzt **rein visuell** um ~150 m in Richtung See versetzt gezeichnet – die in der DB
gespeicherten Koordinaten bleiben unverändert.

- **Konfigurierbar** in `server/config.json` → `map.seaBearing` (Richtung See in Grad, im
  Uhrzeigersinn von Nord; Default `90` = Osten, passend zur Ostsee-Küste bei Dahme) und
  `map.patrolOffsetMeters` (Versatz in Metern, Default `150`).
- **Umsetzung** (`public/js/map.js`): `_offsetLatLng()` (equirectangulare Näherung) +
  `_boatDisplayLatLng()` – greift nur bei `status === 'PATROL'`, sonst wird die echte Position
  genutzt. Das Popup weist auf den Versatz hin („Position ~150 m seewärts (Streife)").
- **Nur Anzeige:** Status-/Owner-Logik, DB-Koordinaten und Backend bleiben unberührt; sobald das
  Boot zurück „Am Turm" gemeldet wird, springt der Marker wieder an die echte Position.

## Reaktionsschnelle Eingaben (optimistische UI + gebündelte Stepper-Writes)

Die App fühlte sich bei Eingaben träge an: Jede Aktion (`+/-`-Stepper für die Ist-Besetzung,
Boot-Status- und Turm-Zuordnungs-Dropdown) wartete erst auf den PATCH-Roundtrip **und** danach auf
den vollständigen Refresh-GET, der durch das eigene WebSocket-Broadcast ausgelöst wurde – die
Anzeige zog also erst nach zwei Roundtrips nach. Schnelles Klicken auf den Stepper feuerte zudem
pro Klick einen eigenen PATCH (+ jeweils ein Refresh).

- **Optimistische Updates (`views.js`):** Stepper, Boot-Status und Turm-Zuordnung aktualisieren den
  lokalen Zustand und rendern Tabelle/Karte **sofort**, ohne auf den Server zu warten. Der
  nachfolgende WS-Refresh gleicht den Zustand verbindlich ab; bei einem Fehler wird per `refresh*`
  zurückgerollt.
- **Sofortige Turmfarbe:** `deriveTowerStatusLocal()` spiegelt `server/status.js` im Frontend, damit
  die Status-Pille beim Stepper unmittelbar mitzieht (nicht erst nach dem Server-Refresh).
- **Gebündelte Writes:** Mehrere schnelle Stepper-Klicks auf denselben Turm werden zu **einem**
  PATCH mit dem Endwert zusammengefasst (Debounce 300 ms, `_presentStaffTimers`), statt pro Klick
  einen Request abzusetzen. Das reduziert Last und Flackern.

## Manuelle Ist-Besetzung: Wachführer meldet anwesende Wachgänger ohne Accounts

Bisher leitete sich die Ist-Besetzung eines Turms (und damit die Turmfarbe) ausschließlich aus
der Zahl der **Wachgänger-Objekte mit Status `IN_AREA`** ab – jeder anwesende WG brauchte also ein
eigenes Guard-Objekt/Konto. Auf Wunsch kann der **Wachführer** die Zahl der aktuell anwesenden
Wachgänger jetzt **direkt als Zahl melden**, ganz ohne pro WG ein Konto anzulegen.

- **Neues Feld `towers.present_staff`** (manuelle Ist-Besetzung, Default 0; Schema + idempotente
  Migration in `db/init.js`).
- **Effektive Besetzung** (`status.js`-Eingabe): `currentStaff = guardStaff (IN_AREA-Objekte) +
  present_staff`. Beide Wege sind kombinierbar; wer keine WG-Accounts nutzt, meldet einfach die
  Zahl. Turmfarbe (`GREEN`/`YELLOW`/`RED`) zieht unverändert nach.
- **API:** `POST`/`PATCH /api/towers` akzeptieren `presentStaff` (auf 0…99 geklammert, negative
  Werte → 0); `GET /api/towers` liefert `presentStaff`, `guardStaff` und `currentStaff`.
- **UI (nur Wachführer):** `+/-`-Stepper in der Türme-Tabelle und im Karten-Popup zum schnellen
  Hoch-/Runtermelden; zusätzlich ein Feld „Aktuell anwesend (Wachgänger)" im Turm-Modal.
- **Test:** `api.test.js` deckt das Hoch-/Runtermelden, die Farb-Schwellen ohne jedes WG-Konto und
  die Klammerung negativer Werte ab.

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

## Cloudflare-Worker-Preview ohne Login (Demo-Modus)

Übernahme der Preview-Infrastruktur vom Schwester-Projekt **Wachplan-Generator**: Jeder Pull
Request (und Push auf `main`) wird per GitHub Action als **Cloudflare Worker** unter
`https://pr-<NR>.turmstatus-preview.workers.dev` deployt; ein Bot kommentiert die URL im PR.

- **`src/worker.js`** serviert die statischen Dateien (Cloudflare Assets), proxied `/api/*` in
  Production zum Origin-Server und liefert in der Preview dafür 503. Er injiziert
  `window.WORKER_ENVIRONMENT` und macht den SPA-Fallback auf `Turmstatus.html`.
- **`public/js/preview.js`** (neu): Da Turmstatus **backend-getrieben** ist (im Gegensatz zum
  localStorage-Offline-Modus des Wachplan-Generators), läuft die Preview gegen einen
  **In-Memory-Demo-Datensatz**. `PREVIEW_MODE` (Flag vom Worker **oder** `*.workers.dev`-Host)
  schaltet `api.js` von `fetch()` auf den Mock `previewRequest()`, gibt über `/api/auth/me`
  einen Demo-**Wachführer** zurück (→ **kein Login**) und deaktiviert den WebSocket; Mutationen
  lösen stattdessen `_handleEvent()` direkt aus (gleiche Refresh-Logik wie ein Broadcast).
- Demo-Datensatz: 4 Türme, 7 Wachgänger, 2 Boote, Anfragen, eine Kontrollfahrt, Team rund um das
  Map-Zentrum. **Voll interaktiv**, aber flüchtig (Reload = Reset, keine Persistenz).
- `wrangler.toml`, `.github/workflows/deploy-preview.yml`, `npm run deploy[:dev]` + Doku
  `docs/CLOUDFLARE_WORKER.md`. Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

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
