"""Unit tests for rate limiting middleware."""

from __future__ import annotations

import time

from unittest.mock import MagicMock, patch

import pytest

from starlette.requests import Request
from starlette.responses import JSONResponse

from api.middleware.rate_limiter import (
    RateLimitMiddleware,
    SlidingWindowRateLimiter,
    _get_client_identifier,
    _get_tier_for_path,
)


class TestGetTierForPath:
    """Tests for route tier classification."""

    def test_auth_login_is_auth_tier(self) -> None:
        assert _get_tier_for_path("/api/v1/auth/login") == "auth"

    def test_auth_register_is_auth_tier(self) -> None:
        assert _get_tier_for_path("/api/v1/auth/register") == "auth"

    def test_auth_refresh_is_auth_tier(self) -> None:
        assert _get_tier_for_path("/api/v1/auth/refresh") == "auth"

    def test_upload_is_upload_tier(self) -> None:
        assert _get_tier_for_path("/api/v1/files/sessions/123/upload") == "upload"

    def test_regular_api_is_api_tier(self) -> None:
        assert _get_tier_for_path("/api/v1/sessions") == "api"

    def test_health_is_api_tier(self) -> None:
        # Health is API tier but exempt from limiting in middleware
        assert _get_tier_for_path("/api/v1/health") == "api"


class TestGetClientIdentifier:
    """Tests for client identifier extraction."""

    def test_authenticated_user(self) -> None:
        """Authenticated users are tracked by user ID."""
        request = MagicMock(spec=Request)
        request.state = MagicMock()
        request.state.user = MagicMock()
        request.state.user.id = "user-123"

        identifier = _get_client_identifier(request)
        assert identifier == "user:user-123"

    def test_unauthenticated_client_by_ip(self) -> None:
        """Unauthenticated clients are tracked by IP."""
        request = MagicMock(spec=Request)
        request.state = MagicMock()
        request.state.user = None
        request.client = MagicMock()
        request.client.host = "192.168.1.1"
        request.headers = {}

        identifier = _get_client_identifier(request)
        assert identifier == "ip:192.168.1.1"

    def test_forwarded_for_header(self) -> None:
        """X-Forwarded-For header is used when present."""
        request = MagicMock(spec=Request)
        request.state = MagicMock()
        request.state.user = None
        request.client = MagicMock()
        request.client.host = "10.0.0.1"
        request.headers = {"X-Forwarded-For": "203.0.113.50, 10.0.0.1"}

        identifier = _get_client_identifier(request)
        assert identifier == "ip:203.0.113.50"


class TestSlidingWindowRateLimiter:
    """Tests for the sliding window algorithm."""

    @pytest.fixture
    def rate_limiter(self) -> SlidingWindowRateLimiter:
        return SlidingWindowRateLimiter(cleanup_interval=300.0)

    @pytest.mark.asyncio
    async def test_first_request_allowed(self, rate_limiter: SlidingWindowRateLimiter) -> None:
        """First request should always be allowed."""
        allowed, headers = await rate_limiter.is_allowed("user:1", "api")
        assert allowed is True
        assert "X-RateLimit-Limit" in headers
        assert "X-RateLimit-Remaining" in headers

    @pytest.mark.asyncio
    async def test_burst_allowance(self, rate_limiter: SlidingWindowRateLimiter) -> None:
        """Auth tier should allow burst requests up to limit."""
        # Auth tier has requests_per_minute=10, burst_size=5
        # The burst adds to the base limit, so effective limit starts at 15
        # But burst is consumed as requests are made, so later requests
        # only have base limit (10)

        # First 10 requests should be allowed (we get full 10 + burst that decreases)
        for i in range(10):
            allowed, _ = await rate_limiter.is_allowed("user:1", "auth")
            assert allowed is True, f"Request {i+1} should be allowed"

    @pytest.mark.asyncio
    async def test_rate_limit_headers(self, rate_limiter: SlidingWindowRateLimiter) -> None:
        """Rate limit headers should be accurate."""
        _allowed, headers = await rate_limiter.is_allowed("user:1", "api")

        # API tier is 120 req/min
        assert headers["X-RateLimit-Limit"] == 120
        assert headers["X-RateLimit-Remaining"] == 119
        assert headers["X-RateLimit-Reset"] == 60

    @pytest.mark.asyncio
    async def test_separate_users_independent(self, rate_limiter: SlidingWindowRateLimiter) -> None:
        """Different users should have independent rate limits."""
        # Exhaust user 1's limit
        for _ in range(120):
            await rate_limiter.is_allowed("user:1", "api")

        # User 1 is rate limited
        allowed, _ = await rate_limiter.is_allowed("user:1", "api")
        assert allowed is False

        # User 2 should still be allowed
        allowed, _ = await rate_limiter.is_allowed("user:2", "api")
        assert allowed is True

    @pytest.mark.asyncio
    async def test_separate_tiers_independent(self, rate_limiter: SlidingWindowRateLimiter) -> None:
        """Different tiers for same user should be independent."""
        # Make requests in auth tier
        for _ in range(15):
            await rate_limiter.is_allowed("user:1", "auth")

        # Auth tier should be exhausted
        allowed, _ = await rate_limiter.is_allowed("user:1", "auth")
        assert allowed is False

        # API tier should still be allowed
        allowed, _ = await rate_limiter.is_allowed("user:1", "api")
        assert allowed is True

    @pytest.mark.asyncio
    async def test_sliding_window_recovery(self, rate_limiter: SlidingWindowRateLimiter) -> None:
        """Rate limit should recover as time passes (sliding window)."""
        # Make 5 requests
        for _ in range(5):
            await rate_limiter.is_allowed("user:1", "api")

        # Fast-forward time by modifying timestamps
        async with rate_limiter._lock:
            entries = rate_limiter._entries["api"]
            if "user:1" in entries:
                # Move all timestamps to 90 seconds ago (outside 60s window)
                old_ts = [time.monotonic() - 90.0]
                entries["user:1"].timestamps = old_ts

        # Now requests should be allowed again
        allowed, headers = await rate_limiter.is_allowed("user:1", "api")
        assert allowed is True
        # Old timestamps should be cleaned, so remaining should be nearly full
        assert headers["X-RateLimit-Remaining"] >= 118


