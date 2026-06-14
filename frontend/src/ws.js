import { useStore } from "./store";

let socket = null;
let reconnectTimer = null;
let pollTimer = null;

// WebSocket mit Auto-Reconnect. Zusätzlich 30s-Polling als Fallback,
// damit das Lagebild auch bei WS-Ausfall aktuell bleibt (Robustheit im Einsatz).
export function connectWs() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/api/ws?token=${encodeURIComponent(token)}`;

  try {
    socket = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onmessage = (msg) => {
    try {
      const { event } = JSON.parse(msg.data);
      useStore.getState().handleEvent(event);
    } catch {
      /* ignorieren */
    }
  };
  socket.onclose = scheduleReconnect;
  socket.onerror = () => socket && socket.close();

  // Polling-Fallback aktivieren.
  if (!pollTimer) {
    pollTimer = setInterval(() => useStore.getState().refreshAll(), 30000);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, 3000);
}

export function disconnectWs() {
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
