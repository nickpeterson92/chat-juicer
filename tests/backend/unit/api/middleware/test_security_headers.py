"""Unit tests for security headers middleware."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from starlette.requests import Request
from starlette.responses import JSONResponse

from api.middleware.security_headers import SecurityHeadersMiddleware


class TestSecurityHeadersMiddleware:
    """Tests for security headers middleware."""

    @pytest.mark.asyncio
    async def test_all_security_headers_present(self) -> None:
        """All expected security headers should be present."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None, enable_hsts=True)
        response = await middleware.dispatch(request, call_next)

        assert "Strict-Transport-Security" in response.headers
        assert "Content-Security-Policy" in response.headers
        assert "X-Content-Type-Options" in response.headers
        assert "X-Frame-Options" in response.headers
        assert "Referrer-Policy" in response.headers
        assert "X-XSS-Protection" in response.headers
        assert "Permissions-Policy" in response.headers

    @pytest.mark.asyncio
    async def test_hsts_header_value(self) -> None:
        """HSTS header should have correct max-age."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None, enable_hsts=True, hsts_max_age=31536000)
        response = await middleware.dispatch(request, call_next)

        assert response.headers["Strict-Transport-Security"] == "max-age=31536000"

    @pytest.mark.asyncio
    async def test_hsts_disabled_in_development(self) -> None:
        """HSTS should not be present when disabled."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None, enable_hsts=False)
        response = await middleware.dispatch(request, call_next)

        assert "Strict-Transport-Security" not in response.headers

    @pytest.mark.asyncio
    async def test_csp_header_value(self) -> None:
        """CSP header should be restrictive for API."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        csp = response.headers["Content-Security-Policy"]
        assert "default-src 'none'" in csp
        assert "frame-ancestors 'none'" in csp

    @pytest.mark.asyncio
    async def test_x_content_type_options(self) -> None:
        """X-Content-Type-Options should be nosniff."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert response.headers["X-Content-Type-Options"] == "nosniff"

    @pytest.mark.asyncio
    async def test_x_frame_options(self) -> None:
        """X-Frame-Options should be DENY."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert response.headers["X-Frame-Options"] == "DENY"

    @pytest.mark.asyncio
    async def test_referrer_policy(self) -> None:
        """Referrer-Policy should be strict-origin-when-cross-origin."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    @pytest.mark.asyncio
    async def test_xss_protection_disabled(self) -> None:
        """X-XSS-Protection should be 0 (disabled per OWASP)."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert response.headers["X-XSS-Protection"] == "0"

    @pytest.mark.asyncio
    async def test_permissions_policy(self) -> None:
        """Permissions-Policy should disable unnecessary features."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        policy = response.headers["Permissions-Policy"]
        assert "camera=()" in policy
        assert "microphone=()" in policy
        assert "geolocation=()" in policy

    @pytest.mark.asyncio
    async def test_headers_dont_break_response(self) -> None:
        """Adding headers should not affect response content."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"data": "test"}, status_code=201)

        request = MagicMock(spec=Request)

        middleware = SecurityHeadersMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_auto_hsts_based_on_environment(self) -> None:
        """HSTS should auto-enable in production environment."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        # Mock production environment
        with patch("api.middleware.security_headers.get_settings") as mock_settings:
            mock_settings.return_value.is_production = True
            middleware = SecurityHeadersMiddleware(lambda r: None)
            response = await middleware.dispatch(request, call_next)

            assert "Strict-Transport-Security" in response.headers

    @pytest.mark.asyncio
    async def test_auto_hsts_disabled_in_development(self) -> None:
        """HSTS should auto-disable in development environment."""

        async def call_next(request: Request) -> JSONResponse:
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)

        # Mock development environment
        with patch("api.middleware.security_headers.get_settings") as mock_settings:
            mock_settings.return_value.is_production = False
            middleware = SecurityHeadersMiddleware(lambda r: None)
            response = await middleware.dispatch(request, call_next)

            assert "Strict-Transport-Security" not in response.headers
