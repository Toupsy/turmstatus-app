// ============================================================
// ws.js – Live-Lagebild-Client (WebSocket /api/ws) + Polling-Fallback
// Analog Wachplan-Generator: Auto-Reconnect; zusätzlich 30-s-Polling als
// degradierter Betrieb bei WS-Ausfall.
// ============================================================

let _ws = null;
let _wsReconnectTimer = null;
let _pollTimer = null;

// Mapping: Broadcast-Typ → Refresh-Funktion(en)
function _handleEvent(type) {
  switch (type) {
    case 'towers-updated': refreshTowers(); refreshDashboard(); break;
    case 'guards-updated': refreshGuards(); refreshTowers(); refreshDashboard(); break;
    case 'boats-updated': refreshBoats(); refreshDashboard(); break;
    case 'requests-updated': refreshRequests(); refreshGuards(); refreshDashboard(); break;
    case 'control-trips-updated': refreshControlTrips(); break;
    case 'users-updated': if (canManage() || canManageTeam()) refreshAdmin(); break;
    default: break;
  }
}

function wsConnect() {
  // Preview-/Demo-Modus: kein Backend → kein WebSocket (Mutationen lösen
  // _handleEvent() direkt in preview.js aus).
  if (typeof PREVIEW_MODE !== 'undefined' && PREVIEW_MODE) return;
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try { _ws = new WebSocket(`${proto}//${location.host}/api/ws`); }
  catch (e) { _scheduleReconnect(); return; }

  _ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type && msg.type !== 'connected') _handleEvent(msg.type);
  };
  _ws.onclose = () => { _ws = null; _scheduleReconnect(); };
  _ws.onerror = () => { try { _ws.close(); } catch (e) {} };
}

function _scheduleReconnect() {
  if (_wsReconnectTimer) return;
  _wsReconnectTimer = setTimeout(() => { _wsReconnectTimer = null; wsConnect(); }, 3000);
}

// 30-s-Polling-Fallback (läuft immer; günstig genug und deckt WS-Ausfälle ab)
function startPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => {
    if (!currentUser) return;
    refreshAll().catch(e => console.error('Poll error:', e));
  }, 30000);
}
