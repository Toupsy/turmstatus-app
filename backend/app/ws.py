import asyncio
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Verwaltet aktive WebSocket-Verbindungen und broadcastet Lageänderungen."""

    def __init__(self) -> None:
        self.active: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.active.append(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            if ws in self.active:
                self.active.remove(ws)

    async def broadcast(self, event: str, payload: dict[str, Any] | None = None) -> None:
        message = {"event": event, "payload": payload or {}}
        async with self._lock:
            targets = list(self.active)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self.active:
                        self.active.remove(ws)


manager = ConnectionManager()


def notify(event: str, payload: dict[str, Any] | None = None) -> None:
    """Synchroner Helfer: plant einen Broadcast im laufenden Event-Loop ein.

    Wird aus synchronen Routen-Handlern nach erfolgreichem Commit aufgerufen.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(event, payload))
    except RuntimeError:
        # Kein laufender Loop (z. B. in Tests) – Broadcast verwerfen.
        pass
