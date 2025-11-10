"""Tests for HTTP request/response logging utilities.

Tests HTTPLogger class and create_logging_client function.
"""

from __future__ import annotations

import json

from unittest.mock import Mock, patch

import httpx
import pytest

from utils.http_logger import HTTPLogger, create_logging_client


class TestHTTPLogger:
    """Tests for HTTPLogger class."""

    def test_init_enabled(self) -> None:
        """Test HTTPLogger initialization with logging enabled."""
        logger = HTTPLogger(enabled=True)

        assert logger.enabled is True
        assert isinstance(logger._request_data, dict)
        assert len(logger._request_data) == 0

    def test_init_disabled(self) -> None:
        """Test HTTPLogger initialization with logging disabled."""
        logger = HTTPLogger(enabled=False)

        assert logger.enabled is False

    @pytest.mark.asyncio
    async def test_log_request_when_disabled(self) -> None:
        """Test log_request does nothing when disabled."""
        logger = HTTPLogger(enabled=False)
        mock_request = Mock(spec=httpx.Request)

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_request(mock_request)

            # Should not call logger
            mock_logger.info.assert_not_called()

    @pytest.mark.asyncio
    async def test_log_request_with_json_body(self) -> None:
        """Test logging request with JSON body."""
        logger = HTTPLogger(enabled=True)

        # Create mock request
        request_data = {"messages": [{"role": "user", "content": "test"}]}
        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "POST"
        mock_request.url = httpx.URL("https://api.example.com/chat")
        mock_request.headers = {"content-type": "application/json"}
        mock_request.content = json.dumps(request_data).encode("utf-8")

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_request(mock_request)

            # Should log request
            mock_logger.info.assert_called_once()
            call_args = mock_logger.info.call_args
            assert "HTTP Request" in call_args[0][0]
            assert call_args[1]["extra"]["http_request"] is True
            assert call_args[1]["extra"]["method"] == "POST"
            assert call_args[1]["extra"]["payload"] == request_data

    @pytest.mark.asyncio
    async def test_log_request_with_empty_body(self) -> None:
        """Test logging request with no body."""
        logger = HTTPLogger(enabled=True)

        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "GET"
        mock_request.url = httpx.URL("https://api.example.com/status")
        mock_request.headers = {}
        mock_request.content = b""

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_request(mock_request)

            # Should log request with empty payload
            mock_logger.info.assert_called_once()
            call_args = mock_logger.info.call_args
            assert call_args[1]["extra"]["payload"] == {}

    @pytest.mark.asyncio
    async def test_log_request_with_sensitive_headers(self) -> None:
        """Test logging request sanitizes sensitive headers."""
        logger = HTTPLogger(enabled=True)

        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "POST"
        mock_request.url = httpx.URL("https://api.example.com/chat")
        mock_request.headers = {
            "authorization": "Bearer sk-1234567890abcdef",
            "content-type": "application/json",
        }
        mock_request.content = b'{"test": "data"}'

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_request(mock_request)

            # Should sanitize authorization header
            call_args = mock_logger.info.call_args
            headers = call_args[1]["extra"]["headers"]
            assert "***" in headers["authorization"]
            assert "sk-1234567890abcdef" not in headers["authorization"]

    @pytest.mark.asyncio
    async def test_log_request_exception_handling(self) -> None:
        """Test log_request handles exceptions gracefully."""
        logger = HTTPLogger(enabled=True)

        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "POST"
        mock_request.url = httpx.URL("https://api.example.com/chat")
        mock_request.headers = {}
        # Make content decode raise an exception
        mock_request.content.decode.side_effect = UnicodeDecodeError("utf-8", b"", 0, 1, "test error")

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_request(mock_request)

            # Should log error
            mock_logger.error.assert_called_once()
            assert "Error logging HTTP request" in mock_logger.error.call_args[0][0]

    @pytest.mark.asyncio
    async def test_log_response_when_disabled(self) -> None:
        """Test log_response does nothing when disabled."""
        logger = HTTPLogger(enabled=False)
        mock_response = Mock(spec=httpx.Response)

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_response(mock_response)

            # Should not call logger
            mock_logger.info.assert_not_called()

    @pytest.mark.asyncio
    async def test_log_response_with_json_body(self) -> None:
        """Test logging response with JSON body."""
        logger = HTTPLogger(enabled=True)

        # Create mock request and response
        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "POST"
        mock_request.url = httpx.URL("https://api.example.com/chat")
        mock_request.headers = {}
        mock_request.content = b'{"test": "request"}'

        # First log the request to store correlation data
        with patch("utils.http_logger.logger"):
            await logger.log_request(mock_request)

        response_data = {"choices": [{"message": {"content": "test response"}}]}
        mock_response = Mock(spec=httpx.Response)
        mock_response.request = mock_request
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response._content = json.dumps(response_data).encode("utf-8")
        mock_response.text = json.dumps(response_data)

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_response(mock_response)

            # Should log response
            mock_logger.info.assert_called_once()
            call_args = mock_logger.info.call_args
            assert "HTTP Response" in call_args[0][0]
            assert call_args[1]["extra"]["http_response"] is True
            assert call_args[1]["extra"]["status_code"] == 200
            assert call_args[1]["extra"]["body"] == response_data

    @pytest.mark.asyncio
    async def test_log_response_streaming(self) -> None:
        """Test logging streaming response (body not captured)."""
        logger = HTTPLogger(enabled=True)

        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "POST"
        mock_request.url = httpx.URL("https://api.example.com/stream")
        mock_request.headers = {}
        mock_request.content = b"{}"

        # First log the request
        with patch("utils.http_logger.logger"):
            await logger.log_request(mock_request)

        # Streaming response (no _content attribute)
        mock_response = Mock(spec=httpx.Response)
        mock_response.request = mock_request
        mock_response.status_code = 200
        mock_response.headers = {}
        # No _content attribute = streaming
        delattr(mock_response, "_content")

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_response(mock_response)

            # Should log with streaming note
            call_args = mock_logger.info.call_args
            body = call_args[1]["extra"]["body"]
            assert "_note" in body
            assert "streaming" in body["_note"]

    @pytest.mark.asyncio
    async def test_log_response_invalid_json(self) -> None:
        """Test logging response with invalid JSON body."""
        logger = HTTPLogger(enabled=True)

        mock_request = Mock(spec=httpx.Request)
        mock_request.method = "GET"
        mock_request.url = httpx.URL("https://api.example.com/data")
        mock_request.headers = {}
        mock_request.content = b""

        with patch("utils.http_logger.logger"):
            await logger.log_request(mock_request)

        mock_response = Mock(spec=httpx.Response)
        mock_response.request = mock_request
        mock_response.status_code = 200
        mock_response.headers = {}
        mock_response._content = b"not json"
        mock_response.text = "not json"

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_response(mock_response)

            # Should log with error note
            call_args = mock_logger.info.call_args
            body = call_args[1]["extra"]["body"]
            assert "_error" in body
            assert "Invalid JSON" in body["_error"]

    @pytest.mark.asyncio
    async def test_log_response_exception_handling(self) -> None:
        """Test log_response handles exceptions gracefully."""
        logger = HTTPLogger(enabled=True)

        mock_request = Mock(spec=httpx.Request)
        mock_response = Mock(spec=httpx.Response)
        mock_response.request = mock_request
        # Make status_code raise an exception
        type(mock_response).status_code = property(lambda self: (_ for _ in ()).throw(RuntimeError("test error")))

        with patch("utils.http_logger.logger") as mock_logger:
            await logger.log_response(mock_response)

            # Should log error
            mock_logger.error.assert_called_once()
            assert "Error logging HTTP response" in mock_logger.error.call_args[0][0]

    def test_sanitize_headers_authorization(self) -> None:
        """Test sanitizing authorization header."""
        logger = HTTPLogger(enabled=True)

        headers = {
            "authorization": "Bearer sk-1234567890abcdef",
            "content-type": "application/json",
        }

        sanitized = logger._sanitize_headers(headers)

        assert "***" in sanitized["authorization"]
        assert sanitized["authorization"].endswith("cdef")
        assert sanitized["content-type"] == "application/json"

    def test_sanitize_headers_api_key(self) -> None:
        """Test sanitizing api-key header."""
        logger = HTTPLogger(enabled=True)

        headers = {
            "api-key": "1234567890abcdef",
            "content-type": "application/json",
        }

        sanitized = logger._sanitize_headers(headers)

        assert "***" in sanitized["api-key"]
        assert sanitized["api-key"].endswith("cdef")

    def test_sanitize_headers_case_insensitive(self) -> None:
        """Test sanitizing headers is case-insensitive."""
        logger = HTTPLogger(enabled=True)

        headers = {
            "Authorization": "Bearer sk-1234567890",
            "X-API-Key": "secret-key-123",
        }

        sanitized = logger._sanitize_headers(headers)

        assert "***" in sanitized["Authorization"]
        assert "***" in sanitized["X-API-Key"]

    def test_sanitize_headers_short_value(self) -> None:
        """Test sanitizing short header values."""
        logger = HTTPLogger(enabled=True)

        headers = {
            "api-key": "123",  # Less than 4 chars
        }

        sanitized = logger._sanitize_headers(headers)

        assert sanitized["api-key"] == "***"


class TestCreateLoggingClient:
    """Tests for create_logging_client function."""

    def test_create_logging_client_enabled(self) -> None:
        """Test creating logging client with logging enabled."""
        client = create_logging_client(enabled=True)

        assert isinstance(client, httpx.AsyncClient)
        # Check that event hooks are registered
        assert "request" in client._event_hooks
        assert "response" in client._event_hooks
        assert len(client._event_hooks["request"]) == 1
        assert len(client._event_hooks["response"]) == 1

    def test_create_logging_client_disabled(self) -> None:
        """Test creating logging client with logging disabled."""
        client = create_logging_client(enabled=False)

        assert isinstance(client, httpx.AsyncClient)
        # Event hooks should still be registered (HTTPLogger checks enabled flag)
        assert "request" in client._event_hooks
        assert "response" in client._event_hooks