class TestRateLimitMiddleware:
    """Tests for the FastAPI middleware."""

    @pytest.fixture
    def mock_rate_limiter(self) -> SlidingWindowRateLimiter:
        return SlidingWindowRateLimiter()

    @pytest.mark.asyncio
    async def test_exempt_path_bypasses_limiter(self) -> None:
        """Health endpoints should bypass rate limiting."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.url = MagicMock()
        request.url.path = "/health"
        request.headers = {}

        rate_limiter = SlidingWindowRateLimiter()
        middleware = RateLimitMiddleware(lambda r: None, rate_limiter)

        with patch.object(rate_limiter, "is_allowed") as mock_is_allowed:
            await middleware.dispatch(request, call_next)

            # Rate limiter should not be called for exempt paths
            mock_is_allowed.assert_not_called()
            assert call_next_called is True

    @pytest.mark.asyncio
    async def test_websocket_bypasses_limiter(self) -> None:
        """WebSocket upgrade requests should bypass rate limiting."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={})

        request = MagicMock(spec=Request)
        request.url = MagicMock()
        request.url.path = "/ws/chat/123"
        request.headers = {"upgrade": "websocket"}

        rate_limiter = SlidingWindowRateLimiter()
        middleware = RateLimitMiddleware(lambda r: None, rate_limiter)

        with (
            patch.object(rate_limiter, "is_allowed") as mock_is_allowed,
            patch("api.middleware.rate_limiter.get_settings") as mock_settings,
        ):
            mock_settings.return_value.is_development = False
            mock_settings.return_value.rate_limit_enabled = True
            await middleware.dispatch(request, call_next)

            mock_is_allowed.assert_not_called()
            assert call_next_called is True

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self) -> None:
        """Exceeding rate limit should return 429 response."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.url = MagicMock()
        request.url.path = "/api/v1/sessions"
        request.headers = {}
        request.state = MagicMock()
        request.state.user = None
        request.client = MagicMock()
        request.client.host = "192.168.1.1"

        rate_limiter = SlidingWindowRateLimiter()
        middleware = RateLimitMiddleware(lambda r: None, rate_limiter)

        # Mock is_allowed to return False (rate limited)
        with (
            patch.object(
                rate_limiter,
                "is_allowed",
                return_value=(False, {"X-RateLimit-Limit": 120, "X-RateLimit-Remaining": 0, "X-RateLimit-Reset": 60}),
            ),
            patch("api.middleware.rate_limiter.get_settings") as mock_settings,
        ):
            mock_settings.return_value.is_development = False
            mock_settings.return_value.rate_limit_enabled = True
            response = await middleware.dispatch(request, call_next)

        assert response.status_code == 429
        assert response.headers["Retry-After"] == "60"

    @pytest.mark.asyncio
    async def test_allowed_request_includes_headers(self) -> None:
        """Allowed requests should include rate limit headers."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.url = MagicMock()
        request.url.path = "/api/v1/sessions"
        request.headers = {}
        request.state = MagicMock()
        request.state.user = None
        request.client = MagicMock()
        request.client.host = "192.168.1.1"

        rate_limiter = SlidingWindowRateLimiter()
        middleware = RateLimitMiddleware(lambda r: None, rate_limiter)

        with (
            patch.object(
                rate_limiter,
                "is_allowed",
                return_value=(True, {"X-RateLimit-Limit": 120, "X-RateLimit-Remaining": 119, "X-RateLimit-Reset": 60}),
            ),
            patch("api.middleware.rate_limiter.get_settings") as mock_settings,
        ):
            mock_settings.return_value.is_development = False
            mock_settings.return_value.rate_limit_enabled = True
            response = await middleware.dispatch(request, call_next)

        assert response.status_code == 200
        assert response.headers["X-RateLimit-Limit"] == "120"
        assert response.headers["X-RateLimit-Remaining"] == "119"
