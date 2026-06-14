# 🛟 Turmstatus – Digitales Wach- und Statussystem

Zentrales Lage- und Statussystem für einen Wasserrettungsdienst an der Ostsee.
Ersetzt den bisherigen Funkverkehr (`-1` beim Verlassen des Bereichs, `+1` bei Rückkehr)
durch einen digitalen Genehmigungs-Workflow und zeigt die Lage aller **Türme**,
**Wachgänger** und **Boote** in **Echtzeit** auf einer OpenStreetMap-Karte.

> Robust genug, um während einer laufenden Wasserrettungswache als zentrales
> Lage- und Statussystem genutzt zu werden.

## Funktionen

- **Einsatzkarte** (OpenStreetMap/Leaflet): Türme farbcodiert (🟢 besetzt, 🟡 reduziert, 🔴 kritisch),
  Wachgänger und Boote als Marker mit Status.
- **Digitale -1 / +1**: Wachgänger beantragt „Bereich verlassen“ mit Grund (Pause, Toilette,
  Verpflegung, Material, Sonstiges) + optionalem Freitext → Hauptwache genehmigt/lehnt ab → `+1` Rückkehr.
- **Dashboard Hauptwache**: Personalübersicht (Türme, Personen im Dienst, aktive -1, Boote,
  offene Anfragen) und direkte Bearbeitung offener Anfragen.
- **Echtzeit** über WebSockets – keine manuellen Reloads (mit Polling-Fallback alle 30 s).
- **Rollen**: Hauptwache, Turmführer, Wachgänger – mit serverseitig erzwungenen Rechten.
- **Benutzerverwaltung**, **Audit-Protokoll** (Wer/Wann/Was), **Einsatz-Datenmodell** (vorbereitet).
- **Responsive** für Smartphone, Tablet und Desktop.

## Technologie

| Schicht | Technologie |
|---|---|
| Backend | FastAPI (Python 3.12), SQLAlchemy 2, WebSockets, JWT, slowapi (Rate-Limiting) |
| Datenbank | PostgreSQL 16 |
| Frontend | React 18 + Vite, react-leaflet, Zustand |
| Deployment | Docker + Docker Compose (ARM64 & x86_64), nginx |

Architektur-Details siehe [ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment-Varianten

| Zweck | Datei | Images |
|---|---|---|
| **Produktion (NAS/Portainer)** | `docker-compose.yml` | vorgefertigte GHCR-Images (NAS baut nicht selbst) |
| **Lokal / Entwicklung** | `docker-compose.build.yml` | werden lokal aus dem Quellcode gebaut |

### A) Produktion auf NAS (empfohlen)

Vorgefertigte Multi-Arch-Images (amd64 + arm64) werden per GitHub Actions nach
GHCR gebaut; die NAS lädt sie nur. Secrets werden als Environment-Variablen im
**Portainer-Stack** gesetzt – keine `.env`-Datei, keine Secrets in Git.

➡️ Schritt-für-Schritt: **[docs/UGREEN_PORTAINER.md](docs/UGREEN_PORTAINER.md)**
(gilt sinngemäß auch für Synology, siehe [INSTALL_SYNOLOGY.md](INSTALL_SYNOLOGY.md)).

Per CLI (Secrets als Umgebungsvariablen übergeben):

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 24) \
SECRET_KEY=$(openssl rand -hex 32) \
ADMIN_PASSWORD=$(openssl rand -base64 24) \
docker compose up -d
```

### B) Lokal selbst bauen

```bash
git clone <repo> turmstatus-app && cd turmstatus-app
POSTGRES_PASSWORD=test SECRET_KEY=test ADMIN_PASSWORD=wache2024 \
  docker compose -f docker-compose.build.yml up -d --build
```

Anwendung öffnen: **http://localhost:3456** (bzw. `http://<NAS-IP>:3456`).

### Standard-Logins (Seed-Daten)

| Rolle | Benutzer | Passwort |
|---|---|---|
| Hauptwache | `hauptwache` | dein `ADMIN_PASSWORD` |
| Turmführer | `turmfuehrer1` … `turmfuehrer4` | `turm2024` |
| Wachgänger | `wache1_1`, `wache1_2`, … | `wache2024` |

> ⚠️ **Alle Standardpasswörter vor dem Produktivbetrieb ändern.**

## Update

- **NAS/Portainer:** neue Images bauen lassen (Push auf `main` oder Workflow
  manuell) → in Portainer **Pull and redeploy**.
- **Lokal:** `git pull && docker compose -f docker-compose.build.yml up -d --build`

Die PostgreSQL-Daten bleiben im Named-Volume `turmstatus-db` erhalten.

## Installation auf Synology NAS

Siehe ausführliche Anleitung: [INSTALL_SYNOLOGY.md](INSTALL_SYNOLOGY.md).

## Entwicklung (ohne Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# lokale DB-URL setzen (z. B. SQLite-Ersatz nicht unterstützt → Postgres nutzen)
export DATABASE_URL=postgresql+psycopg2://turmstatus:turmstatus@localhost:5432/turmstatus
uvicorn app.main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev   # http://localhost:5173 (Proxy auf :8000)
```

API-Dokumentation (Swagger): `http://localhost:8000/docs`.

## Sicherheit

- Passwörter werden mit **bcrypt** gehasht (nie im Klartext).
- **JWT**-Authentifizierung (OAuth2 Password Flow), Token im `Authorization: Bearer`-Header.
- **Rollenrechte** serverseitig erzwungen.
- **Rate-Limiting** (Login 10/min, global 240/min).
- **Eingabevalidierung** über Pydantic-Schemas.
- Alle Mutationen werden im **Audit-Log** protokolliert.
