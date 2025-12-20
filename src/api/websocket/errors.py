"""
WebSocket error handling utilities for Chat Juicer.

Provides consistent error formatting and handling for WebSocket connections,
with support for error recovery hints and session-aware context.
"""

from __future__ import annotations

import contextlib
import traceback

from collections.abc import AsyncIterator, Callable
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from api.middleware.request_context import (
    create_websocket_context,
    get_request_id,
)
from core.constants import get_settings
from models.error_models import ErrorCode, WebSocketError
from utils.logger import logger


# WebSocket close codes (RFC 6455 + application-specific)
class WSCloseCode:
    """WebSocket close codes for error scenarios."""

    # Standard codes
    NORMAL = 1000
    GOING_AWAY = 1001
    PROTOCOL_ERROR = 1002
    UNSUPPORTED_DATA = 1003
    INVALID_PAYLOAD = 1007
    POLICY_VIOLATION = 1008
    MESSAGE_TOO_BIG = 1009
    INTERNAL_ERROR = 1011
    SERVICE_RESTART = 1012
    TRY_AGAIN_LATER = 1013

    # Application-specific codes (4000-4999)
    AUTH_REQUIRED = 4401
    AUTH_INVALID = 4403
    SESSION_NOT_FOUND = 4404
    RATE_LIMITED = 4429
    SERVER_ERROR = 4500
    SERVICE_UNAVAILABLE = 4503
    TIMEOUT = 4504


# Map error codes to WebSocket close codes
ERROR_CODE_TO_WS_CLOSE: dict[ErrorCode, int] = {
    ErrorCode.AUTH_REQUIRED: WSCloseCode.AUTH_REQUIRED,
    ErrorCode.AUTH_INVALID_TOKEN: WSCloseCode.AUTH_INVALID,
    ErrorCode.AUTH_EXPIRED_TOKEN: WSCloseCode.AUTH_INVALID,
    ErrorCode.SESSION_NOT_FOUND: WSCloseCode.SESSION_NOT_FOUND,
    ErrorCode.EXTERNAL_RATE_LIMITED: WSCloseCode.RATE_LIMITED,
    ErrorCode.EXTERNAL_TIMEOUT: WSCloseCode.TIMEOUT,
    ErrorCode.EXTERNAL_SERVICE_ERROR: WSCloseCode.SERVICE_UNAVAILABLE,
    ErrorCode.INTERNAL_ERROR: WSCloseCode.SERVER_ERROR,
    ErrorCode.WS_TIMEOUT: WSCloseCode.TIMEOUT,
}


async def send_ws_error(
    websocket: WebSocket,
    code: ErrorCode,
    message: str,
    session_id: str | None = None,
    recoverable: bool = True,
    details: dict[str, Any] | None = None,
) -> None:
    """Send a standardized error message over WebSocket.

    Args:
        websocket: Active WebSocket connection
        code: Application error code
        message: Human-readable error message
        session_id: Associated session ID (if any)
        recoverable: Whether the client should attempt to recover
        details: Additional error context
    """
    error = WebSocketError(
        code=code,
        message=message,
        request_id=get_request_id(),
        session_id=session_id,
        recoverable=recoverable,
        details=details,
    )

    try:
        await websocket.send_json(error.to_dict())
    except Exception as e:
        # Connection may already be closed
        logger.warning(f"Failed to send WebSocket error: {e}")


async def close_with_error(
    websocket: WebSocket,
    code: ErrorCode,
    message: str,
    session_id: str | None = None,
) -> None:
    """Send error message and close WebSocket connection.

    Args:
        websocket: Active WebSocket connection
        code: Application error code
        message: Human-readable error message
        session_id: Associated session ID (if any)
    """
    # Send error message first
    await send_ws_error(
        websocket,
        code=code,
        message=message,
        session_id=session_id,
        recoverable=False,
    )

    # Then close with appropriate code
    ws_close_code = ERROR_CODE_TO_WS_CLOSE.get(code, WSCloseCode.SERVER_ERROR)
    with contextlib.suppress(Exception):
        await websocket.close(code=ws_close_code, reason=message.encode("utf-8")[:123].decode("utf-8", errors="ignore"))


@contextlib.asynccontextmanager
async def websocket_error_handler(
    websocket: WebSocket,
    session_id: str | None = None,
    on_error: Callable[[Exception], None] | None = None,
) -> AsyncIterator[None]:
    """Context manager for WebSocket error handling.

    Provides consistent error handling, logging, and cleanup for
    WebSocket message processing.

    Usage:
        async with websocket_error_handler(websocket, session_id) as ctx:
            # Process WebSocket messages
            data = await websocket.receive_json()
            ...

    Args:
        websocket: Active WebSocket connection
        session_id: Associated session ID
        on_error: Optional callback for custom error handling
    """
    # Initialize WebSocket context for request tracking
    client_ip = websocket.client.host if websocket.client else None
    ctx = create_websocket_context(session_id=session_id, client_ip=client_ip)

    settings = get_settings()

    try:
        yield
    except WebSocketDisconnect as e:
        # Normal disconnection - not an error
        logger.debug(f"WebSocket disconnected: code={e.code}, session={session_id}")
        raise
    except TimeoutError as e:
        logger.warning(f"WebSocket timeout: session={session_id}, error={e}")
        await send_ws_error(
            websocket,
            code=ErrorCode.WS_TIMEOUT,
            message="Connection timeout",
            session_id=session_id,
            recoverable=True,
        )
        if on_error:
            on_error(e)
        raise
    except Exception as e:
        # Log with full context
        log_context = ctx.to_log_context()
        log_context["error_type"] = type(e).__name__

        if settings.debug:
            log_context["traceback"] = traceback.format_exc()

        logger.error(f"WebSocket error: {e}", **log_context)

        # Determine error code based on exception type
        error_code = _exception_to_error_code(e)

        # Send error to client
        await send_ws_error(
            websocket,
            code=error_code,
            message=str(e) if settings.debug else "An error occurred",
            session_id=session_id,
            recoverable=_is_recoverable(error_code),
            details={"error_type": type(e).__name__} if settings.debug else None,
        )

        if on_error:
            on_error(e)

        raise


