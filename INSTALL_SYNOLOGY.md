# Installation auf Synology NAS

Diese Anleitung beschreibt die Inbetriebnahme der Turmstatus-App auf einer Synology
DiskStation mit **Container Manager** (DSM 7.2+). Das Image ist für **x86_64** und
**ARM64** geeignet.

## Voraussetzungen

- Synology NAS mit DSM 7.2 oder neuer
- Paket **Container Manager** (im Paket-Zentrum installieren) – enthält Docker & Compose
- Ein freier Port (Standard: `8080`)
- Zugriff per DSM-Weboberfläche oder SSH

---

## Variante A – Container Manager (empfohlen, ohne SSH)

1. **Projektdateien hochladen**
   - In der **File Station** einen Ordner anlegen, z. B. `/docker/turmstatus`.
   - Den gesamten Projektinhalt (inkl. `docker-compose.yml`, Ordner `backend/`, `frontend/`)
     in diesen Ordner hochladen.

2. **`.env` anlegen**
   - `.env.example` nach `.env` kopieren und bearbeiten.
   - **Unbedingt ändern:** `SECRET_KEY` (z. B. `openssl rand -hex 32`),
     `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`.
   - Bei Bedarf `HTTP_PORT` anpassen, falls `8080` belegt ist.

3. **Projekt anlegen**
   - Container Manager → **Projekt** → **Erstellen**.
   - Projektname: `turmstatus`
   - Pfad: den hochgeladenen Ordner `/docker/turmstatus` wählen.
   - Quelle: **vorhandene `docker-compose.yml` verwenden**.
   - **Erstellen** und den Build-/Startvorgang abwarten (der erste Build dauert einige Minuten).

4. **Aufrufen**
   - Browser: `http://<NAS-IP>:8080`
   - Anmeldung mit dem in `.env` gesetzten Hauptwache-Konto.

---

## Variante B – SSH / Kommandozeile

```bash
# SSH in DSM aktivieren (Systemsteuerung → Terminal & SNMP), dann:
ssh admin@<NAS-IP>
cd /volume1/docker/turmstatus
cp .env.example .env
vi .env            # Secrets/Passwörter setzen
sudo docker compose up -d --build
```

Status prüfen:

```bash
sudo docker compose ps
sudo docker compose logs -f backend
```

---

## Persistenz & Backup

- Die Datenbank liegt im Docker-Named-Volume `turmstatus_db_data` und bleibt bei
  Updates/Neustarts erhalten.
- **Backup** (Beispiel):

  ```bash
  sudo docker exec -t turmstatus-db-1 \
    pg_dump -U turmstatus turmstatus > turmstatus_backup_$(date +%F).sql
  ```

- **Restore**:

  ```bash
  cat turmstatus_backup_*.sql | sudo docker exec -i turmstatus-db-1 \
    psql -U turmstatus -d turmstatus
  ```

---

## Update

```bash
cd /volume1/docker/turmstatus
git pull            # oder neue Dateien hochladen
sudo docker compose up -d --build
```

Im Container Manager alternativ: Projekt → **Aktion** → **Erstellen/Neu aufbauen**.

---

## Reverse Proxy & HTTPS (optional, empfohlen)

Für Zugriff über einen Domainnamen mit TLS:

1. DSM → **Systemsteuerung** → **Anmeldeportal** → **Erweitert** → **Reverse Proxy**.
2. Neuer Eintrag: Quelle `https://turmstatus.example.de:443` → Ziel `http://localhost:8080`.
3. Unter **Eigene WebSocket-Header aktivieren** sicherstellen, dass `Upgrade`/`Connection`
   durchgereicht werden (für die Echtzeit-Karte erforderlich).
4. Zertifikat (Let's Encrypt) in DSM dem Reverse-Proxy-Host zuweisen.

---

## Fehlersuche

| Problem | Prüfen |
|---|---|
| Seite nicht erreichbar | Läuft `frontend`-Container? Port `8080` freigegeben/Firewall? |
| „Zu viele Anfragen“ | Rate-Limit – kurz warten. |
| Karte aktualisiert nicht live | WebSocket über Reverse Proxy durchgereicht? Fallback-Polling greift nach 30 s. |
| Login schlägt fehl | `ADMIN_*` in `.env` korrekt? Logs: `docker compose logs backend`. |
