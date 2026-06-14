# Deployment auf UGREEN NAS (UGOS Pro) mit Portainer

Diese Anleitung beschreibt den empfohlenen Weg, die Turmstatus-App auf einer
**UGREEN NAS** zu betreiben. Sie orientiert sich am Vorgehen des
DLRG-Wachplan-Generators: Die Container-Images werden zentral per GitHub
Actions gebaut und in die **GitHub Container Registry (GHCR)** veröffentlicht –
die NAS **lädt** die fertigen Multi-Arch-Images (amd64 + arm64) nur und **baut
nichts selbst**. Das ist deutlich schneller und schont die NAS.

Secrets liegen **nicht** in Git oder einer Datei, sondern werden als
**Environment-Variablen direkt im Portainer-Stack** gesetzt.

---

## 0. Voraussetzungen

- UGREEN NAS mit **UGOS Pro** und installiertem **Docker** (App Center → Docker).
- **Portainer** als Container betrieben (Community Edition). Falls noch nicht
  vorhanden, einmalig per SSH/Docker installieren:
  ```bash
  docker volume create portainer_data
  docker run -d -p 9443:9443 --name portainer --restart=always \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v portainer_data:/data portainer/portainer-ce:latest
  ```
  Aufruf: `https://<NAS-IP>:9443`
- Die Images müssen einmal gebaut sein (GitHub Actions, siehe Abschnitt 1).

---

## 1. Images bauen lassen (einmalig / bei jedem Update)

Die Images entstehen automatisch über den Workflow `.github/workflows/docker.yml`:

- Bei jedem Push auf `main` (oder manuell via **Actions → Build & Push Docker
  Images → Run workflow**).
- Ergebnis (öffentlich lesbar):
  - `ghcr.io/toupsy/turmstatus-backend:latest`
  - `ghcr.io/toupsy/turmstatus-frontend:latest`

> Falls die GHCR-Pakete privat sind: einmalig in Portainer unter **Registries**
> eine GHCR-Registry mit einem GitHub Personal Access Token (Scope `read:packages`)
> hinterlegen. Bei öffentlichen Paketen ist kein Login nötig.

---

## 2. Stack in Portainer anlegen

1. Portainer öffnen → **Stacks** → **Add stack**.
2. Name: `turmstatus`.
3. **Build method: Repository**
   - Repository URL: `https://github.com/Toupsy/turmstatus-app`
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`

   *(Alternativ **Web editor** und den Inhalt von `docker-compose.yml` einfügen.)*

4. **Environment variables** (Abschnitt unter dem Editor) – die Pflicht-Secrets
   setzen. Werte vorher erzeugen:
   ```bash
   openssl rand -base64 24   # für POSTGRES_PASSWORD und ADMIN_PASSWORD
   openssl rand -hex 32      # für SECRET_KEY
   ```

   | Variable | Pflicht | Beispiel / Standard |
   |---|---|---|
   | `POSTGRES_PASSWORD` | ✅ | `<rand-base64-24>` |
   | `SECRET_KEY` | ✅ | `<rand-hex-32>` |
   | `ADMIN_PASSWORD` | ✅ | `<rand-base64-24>` |
   | `HTTP_PORT` | – | `3456` (Standard) |
   | `ADMIN_USERNAME` | – | `hauptwache` (Standard) |
   | `CORS_ORIGINS` | – | `*` (Standard) |
   | `POSTGRES_USER` / `POSTGRES_DB` | – | `turmstatus` |
   | `IMAGE_TAG` | – | `latest` |

5. **Deploy the stack** klicken und warten, bis alle drei Container `running`
   (und `healthy`) sind:
   - `dlrg-turmstatus-db`
   - `dlrg-turmstatus-backend`
   - `dlrg-turmstatus-frontend`

---

## 3. Zugriff

```
http://<NAS-IP>:3456
```

Erst-Login als Hauptwache: Benutzer `hauptwache`, Passwort = dein
`ADMIN_PASSWORD`. **Direkt nach dem ersten Login das Passwort in der
Benutzerverwaltung ändern.**

---

## 4. Updates einspielen

1. Neue Images bauen lassen (Push auf `main` oder Workflow manuell starten).
2. In Portainer: **Stacks → turmstatus → Pull and redeploy** (bzw. „Update the
   stack“ mit aktivierter Option **Re-pull image**).

Die Datenbank bleibt im Volume `turmstatus-db` erhalten.

---

## 5. Backup & Restore

```bash
# Backup des DB-Volumes
docker run --rm -v turmstatus-db:/data -v $(pwd):/backup alpine \
  tar czf /backup/turmstatus-db.tar.gz -C /data .

# Restore (Stack vorher stoppen)
docker run --rm -v turmstatus-db:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/turmstatus-db.tar.gz"
```

---

## 6. HTTPS / Reverse Proxy (optional)

Die App lauscht intern auf Port 80 des `frontend`-Containers und ist über
`HTTP_PORT` (Standard 3456) nach außen gemappt. Für TLS einen Reverse Proxy
davorschalten (UGREEN-eigener Proxy, Nginx Proxy Manager oder Traefik) und auf
`http://<NAS-IP>:3456` zeigen lassen. Wichtig: **WebSocket-Upgrade**
(`Upgrade`/`Connection`-Header) für `/api/ws` durchreichen, sonst aktualisiert
sich die Einsatzkarte nicht live (es greift dann nur das 30-Sekunden-Polling).

---

## 7. Fehlersuche

| Problem | Prüfen |
|---|---|
| Stack startet nicht, Fehler „POSTGRES_PASSWORD muss gesetzt werden“ | Pflicht-Environment-Variablen im Stack gesetzt? |
| Port belegt (`port is already allocated`) | `HTTP_PORT` auf einen freien Port ändern und Stack neu deployen |
| Backend `unhealthy` | Logs `dlrg-turmstatus-backend`; DB erreichbar/healthy? |
| Seite lädt, aber keine Live-Updates | WebSocket über Reverse Proxy durchgereicht? Fallback-Polling greift nach 30 s |
| Passwortänderung an der DB wirkt nicht | `POSTGRES_PASSWORD` greift nur bei leerem Volume; sonst Volume neu anlegen oder DB-Passwort manuell ändern |
