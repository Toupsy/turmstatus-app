# Test-PR: PR-Preview-Deployment

Diese Datei ist bewusst ein **Wegwerf-Artefakt**, um zu demonstrieren, dass jeder Pull
Request automatisch eine eigene Cloudflare-Preview bekommt.

Erwartetes Verhalten für diesen PR:

1. Der Workflow `deploy-preview.yml` baut beide SPAs und deployt sie als Demo auf den Worker
   `turmstatus-preview-pr-<Nr>`.
2. Ein Bot kommentiert die Preview-URL (`https://turmstatus-preview-pr-<Nr>.<subdomain>.workers.dev`)
   in diesem PR.
3. Über die URL ist die Demo klickbar (Rollen-Umschalter oben rechts, Admin-Panel unter `/admin/`).

> Dieser PR kann nach dem Test einfach **geschlossen** werden – die Änderung muss **nicht**
> gemergt werden. Cloudflare räumt Preview-Worker geschlossener PRs selbst wieder auf bzw. sie
> können in der Cloudflare-Oberfläche gelöscht werden.
