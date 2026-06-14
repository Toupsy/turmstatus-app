# HANDOFF – Entwicklungsfortschritt

Statusdokument zum Projekt **Turmstatus** (digitales Wach- und Statussystem Wasserrettung).

## Meilensteine

### ✅ M1 – Architektur & Datenmodell
- Anforderungsanalyse, Technologieentscheidung und API-Design dokumentiert in
  [ARCHITECTURE.md](ARCHITECTURE.md).
- Datenmodell festgelegt: `User`, `Tower`, `Guard`, `Boat`, `MinusOneRequest`, `Operation`, `AuditLog`.

### ✅ M2 – Backend (FastAPI)
- SQLAlchemy-2-Modelle inkl. Enums (`backend/app/models.py`).
- Auth: JWT/OAuth2-Password, bcrypt-Hashing (`security.py`), Rollen-Dependencies (`deps.py`).
- Router: auth, towers, guards, boats, requests, dashboard, users, audit, operations(read).
- `-1`/`+1`-Workflow vollständig: beantragen → genehmigen/ablehnen → Rückkehr, mit Statuslogik
  für Wachgänger und abgeleiteter Turmfarbe.
- Audit-Log für alle Mutationen (`audit.py`), Rate-Limiting (`limiter.py`).
- WebSocket-Manager mit Broadcast (`ws.py`) + Endpoint `/api/ws` (Token-Auth).
- Idempotenter Seed mit mehreren Türmen an Ostsee-Koordinaten, Turmführern, Wachgängern, Booten
  (`seed.py`).
- Dockerfile + Healthcheck.

### ✅ M3 – Frontend (React + Vite + Leaflet)
- Auth-Flow (`Login`), Zustand-Store, axios-Client mit Token-Interceptor.
- WebSocket-Client mit Auto-Reconnect + 30-s-Polling-Fallback (`ws.js`).
- Seiten: Einsatzkarte (OSM/Leaflet, farbcodierte Türme + Marker), Dashboard Hauptwache,
  Wachgänger-Panel (-1/+1), Turmführer-Panel, Benutzerverwaltung, Audit-Ansicht.
- Rollenbasiertes Routing, responsives Layout.

### ✅ M4 – Deployment & Doku
- `docker-compose.yml` (db/backend/frontend, Healthchecks, persistentes Volume).
- `README.md`, `INSTALL_SYNOLOGY.md`.

### ✅ M5 – NAS-/Portainer-Deployment (UGREEN, am Wachplan-Generator orientiert)
- Produktions-`docker-compose.yml` nutzt vorgefertigte **GHCR-Images**
  (`ghcr.io/toupsy/turmstatus-{backend,frontend}`) – die NAS baut nicht selbst.
- GitHub-Actions-Workflow `.github/workflows/docker.yml` baut **Multi-Arch**
  (amd64 + arm64) und pusht nach GHCR.
- `dlrg-turmstatus-*`-Containernamen, Healthchecks auf allen Services,
  benanntes Volume `turmstatus-db`, eigenes Bridge-Netz.
- Secrets via **Portainer-Environment-Variablen** (Pflichtwerte mit `:?`),
  nicht in Git/`.env`.
- `docker-compose.build.yml` für lokales Bauen/Entwicklung.
- Anleitung `docs/UGREEN_PORTAINER.md`.

## Standard-Zugänge (Seed)
- Hauptwache: `hauptwache` / `wache2024`
- Turmführer: `turmfuehrer1..4` / `turm2024`
- Wachgänger: `wache1_1`, `wache1_2`, … / `wache2024`
(Passwörter über `.env` bzw. nach Login änderbar – vor Produktivbetrieb ändern.)

## Bewusst offen / nächste Schritte
- **Einsatzverwaltung**: Datenmodell `Operation` ist vorbereitet und per Read-API verfügbar;
  die operative Verwaltung (Anlegen/Zuordnen von Einheiten, Alarmierung) ist noch nicht
  implementiert (laut Auftrag bewusst nur vorbereitet).
- **DB-Migrationen**: Aktuell `create_all` beim Start. Für Schemaänderungen im Betrieb
  empfiehlt sich später Alembic.
- **Live-Positionen**: Endpoint `PATCH /guards/{id}/position` vorhanden; eine kontinuierliche
  GPS-Übermittlung aus dem Browser kann ergänzt werden.
- **Tests**: Smoke-/Integrationstests (pytest) können als nächstes ergänzt werden.

## Verifikation (Kurzform)
1. `docker compose up -d --build`, `GET /api/health` → ok, `/docs` erreichbar.
2. Login Hauptwache → Karte mit Seed-Türmen + Dashboard.
3. Wachgänger beantragt `-1` → erscheint sofort (WS) im Dashboard → genehmigen →
   Marker/Turmfarbe ändern sich → `+1` zurück. Alle Schritte im Audit-Log sichtbar.
