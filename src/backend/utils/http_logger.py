"""
HTTP request/response logging for debugging Azure OpenAI API issues.

Captures full request payloads and responses using httpx event hooks.
"""

from __future__ import annotations

import json

from typing import Any

import httpx

from utils.logger import logger


class HTTPLogger:
    """Logs HTTP requests and responses for debugging."""

    def __init__(self, enabled: bool = True):
        """Initialize HTTP logger.

        Args:
            enabled: Whether to enable HTTP logging (default: True)
        """
        self.enabled = enabled
        self._request_data: dict[Any, dict[str, Any]] = {}

    async def log_request(self, request: httpx.Request) -> None:
        """Log outgoing HTTP request.

        Args:
            request: The httpx request object
        """
        if not self.enabled:
            return

        try:
            # Decode request body
            body_str = request.content.decode("utf-8") if request.content else ""
            body_json = json.loads(body_str) if body_str else {}

            # Store request data for correlation with response
            self._request_data[id(request)] = {
                "method": request.method,
                "url": str(request.url),
                "headers": dict(request.headers),
                "body": body_json,
            }

            # Log to file with full payload
            logger.info(
                f"HTTP Request: {request.method} {request.url}",
                extra={
                    "http_request": True,
                    "method": request.method,
                    "url": str(request.url),
                    "headers": self._sanitize_headers(dict(request.headers)),
                    "payload": body_json,
                },
            )

            # Also log pretty-printed payload to console for easy viewing
            if body_json:
                logger.debug(f"Request Payload:\n{json.dumps(body_json, indent=2)}")

        except Exception as e:
            logger.error(f"Error logging HTTP request: {e}", exc_info=True)

    async def log_response(self, response: httpx.Response) -> None:
        """Log HTTP response.

        Args:
            response: The httpx response object
        """
        if not self.enabled:
            return

        try:
            # Get corresponding request data
            request_data = self._request_data.pop(id(response.request), {})

            # Try to read response body, but handle streaming responses
            body_json: dict[str, Any] = {}
            try:
                # Check if response has been read
                if hasattr(response, "_content") and response._content is not None:
                    body_str = response.text
                    body_json = json.loads(body_str) if body_str else {}
                else:
                    # Streaming response - can't read body without consuming stream
                    body_json = {"_note": "streaming response - body not captured"}
            except (httpx.ResponseNotRead, AttributeError):
                # Response is streaming or not yet read
                body_json = {"_note": "streaming response - body not captured"}
            except json.JSONDecodeError as e:
                body_json = {"_error": f"Invalid JSON: {e!s}"}

            # Log to file
            logger.info(
                f"HTTP Response: {response.status_code} {request_data.get('method', 'UNKNOWN')} {request_data.get('url', 'UNKNOWN')}",
                extra={
                    "http_response": True,
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "body": body_json,
                    "request": request_data,
                },
            )

            # Log response status to console
            logger.debug(f"Response Status: {response.status_code}")

        except Exception as e:
            logger.error(f"Error logging HTTP response: {e}", exc_info=True)

    def _sanitize_headers(self, headers: dict[str, str]) -> dict[str, str]:
        """Remove sensitive data from headers.

        Args:
            headers: Original headers dictionary

        Returns:
            Sanitized headers with sensitive values redacted
        """
        sanitized = headers.copy()
        sensitive_keys = ["authorization", "api-key", "x-api-key"]

        for key in sensitive_keys:
            if key.lower() in {k.lower() for k in sanitized}:
                # Find actual key (case-insensitive)
                actual_key = next(k for k in sanitized if k.lower() == key.lower())
                value = sanitized[actual_key]
                # Show last 4 chars only
                sanitized[actual_key] = f"***{value[-4:]}" if len(value) > 4 else "***"

        return sanitized


def create_logging_client(
    enabled: bool = True,
    timeout: httpx.Timeout | None = None,
) -> httpx.AsyncClient:
    """Create an httpx client with request/response logging.

    Args:
        enabled: Whether to enable HTTP logging
        timeout: Optional timeout configuration

    Returns:
        Configured httpx.AsyncClient with event hooks
    """
    http_logger = HTTPLogger(enabled=enabled)

    # Create event hooks
    event_hooks: dict[str, list[Any]] = {
        "request": [http_logger.log_request],
        "response": [http_logger.log_response],
    }

    # Create and return httpx client with hooks
    return httpx.AsyncClient(event_hooks=event_hooks, timeout=timeout)
