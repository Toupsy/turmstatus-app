# Architekturkonzept – Turmstatus

Zentrales Lage- und Statussystem für einen Wasserrettungsdienst an der Ostsee.
Bildet den bisherigen Funkverkehr (`-1`/`+1`) digital ab und stellt die Lage aller Türme,
Wachgänger und Boote in Echtzeit auf einer Karte dar.

Bewusst **deckungsgleich** zum DLRG-Wachplan-Generator aufgebaut (gemeinsame Infrastruktur),
um beide Programme später zusammenführen zu können.

## 1. Technologieentscheidung
| Schicht | Technologie | Begründung |
|---|---|---|
| Backend | **Express (Node.js 20)** | Schlank, identisch zum Schwester-Projekt, einfaches Single-Image-Deployment |
| DB | **SQLite** (`sqlite3`) | Eine Datei im Volume, kein separater DB-Container, robust für eine Wache |
| Auth | **Session-Cookies** (`express-session`, SQLite-Store) + bcryptjs | Serverseitige Session, kein Token-Handling im Client |
| Realtime | **WebSocket** (`ws`) auf `/api/ws` | Push aller Lageänderungen ohne Reload |
| Frontend | **Vanilla JS** + Leaflet/OpenStreetMap | Kein Build-Schritt, keine API-Keys, mergebar mit dem Wachplan-Generator |
| Container | **Docker + Compose**, Multi-Arch | Läuft auf NAS (ARM64 & x86_64) |

## 2. Datenmodell
Siehe **CLAUDE.md → Datenmodell** und `server/db/schema.sql`. Kernobjekte:
`users` (Login + Rolle), `towers`, `guards`, `boats`, `minus_one_requests`, `audit_log`.
Turmfarbe wird aus der Ist-/Soll-Besetzung abgeleitet (`server/status.js`).

## 3. API-Endpunkte (Auswahl)
```
POST   /api/auth/login | logout | init | register      GET /api/auth/me | needs-setup | registration-status
PUT    /api/auth/password

GET    /api/towers                  POST/PATCH/DELETE   (Status abgeleitet)
GET    /api/guards                  POST/DELETE
PATCH  /api/guards/:id/status       PATCH /api/guards/:id/position
GET    /api/boats                   POST/PATCH/DELETE

POST   /api/requests/minus-one      [WACHGAENGER|TURMFUEHRER]
POST   /api/requests/:id/approve    POST /api/requests/:id/reject   [HAUPTWACHE]
POST   /api/requests/:id/return     GET  /api/requests?status=PENDING

GET    /api/dashboard/summary
GET    /api/admin/users  POST  PATCH/:id  DELETE/:id  POST/:id/reset-password   [Admin]
GET    /api/admin/audit-log                                                     [Admin]

GET    /api/config   GET /api/version   GET /health
WS     /api/ws                       (Broadcast aller Lageänderungen)
```

## 4. Rollen & Rechte (serverseitig, `server/middleware.js`)
| Aktion | Hauptwache | Turmführer | Wachgänger |
|---|:---:|:---:|:---:|
| Lagebild sehen (Türme/Boote/Wachgänger) | ✅ | ✅ | ✅ |
| `-1` beantragen | ✅ | ✅ | ✅ |
| `-1` genehmigen/ablehnen | ✅ | – | – |
| `+1` / Rückkehr melden | ✅ | ✅ | ✅ |
| Turm/Boot bearbeiten | ✅ | eigener Turm | – |
| Benutzerverwaltung / Audit | ✅ | – | – |

## 5. Echtzeit & Robustheit
- Jede Mutation in den `api/*`-Routen ruft `broadcast('<typ>-updated')` → alle verbundenen
  Clients laden die betroffenen Daten neu. Frontend pollt zusätzlich alle 30 s (Fallback).
- WebSocket-Auth über die bestehende Express-Session (Upgrade-Handler in `server/realtime.js`).
- SQLite im persistenten Volume; WAL-Modus; Healthchecks in Compose.
- Alle Mutationen erzeugen einen `audit_log`-Eintrag.

## 6. Ordnerstruktur
```
turmstatus-app/
├── server.js                 (Shim → server/server.js)
├── package.json  Dockerfile  docker-compose.yml  docker-compose.build.yml  .env.example
├── server/
│   ├── server.js  admin-server.js  realtime.js  status.js  middleware.js  config.json
│   ├── db/  connection init schema.sql crypto session ids audit
│   └── api/ auth towers guards boats requests dashboard admin
├── public/
│   ├── Turmstatus.html  admin.html
│   └── js/ state utils api auth map views ws init
├── test/  status ids crypto api
└── docs/  PORTAINER.md  FEATURES.md
```
