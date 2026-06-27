/**
 * Turmstatus Cloudflare Worker
 *
 * Handles:
 * 1. Static file serving from public/ directory (Cloudflare Assets)
 * 2. API/WebSocket proxy to origin server (for /api/*)
 * 3. HTML fallback for the single-page app
 *
 * Preview deployments (workers.dev / *preview*) have NO backend: the worker
 * returns 503 for API calls and injects window.WORKER_ENVIRONMENT='preview'.
 * The frontend then runs entirely client-side against an in-memory demo
 * dataset (public/js/preview.js) – kein Login nötig.
 *
 * Schwester-Projekt: deckungsgleich zum Wachplan-Generator (src/worker.js).
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Determine origin server based on environment
    const originServer = getOriginServer(url, env);

    // API requests: proxy to origin server
    if (pathname.startsWith('/api/')) {
      if (!originServer) {
        // Preview environment with no backend: 503 (frontend falls back to demo mode)
        return new Response(JSON.stringify({
          error: 'API not available in preview mode',
          message: 'This is a preview deployment. The backend API is not available. The app runs against an in-memory demo dataset instead.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
        });
      }
      return proxyToOrigin(request, url, originServer);
    }

    // Static assets: serve from Cloudflare Assets (/js/*, /css/*, images, …)
    if (shouldServeAsset(pathname)) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 200) {
        return assetResponse;
      }
    }

    // HTML files and SPA fallback: serve Turmstatus.html for root and unknown paths
    if (
      pathname === '/' ||
      pathname === '/Turmstatus.html' ||
      !pathname.includes('.')
    ) {
      const indexResponse = await env.ASSETS.fetch(
        new Request(new URL('/Turmstatus.html', request.url))
      );
      if (indexResponse.status === 200) {
        const html = await indexResponse.text();

        // Detect preview URLs (workers.dev subdomain, 'preview' or 'pr-' in host)
        const hostname = url.hostname;
        let environment = env.ENVIRONMENT || 'production';
        if (hostname.includes('preview') || hostname.includes('pr-') || hostname.endsWith('.workers.dev') || /^[a-f0-9]{8}-/.test(hostname)) {
          environment = 'preview';
        }

        const environmentScript = `<script>window.WORKER_ENVIRONMENT = '${environment}';</script>`;
        const modifiedHtml = html.replace('</head>', `${environmentScript}</head>`);

        return new Response(modifiedHtml, {
          status: indexResponse.status,
          headers: new Headers(indexResponse.headers),
          statusText: indexResponse.statusText,
        });
      }
    }

    // 404 fallback
    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Determine if a path should be served as a static asset
 */
function shouldServeAsset(pathname) {
  const assetExtensions = [
    '.html', '.css', '.js', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
  ];
  return assetExtensions.some(ext => pathname.endsWith(ext));
}

/**
 * Determine origin server URL based on environment.
 * Returns null for preview environment (no backend → demo mode).
 */
function getOriginServer(url, env) {
  const hostname = url.hostname;
  const environment = env.ENVIRONMENT || 'production';

  // Preview environment: no backend (uses client-side demo dataset)
  if (environment === 'preview' || hostname.includes('preview') || hostname.includes('pr-') || hostname.endsWith('.workers.dev')) {
    return null;
  }

  // Development: localhost backend
  if (environment === 'development') {
    return env.DEV_ORIGIN_SERVER || 'http://localhost:3002';
  }

  // Production: use configured origin server
  return env.ORIGIN_SERVER || 'https://turmstatus.de';
}

/**
 * Proxy request to origin server
 */
function proxyToOrigin(request, url, originServer) {
  const originUrl = new URL(url.pathname + url.search, originServer);

  return fetch(new Request(originUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' ? request.body : undefined,
  }));
}
