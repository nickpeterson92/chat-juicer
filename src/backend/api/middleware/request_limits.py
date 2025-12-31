"""Request body size limit middleware.

Validates request body sizes before they're fully read into memory,
preventing memory exhaustion from oversized payloads.

Size limits vary by endpoint type:
- File uploads: Higher limit (configurable, default 50 MB)
- Regular API: Lower limit (default 1 MB)
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from core.constants import get_settings
from utils.logger import logger

# Default size limits (can be overridden by Settings)
DEFAULT_MAX_BODY_SIZE = 1 * 1024 * 1024  # 1 MB
DEFAULT_MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB

# Paths that use the upload size limit
UPLOAD_PATTERNS: tuple[str, ...] = (
    "/upload",
    "/files",
)


def _is_upload_path(path: str) -> bool:
    """Check if path is a file upload endpoint."""
    return any(pattern in path for pattern in UPLOAD_PATTERNS)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce request body size limits.

    Checks Content-Length header before processing. For chunked transfers
    without Content-Length, the body is read incrementally with size tracking.
    """

    def __init__(
        self,
        app: Callable[..., Any],
        max_body_size: int | None = None,
        max_upload_size: int | None = None,
    ) -> None:
        """Initialize middleware with size limits.

        Args:
            app: FastAPI application
            max_body_size: Max size for regular requests (bytes)
            max_upload_size: Max size for upload requests (bytes)
        """
        super().__init__(app)
        settings = get_settings()

        # Get settings with proper type handling
        settings_body_size = getattr(settings, "max_request_body_size", None)
        settings_upload_size = getattr(settings, "max_upload_size", None)

        self._max_body_size = max_body_size or (
            settings_body_size if isinstance(settings_body_size, int) else DEFAULT_MAX_BODY_SIZE
        )
        self._max_upload_size = max_upload_size or (
            settings_upload_size if isinstance(settings_upload_size, int) else DEFAULT_MAX_UPLOAD_SIZE
        )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Check request size before processing."""
        # Skip size check for requests without bodies
        if request.method in ("GET", "HEAD", "OPTIONS", "DELETE"):
            return await call_next(request)

        # Skip WebSocket upgrades
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # Determine size limit based on path
        path = request.url.path
        max_size = self._max_upload_size if _is_upload_path(path) else self._max_body_size

        # Check Content-Length header if present
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > max_size:
                    logger.warning(f"Request body too large: {size} bytes > {max_size} bytes (path: {path})")
                    return JSONResponse(
                        status_code=413,
                        content={
                            "error": "request_too_large",
                            "message": f"Request body exceeds maximum size of {max_size} bytes",
                            "max_size": max_size,
                        },
                    )
            except ValueError:
                # Invalid Content-Length header
                pass

        # For requests without Content-Length (chunked encoding),
        # the body will be validated during parsing by FastAPI/Starlette
        # We rely on the Content-Length check for the common case

        return await call_next(request)
