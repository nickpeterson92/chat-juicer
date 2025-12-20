"""WebSocket utilities for Chat Juicer.

Provides WebSocket management, cancellation tokens, and error utilities.
"""

from __future__ import annotations

from api.websocket.errors import (
    WebSocketErrorHandler,
    WSCloseCode,
    close_with_error,
    send_ws_error,
    websocket_error_handler,
)
from api.websocket.manager import WebSocketManager
from api.websocket.task_manager import CancellationToken

__all__ = [
    # Task cancellation
    "CancellationToken",
    # Error handling
    "WSCloseCode",
    "WebSocketErrorHandler",
    # Connection management
    "WebSocketManager",
    "close_with_error",
    "send_ws_error",
    "websocket_error_handler",
]
