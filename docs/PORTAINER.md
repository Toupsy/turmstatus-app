# Deployment mit Portainer (UGREEN / Synology NAS)

Empfohlener Weg, Turmstatus auf einer NAS zu betreiben. Vorgehen identisch zum
DLRG-Wachplan-Generator: Das Container-Image wird per GitHub Actions gebaut und in die
**GitHub Container Registry (GHCR)** veröffentlicht – die NAS **lädt** das fertige
Multi-Arch-Image (amd64 + arm64) und **baut nichts selbst**.

Secrets liegen **nicht** in Git, sondern als **Environment-Variablen im Portainer-Stack**.

---

## 1. Image bauen lassen (einmalig / bei jedem Update)
Workflow `.github/workflows/docker.yml`:
- Bei jedem Push auf `main` (oder manuell via **Actions → Build & Push Docker Image → Run workflow**).
- Ergebnis: `ghcr.io/toupsy/turmstatus-app:latest`.

> Falls das GHCR-Paket privat ist: in Portainer unter **Registries** eine GHCR-Registry mit
> GitHub-PAT (Scope `read:packages`) hinterlegen. Bei öffentlichem Paket nicht nötig.

## 2. Stack in Portainer anlegen
1. **Stacks → Add stack**, Name `turmstatus`.
2. **Build method: Repository** – URL `https://github.com/Toupsy/turmstatus-app`,
   Reference `refs/heads/main`, Compose path `docker-compose.yml`.
   *(Alternativ Web editor + Inhalt von `docker-compose.yml` einfügen.)*
3. **Environment variables** (Secrets vorher erzeugen):
   ```bash
   openssl rand -base64 32   # MASTER_SECRET, SESSION_SECRET
   openssl rand -base64 16   # SALT
   ```
   | Variable | Pflicht | Beispiel / Standard |
   |---|---|---|
   | `MASTER_SECRET` | ✅ | `<rand-base64-32>` (min. 32 Zeichen) |
   | `SALT` | ✅ | `<rand-base64-16>` (min. 16 Zeichen) |
   | `SESSION_SECRET` | ✅ | `<rand-base64-32>` (min. 16 Zeichen) |
   | `ADMIN_USERNAME` | – | `hauptwache` |
   | `ADMIN_PASSWORD` | ✅* | starkes Passwort (*für Erst-Admin) |
   | `HTTP_PORT` | – | `3002` |
   | `ADMIN_HTTP_PORT` | – | `3003` |
   | `COOKIE_SECURE` | – | `true` (hinter HTTPS-Proxy) |
   | `IMAGE_TAG` | – | `latest` |
4. **Deploy the stack** → warten bis `dlrg-turmstatus` und `dlrg-turmstatus-admin` `healthy` sind.

## 3. Zugriff
- App: `http://<NAS-IP>:3002` – Login `hauptwache` / `ADMIN_PASSWORD` (danach Passwort ändern).
- Admin-Panel: `http://<NAS-IP>:3003`.

## 4. Updates
Neues Image bauen lassen → **Stacks → turmstatus → Pull and redeploy** (Re-pull image aktiviert).
Die Daten bleiben im Volume `turmstatus-data`.

## 5. Backup & Restore
```bash
# Backup
docker run --rm -v turmstatus-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/turmstatus-data.tar.gz -C /data .
# Restore (Stack vorher stoppen)
docker run --rm -v turmstatus-data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/turmstatus-data.tar.gz"
```

## 6. HTTPS / Reverse Proxy
Reverse Proxy (Nginx Proxy Manager, Traefik, NAS-Proxy) auf `http://<NAS-IP>:3002` zeigen lassen
und **WebSocket-Upgrade** (`Upgrade`/`Connection`-Header) für `/api/ws` durchreichen – sonst greift
nur das 30-s-Polling. Bei TLS `COOKIE_SECURE=true` setzen.