def _exception_to_error_code(exc: Exception) -> ErrorCode:
    """Map exception types to error codes."""
    import asyncpg

    from openai import (
        APIError as OpenAIAPIError,
        AuthenticationError as OpenAIAuthError,
        RateLimitError as OpenAIRateLimitError,
    )

    # Map exception types to error codes using iteration
    type_mapping: list[tuple[type, ErrorCode]] = [
        (OpenAIAuthError, ErrorCode.AUTH_INVALID_TOKEN),
        (OpenAIRateLimitError, ErrorCode.EXTERNAL_RATE_LIMITED),
        (OpenAIAPIError, ErrorCode.OPENAI_ERROR),
        (asyncpg.PostgresError, ErrorCode.DATABASE_ERROR),
        (TimeoutError, ErrorCode.WS_TIMEOUT),
        (ValueError, ErrorCode.VALIDATION_ERROR),
    ]

    for exc_type, code in type_mapping:
        if isinstance(exc, exc_type):
            return code
    return ErrorCode.INTERNAL_ERROR


def _is_recoverable(code: ErrorCode) -> bool:
    """Determine if an error is recoverable (client should retry)."""
    non_recoverable = {
        ErrorCode.AUTH_REQUIRED,
        ErrorCode.AUTH_INVALID_TOKEN,
        ErrorCode.AUTH_EXPIRED_TOKEN,
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        ErrorCode.SESSION_NOT_FOUND,
        ErrorCode.INTERNAL_ERROR,
    }
    return code not in non_recoverable


class WebSocketErrorHandler:
    """Class-based error handler for more complex WebSocket scenarios.

    Provides state management for error tracking and rate limiting.
    """

    def __init__(
        self,
        websocket: WebSocket,
        session_id: str | None = None,
        max_errors: int = 5,
        error_window_seconds: float = 60.0,
    ):
        self.websocket = websocket
        self.session_id = session_id
        self.max_errors = max_errors
        self.error_window_seconds = error_window_seconds
        self._error_count = 0
        self._first_error_time: float | None = None

    async def handle_error(
        self,
        error: Exception,
        recoverable: bool | None = None,
    ) -> bool:
        """Handle an error and determine if connection should continue.

        Args:
            error: The exception that occurred
            recoverable: Override automatic recovery determination

        Returns:
            True if connection should continue, False if should close
        """
        import time

        error_code = _exception_to_error_code(error)

        # Track error rate
        now = time.monotonic()
        if self._first_error_time is None:
            self._first_error_time = now
        elif now - self._first_error_time > self.error_window_seconds:
            # Reset window
            self._first_error_time = now
            self._error_count = 0

        self._error_count += 1

        # Determine if recoverable
        if recoverable is None:
            recoverable = _is_recoverable(error_code)

        # Too many errors - force close
        if self._error_count >= self.max_errors:
            logger.warning(
                f"WebSocket error limit reached: {self._error_count} errors in "
                f"{self.error_window_seconds}s, session={self.session_id}"
            )
            await close_with_error(
                self.websocket,
                code=ErrorCode.EXTERNAL_RATE_LIMITED,
                message="Too many errors, please reconnect",
                session_id=self.session_id,
            )
            return False

        # Send error and continue
        await send_ws_error(
            self.websocket,
            code=error_code,
            message=str(error),
            session_id=self.session_id,
            recoverable=recoverable,
        )

        return recoverable

    def reset_error_count(self) -> None:
        """Reset error tracking (call after successful message processing)."""
        self._error_count = 0
        self._first_error_time = None


async def validate_ws_message(
    websocket: WebSocket,
    data: dict[str, Any],
    required_fields: list[str],
    session_id: str | None = None,
) -> bool:
    """Validate WebSocket message has required fields.

    Args:
        websocket: Active WebSocket connection
        data: Message data to validate
        required_fields: List of required field names
        session_id: Associated session ID

    Returns:
        True if valid, False if error was sent
    """
    missing = [f for f in required_fields if f not in data]
    if missing:
        await send_ws_error(
            websocket,
            code=ErrorCode.WS_MESSAGE_INVALID,
            message=f"Missing required fields: {', '.join(missing)}",
            session_id=session_id,
            recoverable=True,
            details={"missing_fields": missing},
        )
        return False
    return True


__all__ = [
    "ERROR_CODE_TO_WS_CLOSE",
    "WSCloseCode",
    "WebSocketErrorHandler",
    "close_with_error",
    "send_ws_error",
    "validate_ws_message",
    "websocket_error_handler",
]
