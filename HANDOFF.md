# HANDOFF – Entwicklungsfortschritt

Statusdokument zum Projekt **Turmstatus** (digitales Wach- und Statussystem Wasserrettung).

## Aktueller Stand
**Vollständiger Neubau (Full-TypeScript) abgeschlossen.** Die App wurde vom alten Stack
(Express + SQLite + Vanilla JS) auf ein TypeScript-Monorepo umgestellt:

- **`packages/shared`** – geteilte Status-/ID-Logik, zod-Schemas, DTO-Typen, Config (Server = Client).
- **`apps/api`** – Fastify + better-sqlite3 (WAL) + Drizzle ORM, Session-Auth, WebSocket, zod-Validierung.
- **`apps/web`** – öffentliche Svelte-SPA (Karte/Dashboard/Anfragen/Personal), optimistische Updates.
- **`apps/admin`** – interne Admin-SPA (Benutzer/Vorlagen/Audit).

**Beibehalten:** Mandanten-Modell (owner_id-Isolation pro Wachführer), Demo-Vorlagen, boots-
abhängige Sollstärke, manuelle Ist-Besetzung, `-1/+1`-Workflow, Audit-Log, Docker/GHCR/Semantic-Release.
**Weggelassen:** ungenutzte Crypto-Schicht sowie die gesamte SQLite-Multiprozess-Härtung (dank
Einzelprozess + WAL nicht mehr nötig).

**Neu (Cloudflare Worker – Preview/Demo):** `wrangler.jsonc` (Root) + `worker/index.js` liefern die
gebaute Web-SPA statisch aus und mocken `/api/*` mit einem In-Memory-Demodatensatz (Demo-Wachführer,
**kein Login**, Schreib-Requests → 403). Die echte App (better-sqlite3, nativ) läuft nicht auf
Workers – daher nur Demo. Deploy via `npm run deploy` oder Cloudflare Workers Builds
(`npx wrangler deploy`). Behebt den bisherigen Deploy-Fehler „application detection … workspace root"
(fehlende `wrangler.jsonc`). Details: `docs/CLOUDFLARE_WORKER.md`.

**Neu (K-Fahrt/Kontrollfahrten):** Bootsführer/Wachführer beantragen eine Kontrollfahrt
(`kind=K_FAHRT` in `minus_one_requests`); der **Wachführer setzt** sie über
`POST /api/requests/:id/set-k-fahrt` (bewusst getrennt vom Genehmigen). Eine gesetzte K-Fahrt
reduziert den betroffenen Turm automatisch um **2 WG** (abgeleitet in `buildTowerViews`); Beenden
über `…/return`. Siehe `docs/FEATURES.md`.

## Kernentscheidung: harte Admin-Grenze
Ein Node-Prozess bedient zwei Fastify-Listener: Public (3002) und Admin (3003, Bind `127.0.0.1`).
Die Admin-Routen existieren **nur** auf dem Admin-Listener → auf dem öffentlichen Port 404. In
Docker wird der Admin-Port nur host-lokal gemappt. So kann die App via Cloudflare öffentlich sein,
während der Admin-Bereich intern bleibt (ausdrücklicher Wunsch).

## Verifikation (Stand Neubau)
- `npm run typecheck` grün · `npm run build` (web + admin + api) grün.
- `npm test` → **35/35 grün** (shared-Logik, Auth/Setup, Scope-Isolation + `-1/+1` + K-Fahrt + Boots-Soll, Admin-Grenze).
- Server-Boot-Smoke: beide Ports antworten, Login/Seed/WAL ok, `/api/admin` auf Public = 404.
- Browser-Smoke (Chromium): Web- & Admin-SPA laden, Login, Tabs, Leaflet-Karte, Tabellen – 0 Konsolenfehler.

## Standard-Zugänge
- Erst-Admin (Hauptwache): `ADMIN_USERNAME` / `ADMIN_PASSWORD` (Seed beim Erststart, falls kein Admin
  existiert). Ohne Passwort greift der Erst-Setup-Flow (`POST /api/auth/init`).

## Bewusst offen / nächste Schritte
- **Live-GPS** der Wachgänger aus dem Browser (Endpoint `PATCH /api/guards/:id/position` vorhanden).
- **Versions-Sync:** Semantic-Release bumpt `package.json` (Root); die API meldet `APP_VERSION`
  (im Docker-Build als Build-Arg gesetzt). Bei Bedarf Workspace-Versionen mitziehen.
- **E2E-Tests** (Playwright) könnten die manuellen Browser-Smokes formalisieren.

## Verifikation (Kurzform zum Nachstellen)
1. `npm install && npm run build && npm test` → grün.
2. `SESSION_SECRET=…(≥32) ADMIN_PASSWORD=… npm start` → `GET /health` ok; Login Hauptwache am
   Admin-Port (3003), Wachführer anlegen; am App-Port (3002) einloggen, Turm/Wachgänger anlegen,
   `-1` beantragen → genehmigen → Karte/Status live → `+1`.
3. `curl :3002/api/admin/users` → 404; `curl :3003/api/admin/users` (mit Admin-Session) → 200.
