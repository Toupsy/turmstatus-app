// ============================================================
// realtime.ts – WebSocket-Hub. broadcast(type) an ALLE Clients (gemeinsames Lagebild).
// Ein Hub wird von Public- und Admin-App geteilt, damit jede Mutation überall live wird.
// ============================================================

import type { WebSocket } from '@fastify/websocket';
import type { WsEventType } from '@turmstatus/shared';

export class Realtime {
  private clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
    this.send(socket, 'connected');
  }

  private send(socket: WebSocket, type: WsEventType): void {
    try {
      socket.send(JSON.stringify({ type, ts: Date.now() }));
    } catch {
      this.clients.delete(socket);
    }
  }

  broadcast(type: WsEventType): void {
    const payload = JSON.stringify({ type, ts: Date.now() });
    for (const socket of this.clients) {
      try {
        socket.send(payload);
      } catch {
        this.clients.delete(socket);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export function createRealtime(): Realtime {
  return new Realtime();
}
