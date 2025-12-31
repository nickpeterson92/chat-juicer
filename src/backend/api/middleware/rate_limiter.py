"""Rate limiting middleware with sliding window algorithm.

Provides configurable rate limiting with:
- Sliding window + burst for smoother limits
- Per-user (authenticated) and per-IP (unauthenticated) tracking
- Route-specific limits (auth, uploads, general API)
- Health endpoint exemption
- Automatic cleanup of expired entries
"""

from __future__ import annotations

import asyncio
import contextlib
import time

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field as dataclass_field
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from core.constants import get_settings
from utils.logger import logger


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit tier."""

    requests_per_minute: int
    burst_size: int = 0  # Additional burst allowance (0 = no burst)


@dataclass
class RateLimitEntry:
    """Tracks request counts for sliding window algorithm."""

    window_start: float
    request_count: int = 0
    burst_used: int = 0
    timestamps: list[float] = dataclass_field(default_factory=list)


# Route patterns and their rate limit configurations
RATE_LIMIT_TIERS: dict[str, RateLimitConfig] = {
    # Auth endpoints: stricter limits with burst allowance
    "auth": RateLimitConfig(requests_per_minute=10, burst_size=5),
    # File upload endpoints
    "upload": RateLimitConfig(requests_per_minute=10, burst_size=0),
    # Regular API endpoints
    "api": RateLimitConfig(requests_per_minute=120, burst_size=0),
}

# Paths exempt from rate limiting
EXEMPT_PATHS: set[str] = {
    "/health",
    "/readiness",
    "/api/v1/health",
    "/api/v1/health/readiness",
}

# Route pattern matching
AUTH_PATTERNS: tuple[str, ...] = (
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
)
UPLOAD_PATTERNS: tuple[str, ...] = ("/upload",)


def _get_tier_for_path(path: str) -> str:
    """Determine rate limit tier for a given path."""
    if any(pattern in path for pattern in AUTH_PATTERNS):
        return "auth"
    if any(pattern in path for pattern in UPLOAD_PATTERNS):
        return "upload"
    return "api"


def _get_client_identifier(request: Request) -> str:
    """Get identifier for rate limiting: user_id if authenticated, else IP.

    Checks for user info set by auth middleware, falls back to client IP.
    """
    # Check if user is authenticated (set by auth middleware/dependency)
    if hasattr(request.state, "user") and request.state.user:
        return f"user:{request.state.user.id}"

    # Fall back to IP address
    client_ip = request.client.host if request.client else "unknown"

    # Check for X-Forwarded-For header (behind proxy/load balancer)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP (original client)
        client_ip = forwarded_for.split(",")[0].strip()

    return f"ip:{client_ip}"


class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter with burst support.

    Uses a sliding window algorithm for smoother rate limiting compared
    to fixed windows. Burst allowance lets users make quick initial
    requests before sustained rate limiting kicks in.
    """

    def __init__(self, cleanup_interval: float = 60.0) -> None:
        """Initialize the rate limiter.

        Args:
            cleanup_interval: How often to clean up expired entries (seconds)
        """
        # Dict[tier][identifier] -> RateLimitEntry
        self._entries: dict[str, dict[str, RateLimitEntry]] = defaultdict(dict)
        self._lock = asyncio.Lock()
        self._cleanup_task: asyncio.Task[None] | None = None
        self._cleanup_interval = cleanup_interval
        self._shutting_down = False

    async def start(self) -> None:
        """Start the background cleanup task."""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("Rate limiter cleanup task started")

    async def stop(self) -> None:
        """Stop the background cleanup task."""
        self._shutting_down = True
        if self._cleanup_task:
            self._cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._cleanup_task
            self._cleanup_task = None
            logger.info("Rate limiter cleanup task stopped")

    async def is_allowed(self, identifier: str, tier: str) -> tuple[bool, dict[str, int]]:
        """Check if a request is allowed under the rate limit.

        Args:
            identifier: Client identifier (user:id or ip:address)
            tier: Rate limit tier (auth, upload, api)

        Returns:
            Tuple of (is_allowed, headers_dict) where headers_dict contains
            rate limit info for response headers.
        """
        config = RATE_LIMIT_TIERS.get(tier, RATE_LIMIT_TIERS["api"])
        now = time.monotonic()
        window_size = 60.0  # 1 minute window

        async with self._lock:
            entries = self._entries[tier]

            if identifier not in entries:
                entries[identifier] = RateLimitEntry(
                    window_start=now,
                    timestamps=[now],
                    request_count=1,
                )
                return True, self._build_headers(config, 1, now, window_size)

            entry = entries[identifier]

            # Remove timestamps outside the sliding window
            cutoff = now - window_size
            entry.timestamps = [ts for ts in entry.timestamps if ts > cutoff]
            entry.request_count = len(entry.timestamps)

            # Calculate effective limit (base + burst if available)
            effective_limit = config.requests_per_minute
            if config.burst_size > 0:
                # Burst is a one-time allowance that regenerates when window is empty
                if entry.request_count == 0:
                    entry.burst_used = 0
                remaining_burst = config.burst_size - entry.burst_used
                effective_limit += remaining_burst

            if entry.request_count >= effective_limit:
                return False, self._build_headers(config, entry.request_count, now, window_size)

            # Request allowed - record it
            entry.timestamps.append(now)
            entry.request_count += 1

            # Track burst usage
            if entry.request_count <= config.burst_size:
                entry.burst_used = min(entry.request_count, config.burst_size)

            return True, self._build_headers(config, entry.request_count, now, window_size)

    def _build_headers(
        self, config: RateLimitConfig, current_count: int, now: float, window_size: float
    ) -> dict[str, int]:
        """Build rate limit response headers."""
        total_limit = config.requests_per_minute + config.burst_size
        remaining = max(0, total_limit - current_count)
        reset_seconds = int(window_size)

        return {
            "X-RateLimit-Limit": total_limit,
            "X-RateLimit-Remaining": remaining,
            "X-RateLimit-Reset": reset_seconds,
        }

    async def _cleanup_loop(self) -> None:
        """Periodically clean up expired entries."""
        while not self._shutting_down:
            await asyncio.sleep(self._cleanup_interval)
            await self._cleanup_expired()

    async def _cleanup_expired(self) -> None:
        """Remove entries with no recent requests."""
        now = time.monotonic()
        cutoff = now - 120.0  # Keep entries for 2 minutes after last request

        async with self._lock:
            for tier in list(self._entries.keys()):
                entries = self._entries[tier]
                expired = [
                    identifier
                    for identifier, entry in entries.items()
                    if not entry.timestamps or max(entry.timestamps) < cutoff
                ]
                for identifier in expired:
                    del entries[identifier]

                if expired:
                    logger.debug(f"Rate limiter cleanup: removed {len(expired)} expired entries from {tier}")


