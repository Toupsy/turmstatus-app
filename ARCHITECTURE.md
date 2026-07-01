# Architekturkonzept – Turmstatus

## Überblick
TypeScript-Monorepo mit vier Workspaces:

```
packages/shared   Reine, geteilte Logik + Verträge (Status-Ableitung, zod-Schemas, DTO-Typen, Config)
apps/api          Fastify-Backend (better-sqlite3 + Drizzle), Session-Auth, WebSocket
apps/web          Öffentliche Operativ-SPA (Svelte + Vite + Leaflet)
apps/admin        Interne Admin-SPA (Svelte + Vite)
```

Der Kern-Grundsatz: **Status- und Validierungslogik lebt einmal** in `packages/shared` und wird
von Server und beiden Clients importiert – keine doppelte Wahrheit mehr.

## Prozess- & Port-Modell
Ein einziger Node-Prozess (`apps/api/src/server.ts`) startet **zwei** Fastify-Instanzen, die sich
DB-Verbindung, Session-Store und Realtime-Hub teilen:

| Instanz | Port (Default) | Bind (Default) | Inhalt |
|---|---|---|---|
| Public | 3002 | `0.0.0.0` | Operativ-API + `apps/web`-SPA |
| Admin  | 3003 | `127.0.0.1` | Admin-API (`/api/admin/*`) + `apps/admin`-SPA + read-only Domänen-GETs |

**Harte Admin-Grenze:** Die Admin-Routen werden ausschließlich auf der Admin-Instanz registriert.
Auf dem öffentlichen Port existiert `/api/admin/*` gar nicht (404) – das ist eine Netzwerk-Grenze,
kein bloßer Rollen-Check. In Docker wird der Admin-Port nur an `127.0.0.1` des Hosts gemappt, sodass
die App via Cloudflare öffentlich sein kann, der Admin-Bereich aber intern bleibt.

## Datenfluss
```
Browser (Svelte-Store) ──fetch──▶ Fastify-Route ──Drizzle──▶ SQLite (WAL)
        ▲                               │
        │                               ├─ recordAudit()  → audit_log
        └──── WebSocket ◀── broadcast() ─┘  (bei jeder Mutation)
```
Jede Mutation validiert den Body per zod, prüft Owner/Scope, schreibt via Drizzle, protokolliert ins
Audit-Log und broadcastet ein `*-updated`-Event. Clients abonnieren den WebSocket und laden die
betroffenen Daten gezielt nach (Fallback: 30-s-Polling). Die SPAs führen für schnelle Interaktionen
zusätzlich optimistische Updates aus.

## Datenbank
- **better-sqlite3** (synchron) + **Drizzle ORM**. Da nur ein Prozess die DB öffnet, ist
  `journal_mode=WAL` sicher und schnell.
- Schema in `apps/api/src/db/schema.ts`; Migrationen via `drizzle-kit generate` →
  `apps/api/migrations/`, beim Start durch `runMigrations()` angewandt.
- Tabellen: `users`, `towers`, `guards`, `boats`, `minus_one_requests`, `audit_log`,
  `tower_templates`, `boat_templates`, `sessions`.

## Auth & Mandanten
- Session-Cookie (`@fastify/session` + SQLite-Store), bcrypt-Hashes, In-Memory-Brute-Force-Schutz.
- `computeScope(user)` liefert den Sichtbarkeits-Scope (Admin → alles; Wachführer → eigene `id`;
  Wachgänger/Bootsführer → `owner_id` ihres Wachführers). Alle Domänen-Queries filtern danach.
- Gates: `requireAuth`, `requireWachfuehrer` (kein Admin-Bypass), `requireAdmin`, `requireRole(...)`.

## API-Oberfläche (Auszug)
```
Auth      GET  /api/auth/me · POST /api/auth/login|logout|init|register|password · GET /needs-setup, /registration-status
Türme     GET/POST /api/towers · PATCH/DELETE /api/towers/:id
Wachg.    GET/POST /api/guards · PATCH /api/guards/:id · PATCH /:id/status · PATCH /:id/position · DELETE /:id
Boote     GET/POST /api/boats · PATCH /api/boats/:id · PATCH /:id/status · DELETE /:id
-1/+1     GET /api/requests · POST /minus-one · POST /:id/approve|reject|return
Sonstiges GET /api/dashboard/summary · GET /api/config · GET /api/version · GET /health · WS /api/ws
Team (WF) GET/POST /api/team/members · PATCH/DELETE /:id · POST /:id/reset-password
Admin*    GET/POST/PATCH/DELETE /api/admin/users · GET /api/admin/audit-log · .../tower-templates · .../boat-templates
```
`* nur auf dem internen Admin-Listener.`

## Frontend
- **Svelte 5 + Vite**, Zustand über Svelte-Stores; feingranulares Re-Rendering statt DOM-Neuaufbau.
- Karte als Leaflet-Komponente (verschiebbare Marker, Klick-/Rechtsklick-Platzierung).
- Build als statische Dateien; das Backend liefert sie aus (SPA-Fallback), sodass alles in einem
  Container läuft.

## Deployment
Multi-Stage-Docker-Image (baut SPAs + API, entfernt Dev-Deps), ein Container, Ports 3002 + 3003.
CI: Tests + Multi-Arch-Image nach GHCR + Semantic-Release.
