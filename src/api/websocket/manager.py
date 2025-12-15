from __future__ import annotations

import asyncio
import contextlib
import time

from typing import Any

from fastapi import WebSocket

from utils.logger import logger


class WebSocketManager:
    """Manage active WebSocket connections by session with idle timeout support."""

    def __init__(self, idle_timeout_seconds: float = 600.0) -> None:
        """Initialize the WebSocket manager.

        Args:
            idle_timeout_seconds: Close connections idle longer than this (default 10 min)
        """
        self.connections: dict[str, set[WebSocket]] = {}
        self.last_activity: dict[WebSocket, float] = {}
        self.idle_timeout = idle_timeout_seconds
        self._lock = asyncio.Lock()
        self._idle_checker_task: asyncio.Task[None] | None = None

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Register a WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            if session_id not in self.connections:
                self.connections[session_id] = set()
            self.connections[session_id].add(websocket)
            self.last_activity[websocket] = time.monotonic()

    async def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            if session_id in self.connections:
                self.connections[session_id].discard(websocket)
                if not self.connections[session_id]:
                    del self.connections[session_id]
            self.last_activity.pop(websocket, None)

    async def touch(self, websocket: WebSocket) -> None:
        """Update last activity time for a connection."""
        async with self._lock:
            if websocket in self.last_activity:
                self.last_activity[websocket] = time.monotonic()

    async def send(self, session_id: str, message: dict[str, Any]) -> None:
        """Send JSON message to all connections for a session."""
        websockets = self.connections.get(session_id, set())
        for ws in list(websockets):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: PERF203
                await self.disconnect(ws, session_id)

    async def start_idle_checker(self) -> None:
        """Start background task to close idle connections."""
        if self._idle_checker_task is None:
            self._idle_checker_task = asyncio.create_task(self._check_idle_connections())
            logger.info(f"WebSocket idle checker started (timeout: {self.idle_timeout}s)")

    async def stop_idle_checker(self) -> None:
        """Stop the idle checker background task."""
        if self._idle_checker_task:
            self._idle_checker_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._idle_checker_task
            self._idle_checker_task = None
            logger.info("WebSocket idle checker stopped")

    async def _check_idle_connections(self) -> None:
        """Periodically check and close idle connections."""
        check_interval = min(60.0, self.idle_timeout / 2)  # Check at least every minute
        while True:
            await asyncio.sleep(check_interval)
            await self._close_idle_connections()

    async def _close_idle_connections(self) -> None:
        """Close connections that have been idle too long."""
        now = time.monotonic()
        to_close: list[tuple[WebSocket, str]] = []

        async with self._lock:
            for session_id, websockets in list(self.connections.items()):
                for ws in list(websockets):
                    last = self.last_activity.get(ws, now)
                    if now - last > self.idle_timeout:
                        to_close.append((ws, session_id))

        # Close outside the lock to avoid deadlock
        for ws, session_id in to_close:
            logger.info(f"Closing idle WebSocket for session {session_id}")
            with contextlib.suppress(Exception):
                await ws.close(code=4000, reason="Idle timeout")
            await self.disconnect(ws, session_id)

    @property
    def connection_count(self) -> int:
        """Total number of active connections."""
        return sum(len(ws_set) for ws_set in self.connections.values())

    @property
    def session_count(self) -> int:
        """Number of sessions with active connections."""
        return len(self.connections)