# Module-level singleton
_rate_limiter: SlidingWindowRateLimiter | None = None


def get_rate_limiter() -> SlidingWindowRateLimiter:
    """Get or create the singleton rate limiter."""
    global _rate_limiter  # noqa: PLW0603
    if _rate_limiter is None:
        _rate_limiter = SlidingWindowRateLimiter()
    return _rate_limiter


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for rate limiting requests."""

    def __init__(
        self,
        app: Callable[..., Any],
        rate_limiter: SlidingWindowRateLimiter | None = None,
    ) -> None:
        super().__init__(app)
        self._rate_limiter = rate_limiter or get_rate_limiter()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Process request through rate limiter."""
        path = request.url.path
        settings = get_settings()

        # Skip rate limiting for exempt paths
        if path in EXEMPT_PATHS:
            return await call_next(request)

        # Skip rate limiting in development if disabled
        if settings.is_development and not getattr(settings, "rate_limit_enabled", True):
            return await call_next(request)

        # Skip WebSocket upgrades (connection limits handled separately)
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # Get rate limit tier and client identifier
        tier = _get_tier_for_path(path)
        identifier = _get_client_identifier(request)

        # Check rate limit
        allowed, headers = await self._rate_limiter.is_allowed(identifier, tier)

        if not allowed:
            logger.warning(f"Rate limit exceeded for {identifier} on {tier} tier (path: {path})")
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                    "retry_after": headers.get("X-RateLimit-Reset", 60),
                },
            )
            # Add rate limit headers to 429 response
            for header, value in headers.items():
                response.headers[header] = str(value)
            response.headers["Retry-After"] = str(headers.get("X-RateLimit-Reset", 60))
            return response

        # Process request
        result = await call_next(request)

        # Add rate limit headers to successful responses
        for header, value in headers.items():
            result.headers[header] = str(value)

        return result
