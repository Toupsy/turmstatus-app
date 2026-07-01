# Cloudflare Worker – Preview-/Demo-Modus

Turmstatus wird als **Cloudflare Worker** ausgeliefert, damit man die App **ohne
eigenen Server** öffentlich zeigen kann (z. B. je Pull Request oder als Demo).

## Warum nur „Demo"?

Die **echte App** (Fastify + `better-sqlite3` + Session-Auth) läuft **nicht** auf
der Cloudflare-Workers-Runtime: `better-sqlite3` ist ein **natives Node-Modul**
(synchrones SQLite), das Workers nicht ausführen. Ein Worker kann daher nur
**statische Assets** ausliefern.

Der Worker (`worker/index.js`) liefert deshalb:

- die **gebaute Web-SPA** (`apps/web/dist`) als statische Assets, und
- alle `GET /api/*` aus einem **statischen In-Memory-Demodatensatz**
  (4 Türme, 7 Wachgänger, 2 Boote, Anfragen inkl. K-Fahrt, Team).

`GET /api/auth/me` gibt einen **Demo-Wachführer** zurück → **kein Login nötig**.
Schreibende Requests (POST/PATCH/DELETE) werden bewusst mit **403** abgewiesen
(„Demo-Modus: Änderungen deaktiviert"). Der WebSocket `/api/ws` wird angenommen
und still offen gehalten (keine Broadcasts nötig – die Daten sind statisch).

> **Flüchtig:** Reload = Reset. Keine Persistenz, keine echte DB.

## Dateien

| Datei | Zweck |
|---|---|
| `wrangler.jsonc` | Worker-Konfiguration: `main`, Assets-Verzeichnis, `run_worker_first: ["/api/*"]` |
| `worker/index.js` | Fetch-Handler: Demo-Mock für `/api/*`, sonst statische Assets |

**Routing:** `assets.run_worker_first: ["/api/*"]` sorgt dafür, dass **nur**
`/api/*` den Worker erreicht; alles andere liefert das Assets-System direkt aus
(mit SPA-Fallback auf `index.html` via `not_found_handling: single-page-application`).

## Lokal testen

```bash
npm install
npm run build --workspace @turmstatus/web   # erzeugt apps/web/dist
npx wrangler dev                            # http://127.0.0.1:8787
```

## Deployen

```bash
npm run deploy        # build web SPA + wrangler deploy
# oder direkt:
npx wrangler deploy
```

### Cloudflare Workers Builds (Git-Integration)

Ist das Repo in Cloudflare als **Workers Build** verbunden, genügt:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`

Die Authentifizierung übernimmt die Git-Integration selbst – für diesen Pfad ist
**kein API-Token** nötig.

### Deploy aus GitHub Actions / lokal mit Token

Nur wenn **außerhalb** von Cloudflare Workers Builds deployt wird (z. B. eigener
GitHub-Actions-Workflow), braucht `wrangler` Zugangsdaten:

| Secret | Woher |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare-Dashboard → **My Profile → API Tokens → Create Token** → Template **„Edit Cloudflare Workers"** (Permissions u. a. *Account · Workers Scripts · Edit*). Der Token-Wert wird **nur einmal bei der Erstellung** angezeigt – danach nicht mehr abrufbar. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare-Dashboard, rechte Seitenleiste der Account-Übersicht (kein Geheimnis). |

Diese als Umgebungsvariablen setzen (`wrangler` liest sie automatisch) bzw. in
**GitHub → Settings → Secrets and variables → Actions** hinterlegen.

## Demo-Daten pflegen

Der Datensatz steht komplett in `worker/index.js` (Türme, Wachgänger, Boote,
Anfragen, Team, Summary). `APP_CONFIG` dort **spiegelt** `packages/shared/src/config.ts`
– bei Änderungen an der Config bitte nachziehen (der Worker ist bewusst
dependency-frei gehalten).
