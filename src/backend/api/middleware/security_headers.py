"""Security headers middleware.

Adds standard security headers to all HTTP responses for defense in depth:
- HSTS: Force HTTPS (production only)
- CSP: Content Security Policy
- X-Content-Type-Options: Prevent MIME sniffing
- X-Frame-Options: Prevent clickjacking
- Referrer-Policy: Control referrer information
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from core.constants import get_settings

# Default HSTS max-age: 1 year in seconds
DEFAULT_HSTS_MAX_AGE = 31536000


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers to all responses.

    Headers are added after the response is generated but before
    it's sent to the client. HSTS is only added in production to
    avoid breaking local development over HTTP.
    """

    def __init__(
        self,
        app: Callable[..., Any],
        hsts_max_age: int = DEFAULT_HSTS_MAX_AGE,
        enable_hsts: bool | None = None,
    ) -> None:
        """Initialize middleware.

        Args:
            app: FastAPI application
            hsts_max_age: HSTS max-age in seconds (default 1 year)
            enable_hsts: Whether to enable HSTS (default: auto based on environment)
        """
        super().__init__(app)
        self._hsts_max_age = hsts_max_age

        # Determine HSTS setting
        if enable_hsts is not None:
            self._enable_hsts = enable_hsts
        else:
            settings = get_settings()
            self._enable_hsts = settings.is_production

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Add security headers to response."""
        response = await call_next(request)

        # HSTS - only in production (requires HTTPS)
        if self._enable_hsts:
            response.headers["Strict-Transport-Security"] = f"max-age={self._hsts_max_age}"

        # Content Security Policy - restrictive for API-only backend
        # APIs don't serve HTML, so a strict policy is appropriate
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking (redundant with CSP frame-ancestors but good for older browsers)
        response.headers["X-Frame-Options"] = "DENY"

        # Control referrer information sent to other origins
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # X-XSS-Protection is deprecated and can cause issues in modern browsers
        # Explicitly disable it as recommended by OWASP
        response.headers["X-XSS-Protection"] = "0"

        # Permissions-Policy - disable browser features not needed by API
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )

        return response
