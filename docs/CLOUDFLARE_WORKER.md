# Cloudflare Worker & Preview-Umgebung

> Deckungsgleich zum Schwester-Projekt **Wachplan-Generator**
> (`docs/CLOUDFLARE_WORKER.md` dort), mit **einem** wichtigen Unterschied: Turmstatus
> ist backend-getrieben (Lagebild aus der DB). Eine Preview **ohne Backend** zeigt daher
> nicht localStorage-Daten, sondern einen **In-Memory-Demo-Datensatz** (`public/js/preview.js`).

## Übersicht

Der Worker (`src/worker.js`):
- serviert die statischen Dateien aus `public/` über Cloudflares Asset-System,
- proxied API-/WebSocket-Anfragen (`/api/*`) zum Origin-Server (Production),
- handhabt das SPA-Routing (Fallback auf `Turmstatus.html`),
- injiziert `window.WORKER_ENVIRONMENT` in die HTML.

In **Preview-Deployments** (`*.workers.dev`, Hostname mit `preview`/`pr-`) gibt es **keinen
Origin-Server**: `/api/*` liefert 503, und `WORKER_ENVIRONMENT='preview'` schaltet das Frontend
in den **Demo-Modus** – kein Login, alle Daten aus `preview.js`.

## Dateien

```
wrangler.toml                       Cloudflare-Worker-Konfiguration
src/worker.js                       Worker-Einstiegspunkt (Assets + API-Proxy + SPA-Fallback)
public/js/preview.js                In-Memory-API-Mock + Demo-Datensatz (Preview-Modus)
.github/workflows/deploy-preview.yml GitHub Action: deployt Preview pro PR + Push auf main
```

## Demo-/Preview-Modus (kein Login)

`preview.js` erkennt den Preview-Modus (`window.WORKER_ENVIRONMENT==='preview'` **oder**
`*.workers.dev`-Host) über das globale `PREVIEW_MODE`. Dann gilt:

- **`api.js`** ruft statt `fetch()` den Mock `previewRequest(method, url, body)` auf → alle
  Lese-Endpunkte liefern Demo-Daten, Mutationen ändern den In-Memory-Stand.
- **`auth.js`** bekommt über `/api/auth/me` einen Demo-**Wachführer** zurück → `onAuthenticated()`
  läuft sofort, das Login-Modal erscheint nie.
- **`ws.js`** lässt den WebSocket aus; stattdessen löst jede Mutation im Mock `_handleEvent(...)`
  direkt aus (dieselbe Refresh-Logik wie ein echter Broadcast).

Der Demo-Datensatz (4 Türme, 7 Wachgänger, 2 Boote, Anfragen, eine Kontrollfahrt, Team) liegt
rund um das Map-Zentrum aus `server/config.json`. Die Preview ist **voll interaktiv**
(Türme/Boote anlegen, -1/+1-Workflow, Status ändern), aber flüchtig: ein Reload setzt alles
zurück, nichts wird gespeichert.

## Konfiguration (`wrangler.toml`)

```toml
account_id = "…"                     # Cloudflare-Account
workers_dev = true                   # *.workers.dev-Preview-URLs

[env.production.vars]
ORIGIN_SERVER = "https://turmstatus.de"   # Production-Backend (Express, Port 3002)
```

Production-Route ist auskommentiert, bis die Domain feststeht – die Preview braucht sie nicht.

## Deploy

```bash
# Lokal testen
npx wrangler dev

# Preview manuell
npx wrangler deploy --env preview

# Production
npm run deploy
```

### GitHub Action (automatisch)

`deploy-preview.yml` deployt bei jedem **Pull Request** (und Push auf `main`) eine Preview und
kommentiert die URL in den PR. Benötigte Repo-Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Preview-URL-Schema: `https://pr-<NR>.turmstatus-preview.workers.dev`.

## Architektur

```
Browser
  ↓
Cloudflare Worker
  ├→ /js/*, /*.css, … → Cloudflare Assets (statisch)
  ├→ /api/*           → Production: Proxy zum Origin (Express); Preview: 503 → Demo-Modus
  └→ sonst            → Turmstatus.html (SPA-Fallback) + window.WORKER_ENVIRONMENT
  ↓ (nur Production)
Origin Server (Node.js Express + SQLite, /api/ws WebSocket)
```
