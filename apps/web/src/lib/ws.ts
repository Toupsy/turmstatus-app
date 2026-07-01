import type { WsEventType } from '@turmstatus/shared';
import { refreshTowers, refreshGuards, refreshBoats, refreshRequests, refreshSummary, refreshAll } from './stores.js';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopped = false;

function handle(type: WsEventType): void {
  switch (type) {
    case 'towers-updated':
      void refreshTowers();
      void refreshSummary();
      break;
    case 'guards-updated':
      void refreshGuards();
      void refreshTowers();
      void refreshSummary();
      break;
    case 'boats-updated':
      void refreshBoats();
      void refreshTowers();
      void refreshSummary();
      break;
    case 'requests-updated':
      void refreshRequests();
      void refreshSummary();
      break;
    case 'users-updated':
      void refreshAll();
      break;
    default:
      break;
  }
}

function connect(): void {
  if (stopped) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${proto}://${location.host}/api/ws`);

  socket.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data as string) as { type: WsEventType };
      handle(data.type);
    } catch {
      /* ignore */
    }
  });
  socket.addEventListener('close', () => {
    if (stopped) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  });
  socket.addEventListener('error', () => socket?.close());
}

export function startRealtime(): void {
  stopped = false;
  connect();
  // 30-Sekunden-Polling-Fallback (falls WS blockiert ist).
  if (!pollTimer) pollTimer = setInterval(() => void refreshAll(), 30000);
}

export function stopRealtime(): void {
  stopped = true;
  socket?.close();
  socket = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
