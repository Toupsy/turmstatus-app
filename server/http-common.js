const net = require('node:net');

// Komprimiert eine IPv6-Adresse in ihre Kurzform (RFC 5952): führende Nullen weg,
// längster Null-Block als "::". IPv4 und ungültige Eingaben bleiben unverändert.
function compressIpv6(ip) {
  if (!ip || net.isIPv6(ip) !== true) return ip;
  try {
    const host = new URL(`http://[${ip}]`).hostname; // → "[2001:db8::1]"
    return host.startsWith('[') ? host.slice(1, -1) : host;
  } catch {
    return ip;
  }
}

function securityHeaders({ admin = false } = {}) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (admin) {
      // Admin-CSP: nur 'self' (+ 'unsafe-inline' für das self-contained admin.html),
      // KEINE externen Hosts (unpkg/OSM braucht nur der Haupt-Server für die Karte).
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; " +
        "connect-src 'self'; frame-ancestors 'self'");
    } else {
      // Haupt-App: Leaflet/OSM über unpkg.com + OpenStreetMap-Tiles.
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "script-src 'self' 'unsafe-inline' https://unpkg.com; " +
        "connect-src 'self' ws: wss:; frame-ancestors 'self'");
    }

    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

// Wert für `app.set('trust proxy', …)` aus der Umgebung (TRUST_PROXY).
// Default 1 = ein vertrauenswürdiger Proxy-Hop (z. B. NGINX). Hinter mehreren
// Hops (z. B. Cloudflare → NGINX) auf die Hop-Anzahl erhöhen.
// Akzeptiert eine Zahl ("2") oder einen booleschen Wert ("true"/"false").
function trustProxyValue() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return 1;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

// Ermittelt die echte Client-IP aus den Proxy-Headern – OHNE Reverse-Proxy-Umbau.
// Reihenfolge: Cloudflare (CF-Connecting-IP) → X-Real-IP → erstes X-Forwarded-For.
// Gibt '' zurück, wenn keiner gesetzt ist (dann gilt weiter Express' req.ip).
// ACHTUNG: Diese Header sind fälschbar, falls der Origin direkt erreichbar ist.
// Fälschungssicher ist die NGINX-Konfiguration in docs/nginx.cloudflare.conf.example.
function clientIpFromHeaders(req) {
  const pick = (v) => {
    if (!v) return '';
    // X-Forwarded-For kann eine Liste sein – die linkeste Adresse ist der Client.
    const first = String(v).split(',')[0].trim().replace(/^::ffff:/i, '');
    return compressIpv6(first);
  };
  return pick(req.headers['cf-connecting-ip'])
      || pick(req.headers['x-real-ip'])
      || pick(req.headers['x-forwarded-for'])
      || '';
}

// Middleware: überschreibt `req.ip` mit der aus den Proxy-Headern ermittelten
// echten Client-IP. Dadurch sehen Audit-Log und Rate-Limiting die echte IP, ohne
// dass NGINX/Cloudflare zwingend angepasst werden müssen.
function overrideClientIp() {
  return (req, res, next) => {
    const ip = clientIpFromHeaders(req);
    if (ip) {
      try {
        Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
      } catch { /* req.ip nicht überschreibbar → Express-Wert behalten */ }
    }
    next();
  };
}

function notFoundHandler(service) {
  return (req, res) => {
    if (res.headersSent) return;
    const body = { error: 'Not found', path: req.url };
    if (service) body.service = service;
    res.status(404).json(body);
  };
}

function jsonErrorHandler() {
  return (err, req, res, next) => {
    console.error('Error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error' });
  };
}

function installSigtermHandler(server, label) {
  process.on('SIGTERM', () => {
    console.log('SIGTERM empfangen, fahre herunter...');
    server.close(() => {
      console.log(`${label} wurde beendet`);
      process.exit(0);
    });
  });
}

function installFatalHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    if (err.message && err.message.includes('database')) process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
    if (reason && reason.message && reason.message.includes('database')) process.exit(1);
  });
}

module.exports = {
  securityHeaders,
  trustProxyValue,
  compressIpv6,
  clientIpFromHeaders,
  overrideClientIp,
  notFoundHandler,
  jsonErrorHandler,
  installSigtermHandler,
  installFatalHandlers,
};
