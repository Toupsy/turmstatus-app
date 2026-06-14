# Architekturkonzept – Digitales Wach- und Statussystem (Turmstatus)

Zentrales Lage- und Statussystem für einen Wasserrettungsdienst an der Ostsee.
Bildet den bisherigen Funkverkehr (`-1` beim Verlassen, `+1` bei Rückkehr) digital ab
und stellt die Lage aller Türme, Wachgänger und Boote in Echtzeit auf einer Karte dar.

## 1. Anforderungsanalyse

| Bereich | Kernanforderung |
|---|---|
| Kommunikation | `-1`/`+1` digital mit Genehmigungs-Workflow statt Funk |
| Lagebild | Echtzeit-Einsatzkarte (OSM/Leaflet) mit Türmen, Wachgängern, Booten |
| Rollen | Hauptwache, Turmführer, Wachgänger |
| Betrieb | Docker auf Synology NAS (ARM + x86), persistente DB, einfaches Update |
| Sicherheit | Login, Passwort-Hashing, JWT, Rollenrechte, Rate-Limiting, Input-Validierung |
| Auditierung | Lückenloses Protokoll (Wer / Wann / Was) |
| Mobil | Responsive für Smartphone / Tablet / Desktop |
| Zukunft | Datenmodell für Einsätze bereits vorbereitet |

## 2. Technologieentscheidung

| Schicht | Technologie | Begründung |
|---|---|---|
| Backend | **FastAPI (Python 3.12)** | Schnell, typsicher, native WebSockets, automatische OpenAPI-Doku, gut wartbar |
| ORM/DB | **SQLAlchemy 2.0 + PostgreSQL 16** | Robust, transaktionssicher, bewährt für Lagesysteme |
| Auth | **JWT (OAuth2 Password Flow)** + bcrypt (passlib) | Zustandslos, einfach hinter Reverse-Proxy, kein Server-Session-Store nötig |
| Realtime | **WebSockets** (FastAPI) | Push der Lageänderungen ohne Reload |
| Rate-Limit | **slowapi** | Schutz von Login/Mutationen |
| Frontend | **React 18 + Vite** | Schnelles SPA-Toolings, große Community |
| Karte | **Leaflet + react-leaflet + OpenStreetMap** | Kostenlos, offlinefähig, keine API-Keys |
| State | **Zustand** | Minimaler, wartbarer Store für Auth + Live-Daten |
| Container | **Docker + Compose**, Multi-Arch Images | Läuft auf Synology NAS (ARM64 & x86_64) |

Begründung der Einfachheit: Drei Container (db, backend, frontend-nginx), keine externen
Cloud-Dienste, keine API-Keys, ein einziges `docker compose up -d` zum Start.

## 3. Datenmodell

```
User            (Benutzer + Login)
 ├─ id, username, hashed_password, full_name, role[HAUPTWACHE|TURMFUEHRER|WACHGAENGER]
 ├─ tower_id (FK, optional – Zuordnung Turmführer/Wachgänger)
 └─ is_active, created_at

Tower           (Wachturm)
 ├─ id, name, call_sign (Funkrufname), latitude, longitude
 ├─ required_staff (Sollstärke), status[GREEN|YELLOW|RED] (abgeleitet)
 └─ created_at

Guard           (Wachgänger-Lageobjekt / mobile Einheit)
 ├─ id, user_id (FK), tower_id (FK), name
 ├─ status[IN_AREA|MINUS_ONE|DEPLOYED|BREAK]
 ├─ latitude, longitude (optional)
 └─ updated_at

Boat            (Rettungsboot)
 ├─ id, name, call_sign, tower_id (FK, optional)
 ├─ status[AT_TOWER|PATROL|DEPLOYED|OUT_OF_SERVICE]
 ├─ latitude, longitude
 └─ updated_at

MinusOneRequest (-1/+1 Workflow)
 ├─ id, guard_id (FK), requested_by (FK User)
 ├─ reason[PAUSE|TOILET|CATERING|MATERIAL|OTHER], note (Freitext)
 ├─ status[PENDING|APPROVED|REJECTED|RETURNED]
 ├─ created_at, decided_at, decided_by (FK), returned_at
 └─ rejection_reason

Operation       (Einsatz – vorbereitet, noch nicht voll implementiert)
 ├─ id, operation_number, location, alarm_time
 ├─ status[NEW|RUNNING|CLOSED], description
 └─ involved_units (JSON: tower/guard/boat ids)

AuditLog        (Protokollierung)
 ├─ id, actor_id (FK User), action, entity_type, entity_id
 ├─ detail (JSON), created_at
```

