"""
Request context middleware for Chat Juicer API.

Provides request ID tracking, timing, and context propagation
for both REST and WebSocket endpoints.
"""

from __future__ import annotations

import secrets
import time

from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# Context variable for request-scoped data
_request_context: ContextVar[RequestContext | None] = ContextVar("request_context", default=None)

# Request ID prefix for easy identification in logs
REQUEST_ID_PREFIX = "req_"
WEBSOCKET_ID_PREFIX = "ws_"


@dataclass
class RequestContext:
    """Request-scoped context for tracking and logging.

    Stores request metadata that can be accessed anywhere in the call stack
    without passing it explicitly through function arguments.
    """

    request_id: str
    start_time: float = field(default_factory=time.monotonic)
    path: str = ""
    method: str = ""
    client_ip: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def elapsed_ms(self) -> float:
        """Get elapsed time since request start in milliseconds."""
        return (time.monotonic() - self.start_time) * 1000

    @property
    def timestamp(self) -> str:
        """Get ISO timestamp for current time."""
        return datetime.now(UTC).isoformat()

    def to_log_context(self) -> dict[str, Any]:
        """Get context dict for logging."""
        ctx = {
            "request_id": self.request_id,
            "path": self.path,
            "method": self.method,
            "elapsed_ms": round(self.elapsed_ms, 2),
        }
        if self.client_ip:
            ctx["client_ip"] = self.client_ip
        if self.user_id:
            ctx["user_id"] = self.user_id
        if self.session_id:
            ctx["session_id"] = self.session_id
        return ctx


def generate_request_id(prefix: str = REQUEST_ID_PREFIX) -> str:
    """Generate a unique request ID.

    Format: prefix + 16 hex characters (64 bits of entropy)
    Example: req_a1b2c3d4e5f6g7h8
    """
    return f"{prefix}{secrets.token_hex(8)}"


def get_request_context() -> RequestContext | None:
    """Get the current request context.

    Returns None if called outside of a request context.
    """
    return _request_context.get()


def get_request_id() -> str | None:
    """Get the current request ID.

    Convenience function for logging.
    """
    ctx = get_request_context()
    return ctx.request_id if ctx else None


def set_request_context(context: RequestContext) -> None:
    """Set the request context for the current async context."""
    _request_context.set(context)


def clear_request_context() -> None:
    """Clear the request context."""
    _request_context.set(None)


def update_request_context(**kwargs: Any) -> None:
    """Update fields in the current request context.

    Common usage:
        update_request_context(user_id="user_123", session_id="ses_456")
    """
    ctx = get_request_context()
    if ctx:
        for key, value in kwargs.items():
            if hasattr(ctx, key):
                setattr(ctx, key, value)
            else:
                ctx.extra[key] = value


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware to initialize request context for each request.

    Adds request ID to response headers and initializes context vars.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Check for existing request ID header (for distributed tracing)
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = generate_request_id()

        # Get client IP (handle proxied requests)
        client_ip = request.headers.get("X-Forwarded-For")
        if client_ip:
            # Take first IP in chain (original client)
            client_ip = client_ip.split(",")[0].strip()
        elif request.client:
            client_ip = request.client.host

        # Extract session_id from path if present
        session_id = None
        path_parts = request.url.path.split("/")
        if "sessions" in path_parts:
            idx = path_parts.index("sessions")
            if idx + 1 < len(path_parts):
                session_id = path_parts[idx + 1]

        # Create and set context
        context = RequestContext(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
            client_ip=client_ip,
            session_id=session_id,
        )
        set_request_context(context)

        try:
            response = await call_next(request)

            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id

            # Add timing header in development
            response.headers["X-Response-Time"] = f"{context.elapsed_ms:.2f}ms"

            return response
        finally:
            clear_request_context()


def create_websocket_context(
    session_id: str | None = None,
    client_ip: str | None = None,
) -> RequestContext:
    """Create a request context for WebSocket connections.

    WebSocket connections are long-lived, so we create a context
    per-connection rather than per-message.
    """
    context = RequestContext(
        request_id=generate_request_id(WEBSOCKET_ID_PREFIX),
        path="/ws/chat",
        method="WEBSOCKET",
        client_ip=client_ip,
        session_id=session_id,
    )
    set_request_context(context)
    return context


__all__ = [
    "REQUEST_ID_PREFIX",
    "WEBSOCKET_ID_PREFIX",
    "RequestContext",
    "RequestContextMiddleware",
    "clear_request_context",
    "create_websocket_context",
    "generate_request_id",
    "get_request_context",
    "get_request_id",
    "set_request_context",
    "update_request_context",
]
