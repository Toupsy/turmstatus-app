# Demo-Preview auf Cloudflare Workers

Jeder Pull Request wird automatisch als **öffentliche Demo ohne Backend** auf Cloudflare
Workers deployt (analog zum Wachplan-Generator). Push auf `main` aktualisiert zusätzlich die
Dauer-Demo `turmstatus-demo`.

## Wie es funktioniert

```
GitHub PR ──▶ deploy-preview.yml
              1. npm ci
              2. Build apps/web  (Base /)         → dist-preview/
                 Build apps/admin (Base /admin/)  → dist-preview/admin/
              3. wrangler deploy --env preview --name turmstatus-preview-pr-<N>
              4. PR-Kommentar mit Preview-URL
```

- **Kein Backend:** Der Worker (`worker/index.js`) liefert nur statische Assets + SPA-Fallback;
  `/api/*` antwortet defensiv mit 503.
- **Demo-Modus im Browser:** Die SPAs erkennen `*.workers.dev` (oder `?demo` in der URL) und
  leiten alle API-Aufrufe an `handleDemoRequest()` aus `@turmstatus/shared/demo` um – dieselben
  zod-Schemas, Rollen-Gates, Mandanten-Scopes und Workflows wie der echte Server, nur über einer
  JSON-„DB" in `localStorage`.
- **Rollen-Umschalter:** Dropdown im Header (Hauptwache/Wachführer/Wachgänger/Bootsführer).
  Die Rolle liegt in `sessionStorage`, also **pro Tab**: zwei Tabs mit verschiedenen Rollen
  öffnen → Mutationen werden per `storage`-Event an alle Tabs gemeldet, der Wachführer-Tab sieht
  z.B. eine im Wachgänger-Tab beantragte `-1` sofort (Ersatz für den WebSocket).
- **Admin-Panel:** Unter `/admin/` liegt die interne Admin-SPA, in der Demo ohne Login als
  Hauptwache (Benutzer/Vorlagen/Audit-Log inkl. der eben ausgeführten Demo-Aktionen). Die harte
  Admin-Grenze ist eine Server-Eigenschaft und in der reinen Frontend-Demo bewusst aufgehoben.
- **Daten:** nur lokal im Browser. „Demo zurücksetzen" (Header) stellt den Seed wieder her; ein
  neuer Seed wird auch bei defekter/veralteter Demo-DB (`DEMO_DB_VERSION`) geladen.

## Einmalige Einrichtung (GitHub-Secrets)

Wie beim Wachplan-Generator werden zwei Repo-Secrets benötigt:

| Secret | Inhalt |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API-Token mit `Workers Scripts:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare-Account-ID (auch in `wrangler.toml`) |

## Lokal testen

```bash
npm run dev:web    # http://localhost:5173/?demo=1  → Demo-Modus ohne Backend
npm run dev:admin  # http://localhost:5174/?demo=1  → Admin-Demo
```

Oder wie im CI bauen und statisch prüfen:

```bash
npm run build --workspace @turmstatus/web
npm run build --workspace @turmstatus/admin -- --base=/admin/
mkdir -p dist-preview/admin && cp -r apps/web/dist/. dist-preview/ && cp -r apps/admin/dist/. dist-preview/admin/
npx wrangler dev --env preview   # Worker lokal (Assets aus dist-preview/)
```

## Grenzen der Demo

- Passwörter werden nicht geprüft (Login akzeptiert jeden Benutzernamen aus dem Seed).
- Kein echter WebSocket, keine Persistenz über den Browser hinaus, kein `/api/version`.
- Preview-Worker werden nicht automatisch gelöscht → bei Bedarf im Cloudflare-Dashboard
  aufräumen (`turmstatus-preview-pr-*`).
