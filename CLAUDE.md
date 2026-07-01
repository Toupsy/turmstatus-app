# Turmstatus – Projektkontext

> **Doku-Landkarte (Token-sparend lesen!):**
> - **CLAUDE.md** (diese Datei, immer geladen): Architektur, Datenmodell, Konventionen & Fallen.
> - **HANDOFF.md**: Schnelleinstieg + aktueller Arbeits-/Review-Stand. **Zuerst lesen.**
> - **docs/FEATURES.md**: Feature-/Bugfix-Historie (nur bei Bedarf).
> - **README.md / ARCHITECTURE.md / docs/**: Nutzer-Doku, Architektur, Deployment.
>
> **Historie:** Diese App wurde von Grund auf **neu gebaut** (Full-TypeScript). Vorher:
> Express + SQLite + reines Vanilla-JS (deckungsgleich zum DLRG-Wachplan-Generator). Der
> Neubau setzt auf **Fastify + better-sqlite3/Drizzle + Svelte** und gibt die
> Deckungsgleichheit zum Schwester-Projekt bewusst auf (schneller/sinnvoller > mergebar).

## Was ist das?
Digitales **Wach- und Statussystem** für einen Wasserrettungsdienst an der Ostsee.
Ersetzt den Funkverkehr (`-1` beim Verlassen, `+1` bei Rückkehr) durch einen digitalen
Genehmigungs-Workflow und zeigt die Lage aller **Türme, Wachgänger, Boote** in **Echtzeit**
auf einer OpenStreetMap-Karte (Leaflet).

## Tech-Stack (Neubau)
- **Monorepo:** npm workspaces – `packages/shared`, `apps/api`, `apps/web`, `apps/admin`.
- **Sprache:** durchgehend **TypeScript** (ESM).
- **Backend:** **Fastify 5**, **better-sqlite3** (synchron, WAL) + **Drizzle ORM**, Session-Auth
  (`@fastify/session` + `@fastify/cookie`, SQLite-Store), **WebSocket** (`@fastify/websocket`),
  bcryptjs, **zod**-Validierung.
- **Frontend:** **Svelte 5 + Vite** (SPA), **Leaflet**. Zwei SPAs: `apps/web` (öffentlich),
  `apps/admin` (intern).
- **Tests:** **Vitest** (Unit + API-Integration mit In-Memory-SQLite).
- **Start (dev):** `npm run dev` (API mit tsx-watch) + `npm run dev:web` / `npm run dev:admin`
  (Vite-Dev-Server, proxen `/api` ans Backend). **Prod:** `npm run build && npm start`.

## EIN Prozess, ZWEI Listener (harte Admin-Grenze!)
`apps/api/src/server.ts` startet **einen** Node-Prozess mit **zwei** Fastify-Instanzen, die
sich DB, Session-Store und Realtime-Hub teilen:
- **Public** (`PORT`, Default 3002, Bind `0.0.0.0`): Operativ-API + `apps/web`-SPA.
  **KEINE** Admin-Routen → `/api/admin/*` liefert hier **404**.
- **Admin** (`ADMIN_PORT`, Default 3003, Bind `ADMIN_BIND`=`127.0.0.1`): Admin-API
  (`/api/admin/*`) + `apps/admin`-SPA + read-only Domänen-GETs.
> **Falle/Prinzip:** Admin-Routen werden **ausschließlich** auf der Admin-Instanz registriert
> (`buildAdminApp`), nie auf der Public-Instanz. Das ist eine **Netzwerk-Grenze**, kein bloßer
> Rollen-Check. In Docker wird der Admin-Port nur an `127.0.0.1` des Hosts gemappt; Cloudflare/
> Reverse-Proxy tunnelt nur den Public-Port. Wer eine neue Admin-Funktion baut, registriert sie
> unter `apps/api/src/routes/admin/` (Gate `requireAuth`+`requireAdmin`), NICHT in `routes/index.ts`.

## Codebase-Map

**`packages/shared/src/`** (Single Source of Truth, DOM-/DB-frei):
```
status.ts   deriveTowerStatus / boatStaffDelta / effectiveRequiredStaff / summarizeBoats
config.ts   Enums/Labels (Rollen/Status/Gründe) + Karten-Defaults (DLRG Dahme)
schemas.ts  zod-Schemas für ALLE Request-Bodies (+ abgeleitete Typen)
types.ts    DTOs (TowerView/GuardView/BoatView/RequestView/UserDto/...)
ids.ts      parsePositiveInt (strikte Route-ID-Validierung)
```
Server UND beide SPAs importieren daraus → **keine Duplikat-Logik** mehr.

**`apps/api/src/`** (Fastify-Backend):
```
server.ts        Bootstrap: DB init + Migrations + Seed, startet Public- + Admin-Listener
app.ts           createBaseApp() (Cookie/Session/WS/Health/Config/Auth) + buildApp() (Public + Domänen + Web-SPA)
admin-app.ts     buildAdminApp() (Basis + Domänen-GETs + Admin-Routen + Admin-SPA)
env.ts           Env-Parsing/Validierung
realtime.ts      WebSocket-Hub: broadcast(type) an alle Clients
paths.ts         Migrations-Ordner (bundle-sicher relativ zum Entry)
db/schema.ts     Drizzle-Tabellen
db/index.ts      better-sqlite3 (WAL) + Drizzle + runMigrations()
db/seed.ts       Erst-Admin-Seed (falls kein Admin existiert)
auth/            password (bcrypt), session-store (SQLite), rate-limit (Brute-Force)
plugins/auth.ts  requireAuth / requireWachfuehrer / requireAdmin / requireRole + computeScope (owner_id)
plugins/static.ts registerSpa(): gebaute SPA + SPA-Fallback (API/Health bleiben JSON-404)
lib/             validate (zod→400), audit (recordAudit), scope (Mandanten-Filter), views (DTO-Aufbau), mappers, templates
routes/          auth, config, towers, guards, boats, requests, dashboard, team (+ index = Domänen-Sammler)
routes/admin/    users, audit, templates (+ index, Gate requireAuth+requireAdmin) – NUR Admin-Listener
migrations/      Drizzle-kit-SQL (beim Start via runMigrations ausgeführt)
```

**`apps/web/src/`** (öffentliche Svelte-SPA):
```
lib/api.ts     fetch-Wrapper (credentials:'include'), ApiError
lib/stores.ts  Svelte-Stores (config/currentUser/towers/guards/boats/requests/summary/team) + refresh* + Toasts + Rollen-Helfer
lib/ws.ts      WebSocket-Client → gezielte refresh je Event + 30-s-Polling-Fallback
lib/util.ts    labelOf / fmtTime (UTC→lokal)
App.svelte     Auth-Gate + Tabs (Karte/Dashboard/Anfragen/Personal) + startet Realtime
components/     Login, Header, MapView (Leaflet), Dashboard, Requests, Team, *Modal, Toasts
```
**`apps/admin/src/`** (interne Admin-SPA): Login, Users, Templates (+ Vorlagen-Karte), Audit.

## Datenmodell (SQLite via Drizzle, `apps/api/src/db/schema.ts`)
```
users   id, username(uniq), password_hash, full_name, role[HAUPTWACHE|WACHFUEHRER|WACHGAENGER|BOOTSFUEHRER],
        tower_id(informativ), owner_id(→ Wachführer = Mandant), is_admin, is_active, last_login, created_at, updated_at
towers  id, name, call_sign, latitude, longitude, required_staff(Basis, Default 2), present_staff(manuelle Ist-Besetzung), owner_id, created_at
guards  id, user_id, tower_id, name, status[IN_AREA|MINUS_ONE|DEPLOYED|BREAK], latitude, longitude, owner_id, updated_at
boats   id, name, call_sign, tower_id, status[AT_TOWER|PATROL|DEPLOYED|OUT_OF_SERVICE], latitude, longitude, owner_id, updated_at
minus_one_requests  id, guard_id, requested_by, kind[MINUS_ONE|K_FAHRT], reason[PAUSE|TOILET|CATERING|MATERIAL|OTHER|null], note,
                    status[PENDING|APPROVED|REJECTED|RETURNED], rejection_reason, created_at, decided_at, decided_by, returned_at
audit_log  id, user_id, action, entity_type, entity_id, details(JSON), ip_address, timestamp
tower_templates / boat_templates   Admin-Vorlagen, bei WF-Anlage in dessen Scope geklont
sessions   sid, sess(JSON), expire (Session-Store)
```
Die Tabelle `minus_one_requests` trägt **beide** Anfrage-Arten (`kind`): klassische `-1`
(`reason` Pflicht) und `K_FAHRT` (Kontrollfahrt, `reason=null`). Die frühere separate Tabelle
`control_trip_requests` sowie die Crypto-Schicht bleiben **entfallen**.

**Kontrollfahrt (K-Fahrt):** Bootsführer/Wachführer beantragen (`POST /api/requests/k-fahrt`,
`kind=K_FAHRT`, Status `PENDING`). Der **Wachführer setzt** sie aktiv über
`POST /api/requests/:id/set-k-fahrt` (Status → `APPROVED`) – **nicht** über `…/approve` (das lehnt
K-Fahrten mit 409 ab). Beenden über `…/return` (Status `RETURNED`; anders als `-1` ohne
Guard-Status-Änderung). Jede **aktive** K-Fahrt (`APPROVED`) reduziert die Ist-Besetzung des Turms
ihres Wachgängers um `K_FAHRT_STAFF_REDUCTION` (=2) – rein abgeleitet in `buildTowerViews`.

**Turmfarbe (`shared/status.ts`):** `currentStaff` = Wachgänger `IN_AREA` (`guardStaff`) **+**
`towers.present_staff` (manuell gemeldete Anwesende) **−** 2 je aktiver K-Fahrt (min. 0). `GREEN` ≥
effektiver Soll, `YELLOW` ≥ 50 %, sonst `RED` – gegen die **effektive** Sollstärke. `GET /api/towers`
liefert zusätzlich `activeKFahrten` + `kFahrtReduction`.
**Boots-abhängige Sollstärke:** Basis `required_staff` (Default 2); pro Boot `AT_TOWER` **+1**
(2 WF + 1 BF), `PATROL`/`DEPLOYED` **−1** (Boot weg → Warnung), `OUT_OF_SERVICE` **±0**;
`effectiveRequiredStaff = max(1, Basis + Σ Delta)`. `GET /api/towers` liefert `effectiveRequiredStaff`
+ Boots-Lage (`hasBoat`/`boatsAtTower`/`boatsAway`/`boatsBroken`/`boatWarning`).

**Mandanten-Modell (owner_id):** Jeder **Wachführer ist ein eigener Mandant**. Jedes Domänen-
Objekt + Personal-Konto trägt `owner_id`. `computeScope(user)` (in `plugins/auth.ts`):
Admin → `{all:true}`; WF → eigene `id`; WG/BF → `owner_id` ihres WF. Alle GET-Routen filtern per
`scopeWhere(scope, table.ownerId)`; Schreib-/Genehmigungsrechte sind an den **Owner** gebunden.
> **Falle:** KEIN Admin-Bypass für operative/verwaltende Endpunkte. Operative Mutationen nutzen
> `requireWachfuehrer` (kein Admin) + Owner-Prüfung (`ownerId === user.id`). Der App-Admin
> (`is_admin`, Rolle HAUPTWACHE) ist **reine Ansicht** + Kontoverwaltung (nur über den Admin-Listener).

**Rollen:** `HAUPTWACHE` (App-Admin, `is_admin`) · `WACHFUEHRER` (Mandant, verwaltet & genehmigt
sein Eigenes) · `WACHGAENGER` (darf `-1` beantragen) · `BOOTSFUEHRER` (wie WG + darf Boot-Status setzen
+ K-Fahrt beantragen).

## Konventionen & Fallen
- **Migrationen:** Schema in `db/schema.ts` ändern → `npm run db:generate` (drizzle-kit) erzeugt
  neue SQL-Migration in `apps/api/migrations/`; beim Start via `runMigrations()` angewandt. Migrationen
  **committen** (sie werden ins Image kopiert).
- **Realtime:** Jede Mutation ruft `app.realtime.broadcast('<typ>-updated')` → alle Clients refreshen
  gezielt. Neue mutierende Route → **immer** broadcasten (Typen in `shared/types.ts:WsEventType`).
- **Audit:** Jede Mutation `recordAudit(req, action, entityType, entityId, details?)`.
- **Validierung:** Request-Bodies über zod-Schemas aus `shared` + `parseBody(schema, req.body, reply)`.
- **IDs:** Route-IDs über `parsePositiveInt()` (kein `'5abc'→5`).
- **XSS:** Svelte escaped automatisch; keine `{@html}` mit Nutzerdaten.
- **WAL ist ok:** EIN Prozess öffnet die DB → `journal_mode=WAL` ist sicher & schnell (die alte
  Multiprozess-Härtung DELETE/Init-Lock/Session-Heal entfällt).
- **Cookie `secure`:** explizites `COOKIE_SECURE` hat Vorrang; sonst = `NODE_ENV=production`. Ohne TLS
  auf `false` lassen (sonst verwirft der Browser das Session-Cookie).
- **Zeit:** SQLite-Zeitstempel sind UTC; `fmtTime` formatiert lokal.
- **shared-Import:** Wird von tsup ins API-Bundle gezogen (`noExternal`) und von Vite direkt aus dem
  Quelltext konsumiert – kein separater Build von `packages/shared` nötig.

## Testing
`npm test` → **Vitest**:
- `packages/shared/*` – Status- & ID-Logik (rein).
- `apps/api/test/auth.test.ts` – Auth-Gate, Login, Setup, Registrierung.
- `apps/api/test/domain.test.ts` – Scope-Isolation (WF1 vs WF2), `-1/+1`-Workflow, Boots-Sollstärke, Admin view-only.
- `apps/api/test/admin.test.ts` – **harte Admin-Grenze** (Public 404 / Admin 200), Vorlagen-Klon, Last-Admin-Schutz.
Tests booten echte Fastify-Instanzen mit In-Memory-SQLite (`app.inject()` + Cookie-Jar).
**CI:** `.github/workflows/test.yml` (typecheck + svelte-check + build + test, Node 20).

## Deployment
Multi-Stage-`Dockerfile` (baut SPAs + API, `npm prune --omit=dev`), **ein** Container, Ports 3002 +
3003. `docker-compose.yml` (GHCR-Image) / `docker-compose.build.yml` (lokal): Admin-Port nur an
`127.0.0.1` gemappt. CI: `docker.yml` (Multi-Arch → GHCR), `release.yml` (Semantic-Release).
`GET /api/version` → `{ version, latest, updateAvailable, releaseUrl }` (GitHub-Release, 6 h gecacht).

## Doku aktuell halten (Wartungsvertrag)
| Änderung | Datei |
|---|---|
| Neues Feature / Bugfix | **docs/FEATURES.md** |
| Architektur/Datenmodell/Konvention/neue Moduldatei | **CLAUDE.md** |
| Arbeitsstand / offene ToDos | **HANDOFF.md** |
| Deployment / Datenschutz | `docs/*` |
