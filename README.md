# 🛟 Turmstatus – Digitales Wach- und Statussystem

Digitales Wach- und Statussystem für einen Wasserrettungsdienst an der Ostsee. Es ersetzt den
Funkverkehr (`-1` beim Verlassen des Turms, `+1` bei Rückkehr) durch einen digitalen
Genehmigungs-Workflow und zeigt die Lage aller **Türme, Wachgänger und Boote** in **Echtzeit**
auf einer OpenStreetMap-Karte.

## Funktionen
- **Live-Lagekarte** (Leaflet): farbcodierte Türme (grün/gelb/rot), Wachgänger- und Boots-Marker.
  Wachführer positionieren Türme/Boote per Klick, Drag oder Rechtsklick auf die Karte.
- **-1/+1-Workflow:** Wachgänger beantragt das Verlassen des Bereichs → der Wachführer genehmigt
  oder lehnt ab → Rückkehr per `+1`. Jeder Schritt landet im Audit-Log.
- **Türme, Boote, Wachgänger** verwalten (owner-scoped je Wachführer).
- **Boots-abhängige Sollstärke:** liegt ein Boot am Turm, steigt die Sollstärke (Bootsführer);
  ist das Boot unterwegs, sinkt sie – mit Warnung „Boot nicht am Turm".
- **Manuelle Ist-Besetzung:** der Wachführer meldet anwesende Kräfte per +/–, ohne für jeden ein
  Konto anzulegen.
- **Mandanten-Modell:** jeder Wachführer sieht/verwaltet/genehmigt nur sein Eigenes.
- **Interner Admin-Bereich:** Benutzerverwaltung, Audit-Log, Demo-Vorlagen – auf einem separaten,
  nur lokal erreichbaren Port.
- **Echtzeit** via WebSocket (+ 30-s-Polling-Fallback).

## Tech-Stack
TypeScript-Monorepo (npm workspaces): **Fastify** + **better-sqlite3/Drizzle** (Backend),
**Svelte 5 + Vite** + **Leaflet** (zwei SPAs), **Vitest** (Tests). Ein Node-Prozess bedient zwei
Ports: die öffentliche App (3002) und den internen Admin-Bereich (3003).

## Schnellstart (lokal, ohne Docker)
```bash
npm install
npm run build
SESSION_SECRET=mindestens-32-zeichen-langes-secret \
  ADMIN_PASSWORD=wache2024 \
  npm start
# → http://localhost:3002 (App)   ·   http://localhost:3003 (Admin, nur lokal)
```
**Entwicklung mit Hot-Reload** (drei Terminals oder `&`):
```bash
npm run dev          # API (tsx watch) auf 3002/3003
npm run dev:web      # Vite-Dev-Server der App (5173), proxyt /api → 3002
npm run dev:admin    # Vite-Dev-Server des Admins (5174), proxyt /api → 3003
```

## Docker
```bash
# Vorgefertigtes Image aus GHCR:
SESSION_SECRET=... ADMIN_PASSWORD=... docker compose up -d
# Lokal bauen:
SESSION_SECRET=... ADMIN_PASSWORD=... docker compose -f docker-compose.build.yml up -d --build
```
Der Admin-Port wird nur an `127.0.0.1` des Hosts gebunden – so kann die App via Cloudflare/Reverse-
Proxy öffentlich gemacht werden, während der Admin-Bereich intern bleibt. Details:
[docs/PORTAINER.md](docs/PORTAINER.md).

## Konfiguration
Siehe [`.env.example`](.env.example). Wichtig: `SESSION_SECRET` (≥ 32 Zeichen), `ADMIN_PASSWORD`
(Erst-Admin), `COOKIE_SECURE=false` ohne TLS, `ADMIN_BIND=127.0.0.1`.

## Tests
```bash
npm test          # Vitest (Unit + API-Integration)
npm run typecheck # tsc -b (shared + api)
```

## Rollen
- **Hauptwache (App-Admin):** Kontoverwaltung + reine Ansicht (interner Admin-Bereich).
- **Wachführer:** eigener Mandant – verwaltet Türme/Boote/Personal, genehmigt `-1`.
- **Wachgänger:** darf `-1` beantragen.
- **Bootsführer:** wie Wachgänger + darf den Boot-Status setzen.

## Doku
- Architektur: [ARCHITECTURE.md](ARCHITECTURE.md) · Entwickler-Kontext: [CLAUDE.md](CLAUDE.md)
- Stand/ToDos: [HANDOFF.md](HANDOFF.md) · Feature-Historie: [docs/FEATURES.md](docs/FEATURES.md)

## Lizenz
MIT
