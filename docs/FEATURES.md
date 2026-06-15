# Feature- & Änderungs-Historie

> Historie funktionaler Änderungen. Stabiles Wissen → CLAUDE.md, aktueller Stand → HANDOFF.md.

## v0.1.0 – Tech-Stack-Umbau auf den Wachplan-Generator-Stack
Vollständiger Neubau der Turmstatus-App von FastAPI/PostgreSQL/React auf
**Express + SQLite + Vanilla JS**, deckungsgleich zum DLRG-Wachplan-Generator
(Vorbereitung der späteren Zusammenführung).

- **Infrastruktur** 1:1 vom Schwester-Projekt übernommen: zentrale SQLite-Verbindung,
  Session-Store, ID-Parsing, AES-Crypto-Schicht (`db/connection|session|ids|crypto`).
- **Auth**: Session-Cookies + bcryptjs, Login/Setup/Register, eigener Passwortwechsel,
  Brute-Force-Schutz (IP + Account). `/api/auth/me` liefert Rolle/Name/Turm.
- **Domäne**: Türme (mit abgeleiteter Statusfarbe), Wachgänger (Status/Position), Boote
  (Status/Position), `-1/+1`-Workflow (beantragen → genehmigen/ablehnen → Rückkehr),
  Dashboard-Kennzahlen.
- **Rollen** serverseitig erzwungen (HAUPTWACHE/TURMFUEHRER/WACHGAENGER).
- **Realtime**: WebSocket-Broadcast aller Lageänderungen an alle Clients + 30-s-Polling-Fallback.
- **Frontend**: Vanilla-JS-SPA mit Leaflet-Einsatzkarte, Dashboard, Anfragen-Tab,
  Verwaltungs-Tab (Admin). Separates self-contained Admin-Panel (Port 3003).
- **Audit-Log** auf allen Mutationen; Admin-Ansicht.
- **Demo-Seed**: 4 Türme + 2 Boote an Ostsee-Koordinaten beim Erststart (wenn leer).
- **Deployment**: Single Multi-Arch-Image (GHCR), `docker-compose.yml` + `.build.yml`,
  Semantic Release, CI (`npm test`).
- **Tests**: `status`, `ids`, `crypto`, Integrationstest (Server-Boot + -1/+1-Workflow).
