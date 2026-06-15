# HANDOFF – Entwicklungsfortschritt

Statusdokument zum Projekt **Turmstatus** (digitales Wach- und Statussystem Wasserrettung).

## Aktueller Stand
**Voller Tech-Stack-Umbau abgeschlossen.** Die App wurde von
FastAPI/PostgreSQL/React auf den Stack des **DLRG-Wachplan-Generators** umgestellt:
**Express + SQLite + Vanilla JS**, Session-Auth, WebSocket-Lagebild, Admin-Server,
GHCR-Multi-Arch-Image + Semantic Release. Infrastruktur (db/, session, crypto, ids,
auth) ist absichtlich deckungsgleich zum Schwester-Projekt → spätere Zusammenführung möglich.

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
