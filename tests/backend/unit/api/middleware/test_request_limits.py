"""Unit tests for request size limit middleware."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from starlette.requests import Request
from starlette.responses import JSONResponse

from api.middleware.request_limits import (
    RequestSizeLimitMiddleware,
    _is_upload_path,
)


class TestIsUploadPath:
    """Tests for upload path detection."""

    def test_upload_endpoint(self) -> None:
        assert _is_upload_path("/api/v1/files/sessions/123/upload") is True

    def test_files_endpoint(self) -> None:
        assert _is_upload_path("/api/v1/files/download") is True

    def test_regular_api_not_upload(self) -> None:
        assert _is_upload_path("/api/v1/sessions") is False

    def test_auth_not_upload(self) -> None:
        assert _is_upload_path("/api/v1/auth/login") is False


class TestRequestSizeLimitMiddleware:
    """Tests for the request size limit middleware."""

    @pytest.mark.asyncio
    async def test_get_request_bypasses_check(self) -> None:
        """GET requests should bypass size check."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.method = "GET"

        middleware = RequestSizeLimitMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert call_next_called is True
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_post_without_content_length_passes(self) -> None:
        """POST requests without Content-Length should pass through."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={"status": "ok"})

        # POST without content-length (e.g., chunked encoding)
        request = MagicMock()
        request.method = "POST"
        request.url.path = "/api/v1/sessions"
        request.headers = {}  # No content-length

        middleware = RequestSizeLimitMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)

        assert call_next_called is True
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_oversized_request_rejected(self) -> None:
        """Requests over limit should be rejected with 413."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.method = "POST"
        request.url = MagicMock()
        request.url.path = "/api/v1/sessions"
        request.headers = {"content-length": str(10 * 1024 * 1024)}  # 10MB

        middleware = RequestSizeLimitMiddleware(lambda r: None, max_body_size=1024 * 1024)
        response = await middleware.dispatch(request, call_next)

        assert call_next_called is False
        assert response.status_code == 413

    @pytest.mark.asyncio
    async def test_upload_uses_higher_limit(self) -> None:
        """Upload endpoints should use higher size limit."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.method = "POST"
        request.url = MagicMock()
        request.url.path = "/api/v1/files/sessions/123/upload"
        # 10MB - larger than regular limit but smaller than upload limit
        request.headers = {"content-length": str(10 * 1024 * 1024)}

        middleware = RequestSizeLimitMiddleware(
            lambda r: None,
            max_body_size=1 * 1024 * 1024,  # 1MB regular
            max_upload_size=50 * 1024 * 1024,  # 50MB upload
        )
        response = await middleware.dispatch(request, call_next)

        assert call_next_called is True
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_websocket_bypasses_check(self) -> None:
        """WebSocket upgrades should bypass size check."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={})

        request = MagicMock(spec=Request)
        request.method = "GET"
        request.headers = {"upgrade": "websocket"}

        middleware = RequestSizeLimitMiddleware(lambda r: None)
        await middleware.dispatch(request, call_next)

        assert call_next_called is True

    @pytest.mark.asyncio
    async def test_invalid_content_length_passes(self) -> None:
        """Invalid Content-Length should not crash middleware."""
        call_next_called = False

        async def call_next(request: Request) -> JSONResponse:
            nonlocal call_next_called
            call_next_called = True
            return JSONResponse(content={"status": "ok"})

        request = MagicMock(spec=Request)
        request.method = "POST"
        request.url = MagicMock()
        request.url.path = "/api/v1/sessions"
        request.headers = {"content-length": "invalid"}

        middleware = RequestSizeLimitMiddleware(lambda r: None)
        await middleware.dispatch(request, call_next)

        # Should not crash, just pass through
        assert call_next_called is True