Status-Ableitung Turmfarbe: `besetzt = Wachgänger mit Status IN_AREA`.
`GREEN` ≥ Sollstärke, `YELLOW` ≥ 50 %, sonst `RED`.

## 4. API-Endpunkte (Auswahl)

```
POST   /api/auth/login                 -> JWT (OAuth2 password)
GET    /api/auth/me                     -> aktueller Benutzer

GET    /api/towers                      -> Liste Türme (mit abgeleitetem Status)
POST   /api/towers                      -> Turm anlegen           [HAUPTWACHE]
PATCH  /api/towers/{id}                 -> Turm bearbeiten         [HAUPTWACHE|TURMFUEHRER(eigener)]

GET    /api/guards                      -> Wachgänger
PATCH  /api/guards/{id}/position        -> Position aktualisieren
PATCH  /api/guards/{id}/status          -> Status setzen

GET    /api/boats                       -> Boote
POST   /api/boats / PATCH /api/boats/{id}

POST   /api/requests/minus-one          -> -1 beantragen          [WACHGAENGER]
POST   /api/requests/{id}/approve        -> genehmigen            [HAUPTWACHE]
POST   /api/requests/{id}/reject         -> ablehnen              [HAUPTWACHE]
POST   /api/requests/{id}/return         -> +1 / Rückkehr melden  [WACHGAENGER|TURMFUEHRER]
GET    /api/requests?status=PENDING     -> offene Anfragen

GET    /api/dashboard/summary           -> Kennzahlen Hauptwache
GET    /api/audit                       -> Audit-Log              [HAUPTWACHE]
GET    /api/users / POST /api/users      -> Benutzerverwaltung     [HAUPTWACHE]

WS     /api/ws                          -> Live-Updates (Broadcast aller Lageänderungen)
```

## 5. Rollen & Rechte

| Aktion | Hauptwache | Turmführer | Wachgänger |
|---|:---:|:---:|:---:|
| Alle Türme/Boote/Wachgänger sehen | ✅ | eigener Turm | eigener |
| `-1` beantragen | – | ✅ | ✅ |
| `-1` genehmigen/ablehnen | ✅ | – | – |
| `+1` / Rückkehr melden | ✅ | ✅ | ✅ |
| Karte / Dashboard | ✅ | ✅ (Sicht) | eigener Status |
| Benutzerverwaltung / Audit | ✅ | – | – |

## 6. Ordnerstruktur

```
turmstatus-app/
├── docker-compose.yml
├── .env.example
├── README.md / ARCHITECTURE.md / HANDOFF.md / INSTALL_SYNOLOGY.md
├── backend/
│   ├── Dockerfile  requirements.txt
│   └── app/
│       ├── main.py config.py database.py security.py deps.py ws.py seed.py
│       ├── models.py  schemas.py  audit.py
│       └── routers/  auth towers guards boats requests dashboard users audit
└── frontend/
    ├── Dockerfile  nginx.conf  package.json  vite.config.js  index.html
    └── src/  (api, store, components, pages)
```

## 7. Echtzeit & Robustheit

- WebSocket-Broadcast bei jeder Lageänderung; Clients reconnecten automatisch.
- Frontend pollt zusätzlich als Fallback alle 30 s (degradierter Betrieb bei WS-Ausfall).
- PostgreSQL-Volume persistent; Healthchecks in Compose; Backend wartet auf DB-Health.
- Alle Mutationen erzeugen einen AuditLog-Eintrag in derselben Transaktion.
