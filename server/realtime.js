// ============================================================
// realtime.js – Live-Lagebild via WebSocket (/api/ws)
//
// Turmstatus zeigt EIN gemeinsames Lagebild → jede Mutation (Turm/Boot/
// Wachgänger/-1-Anfrage) wird an ALLE authentifizierten Clients gebroadcastet.
// Clients laden die betroffenen Daten neu (zusätzlich 30-s-Polling-Fallback).
// Auth über die bestehende Express-Session (analog Wachplan-Generator).
// ============================================================

const { WebSocketServer } = require('ws');

const clients = new Set(); // alle verbundenen, authentifizierten Sockets

/** Lageänderung an alle verbundenen Clients senden. */
function broadcast(type, payload = {}) {
  const msg = JSON.stringify({ type, ...payload, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg); } catch (e) { /* ignore */ }
    }
  }
}

function setupRealtime(server, sessionMiddleware) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (!path.endsWith('/ws')) { socket.destroy(); return; }

    // Session aus dem Cookie laden (Dummy-Res: nur lesen, nichts speichern)
    const dummyRes = { getHeader() {}, setHeader() {}, on() {}, once() {}, emit() {}, end() {}, writeHead() {} };
    try {
      sessionMiddleware(req, dummyRes, () => {
        if (!req.session || !req.session.userId) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.userId = req.session.userId;
          wss.emit('connection', ws, req);
        });
      });
    } catch (e) { socket.destroy(); }
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    // Eingehende Nachrichten (z. B. Ping) werden ignoriert – Server pusht nur.
    ws.on('message', () => {});
  });

  console.log('✓ Realtime (WebSocket /api/ws) aktiv');
  return wss;
}

module.exports = { setupRealtime, broadcast };
