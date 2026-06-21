# 🛟 Turmstatus – Digitales Wach- und Statussystem

Zentrales Lage- und Statussystem für einen Wasserrettungsdienst an der Ostsee.
Ersetzt den bisherigen Funkverkehr (`-1` beim Verlassen des Bereichs, `+1` bei Rückkehr)
durch einen digitalen Genehmigungs-Workflow und zeigt die Lage aller **Türme**,
**Wachgänger** und **Boote** in **Echtzeit** auf einer OpenStreetMap-Karte.

> Aufgebaut auf demselben Stack wie der **DLRG-Wachplan-Generator**
> (Express + SQLite + Vanilla JS), damit beide Programme später zusammengeführt
> werden können.

## Funktionen
- **Einsatzkarte** (OpenStreetMap/Leaflet): Türme farbcodiert (🟢 besetzt, 🟡 reduziert,
  🔴 kritisch), Wachgänger (🚩) und Boote (⛵) als Marker mit Status.
- **Digitale -1 / +1**: Wachgänger beantragt „Bereich verlassen" mit Grund (Pause, Toilette,
  Verpflegung, Material, Sonstiges) + optionalem Freitext → Hauptwache genehmigt/lehnt ab → `+1` Rückkehr.
- **Dashboard Hauptwache**: Lage-Kennzahlen (Türme, im Dienst, aktive -1, Boote, offene Anfragen).
- **Kontrollfahrten**: Bootsführer beantragen eine Kontrollfahrt für ein Boot → Hauptwache/Wachführer
  genehmigt oder lehnt ab (erste Ausbaustufe, ohne weitere Boot-Statuslogik).
- **Echtzeit** über WebSockets (mit Polling-Fallback alle 30 s).
- **Rollen** serverseitig erzwungen: Hauptwache, Wachführer, Wachgänger, Bootsführer.
- **Konten-Hierarchie**: Der App-Admin legt Wachführer an (mit Wache); jeder Wachführer legt das
  Personal seiner **eigenen** Wache (Wachgänger/Bootsführer) selbst an.
- **Benutzerverwaltung** + **Audit-Protokoll** (Wer/Wann/Was), im Admin-Panel (Port 3003) oder
  in der App (Tab „Verwaltung"): App-Admin verwaltet alle, Wachführer nur die eigene Wache.
- **Responsive** für Smartphone, Tablet und Desktop.

## Technologie
| Schicht | Technologie |
|---|---|
| Backend | Node.js + **Express**, SQLite (`sqlite3`), `express-session` (SQLite-Store), bcryptjs, `ws` |
| Frontend | **Vanilla JS** (kein Framework) + Leaflet/OpenStreetMap |
| Auth | Session-Cookies (HTTPOnly), Rollenrechte serverseitig, Brute-Force-Schutz |
| Deployment | Docker (Multi-Arch amd64 + arm64), GHCR-Image, optional Admin-Server |

Architektur-Details: [ARCHITECTURE.md](ARCHITECTURE.md) · Projektkontext für Entwickler: [CLAUDE.md](CLAUDE.md).

## Schnellstart (lokal, ohne Docker)
```bash
npm ci
MASTER_SECRET=$(openssl rand -base64 32) \
SALT=$(openssl rand -base64 16) \
SESSION_SECRET=$(openssl rand -base64 32) \
ADMIN_USERNAME=hauptwache ADMIN_PASSWORD=wache2024 \
npm start
# App: http://localhost:3002   ·   Admin-Panel: npm run start:admin → http://localhost:3003
```
Beim ersten Start werden ein Hauptwache-Konto sowie ein Demo-Lagebild (4 Türme, 2 Boote) angelegt.

## Deployment (Docker / NAS)
```bash
cp .env.example .env   # Werte (Secrets) eintragen
docker compose up -d   # nutzt vorgefertigtes GHCR-Image
```
- App: `http://<host>:3002` (`HTTP_PORT`), Admin-Panel: `http://<host>:3003` (`ADMIN_HTTP_PORT`).
- Lokal selbst bauen: `docker compose -f docker-compose.build.yml up -d --build`.
- Schritt-für-Schritt (Portainer/UGREEN): **[docs/PORTAINER.md](docs/PORTAINER.md)**.

Die SQLite-Daten bleiben im Named-Volume `turmstatus-data` (`/app/data/turmstatus.db`).

## Update
- **Docker/Portainer:** neues Image bauen lassen (Push auf `main` oder Workflow manuell) →
  **Pull and redeploy**.
- **Lokal:** `git pull && npm ci && npm start`.

## Sicherheit
- Passwörter mit **bcryptjs** gehasht; **Session-Cookies** (HTTPOnly, sameSite=lax, 7 / 30 Tage).
- **Rollenrechte** serverseitig erzwungen; **Brute-Force-Schutz** (IP + Account, 10/15 min).
- **Eingabevalidierung**, **Audit-Log** aller Mutationen, Security-Header inkl. CSP.
- Secrets ausschließlich über `.env` / Environment-Variablen (nicht in Git).

## Entwicklung & Tests
```bash
npm test          # Node --test: status, ids, crypto, Integrationstest (-1/+1)
npm start         # Haupt-Server (3002)
npm run start:admin  # Admin-Server (3003)
```
