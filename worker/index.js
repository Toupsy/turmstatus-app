/**
 * Turmstatus Cloudflare Worker (PR-Preview/Demo).
 *
 * Liefert die gebauten SPAs als statische Assets aus `dist-preview/`:
 *   /        → apps/web  (öffentliche Operativ-App)
 *   /admin/  → apps/admin (interne Admin-SPA, in der Demo mit ausgeliefert)
 *
 * Es gibt KEIN Backend: Die SPAs erkennen die *.workers.dev-Domain und
 * schalten in den Demo-Modus (clientseitig simulierte API, localStorage).
 * /api/* liefert hier nur ein defensives 503, falls doch etwas durchrutscht.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/') || pathname === '/health') {
      return new Response(
        JSON.stringify({
          error: 'API not available in preview mode',
          message: 'Dies ist ein Demo-Deployment ohne Backend. Die SPA simuliert die API im Browser.'
        }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } }
      );
    }

    // Statisches Asset versuchen (Vite-Bundles, index.html, Icons, ...).
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    // SPA-Fallback: /admin/* → Admin-index, alles andere → Web-index.
    const indexPath = pathname === '/admin' || pathname.startsWith('/admin/') ? '/admin/index.html' : '/index.html';
    return env.ASSETS.fetch(new Request(new URL(indexPath, request.url), request));
  }
};
