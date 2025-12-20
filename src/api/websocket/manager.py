from __future__ import annotations

import asyncio
import contextlib
import time

from typing import Any

from fastapi import WebSocket

from utils.logger import logger


class WebSocketManager:
    """Manage active WebSocket connections by session with idle timeout and connection limits."""

    def __init__(
        self,
        idle_timeout_seconds: float = 600.0,
        max_connections: int = 100,
        max_connections_per_session: int = 3,
    ) -> None:
        """Initialize the WebSocket manager.

        Args:
            idle_timeout_seconds: Close connections idle longer than this (default 10 min)
            max_connections: Maximum total connections allowed
            max_connections_per_session: Maximum connections per session
        """
        self.connections: dict[str, set[WebSocket]] = {}
        self.last_activity: dict[WebSocket, float] = {}
        self.idle_timeout = idle_timeout_seconds
        self.max_connections = max_connections
        self.max_connections_per_session = max_connections_per_session
        self._lock = asyncio.Lock()
        self._idle_checker_task: asyncio.Task[None] | None = None
        self._shutting_down = False

    async def connect(self, websocket: WebSocket, session_id: str) -> bool:
        """Register a WebSocket connection.

        Returns:
            True if connection was accepted, False if rejected due to limits
        """
        async with self._lock:
            # Check if shutting down
            if self._shutting_down:
                logger.warning(f"Rejecting connection during shutdown for session {session_id}")
                return False

            # Check total connection limit
            current_count = sum(len(ws_set) for ws_set in self.connections.values())
            if current_count >= self.max_connections:
                logger.warning(f"Rejecting connection: max connections ({self.max_connections}) reached")
                return False

            # Check per-session limit
            session_connections = len(self.connections.get(session_id, set()))
            if session_connections >= self.max_connections_per_session:
                logger.warning(
                    f"Rejecting connection: session {session_id} at limit " f"({self.max_connections_per_session})"
                )
                return False

            await websocket.accept()

            if session_id not in self.connections:
                self.connections[session_id] = set()
            self.connections[session_id].add(websocket)
            self.last_activity[websocket] = time.monotonic()

            logger.info(
                f"WebSocket connected for session {session_id} "
                f"(total: {self.connection_count}, session: {session_connections + 1})"
            )
            return True

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

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast message to all connected clients."""
        for session_id in list(self.connections.keys()):
            await self.send(session_id, message)

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

    async def graceful_shutdown(self, timeout: float = 10.0) -> None:
        """Gracefully shutdown all WebSocket connections.

        Args:
            timeout: Maximum time to wait for connections to close
        """
        self._shutting_down = True
        logger.info(f"Initiating graceful WebSocket shutdown (timeout: {timeout}s)")

        # Stop accepting new connections and idle checker
        await self.stop_idle_checker()

        # Notify all clients of shutdown
        await self.broadcast({"type": "server_shutdown", "message": "Server is shutting down"})

        # Give clients a moment to receive the message
        await asyncio.sleep(0.5)

        # Close all connections
        all_connections: list[tuple[WebSocket, str]] = []
        async with self._lock:
            for session_id, websockets in list(self.connections.items()):
                for ws in list(websockets):
                    all_connections.append((ws, session_id))  # noqa: PERF401

        # Close connections concurrently with timeout
        async def close_connection(ws: WebSocket, session_id: str) -> None:
            with contextlib.suppress(Exception):
                await ws.close(code=1001, reason="Server shutdown")
            await self.disconnect(ws, session_id)

        if all_connections:
            close_tasks = [close_connection(ws, sid) for ws, sid in all_connections]
            try:
                await asyncio.wait_for(asyncio.gather(*close_tasks), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning(f"Timeout closing {len(all_connections)} WebSocket connections")

        logger.info(f"WebSocket shutdown complete (closed {len(all_connections)} connections)")

    @property
    def connection_count(self) -> int:
        """Total number of active connections."""
        return sum(len(ws_set) for ws_set in self.connections.values())

    @property
    def session_count(self) -> int:
        """Number of sessions with active connections."""
        return len(self.connections)

    def get_stats(self) -> dict[str, Any]:
        """Get connection statistics."""
        return {
            "total_connections": self.connection_count,
            "total_sessions": self.session_count,
            "max_connections": self.max_connections,
            "max_per_session": self.max_connections_per_session,
            "idle_timeout": self.idle_timeout,
            "shutting_down": self._shutting_down,
        }
