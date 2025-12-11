from __future__ import annotations

import asyncio

from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    """Manage active WebSocket connections by session."""

    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Register a WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            if session_id not in self.connections:
                self.connections[session_id] = set()
            self.connections[session_id].add(websocket)

    async def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            if session_id in self.connections:
                self.connections[session_id].discard(websocket)
                if not self.connections[session_id]:
                    del self.connections[session_id]

    async def send(self, session_id: str, message: dict[str, Any]) -> None:
        """Send JSON message to all connections for a session."""
        websockets = self.connections.get(session_id, set())
        for ws in list(websockets):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: PERF203
                await self.disconnect(ws, session_id)


ws_manager = WebSocketManager()
