"""
OpenAI client factory utilities.
Centralizes AsyncOpenAI client creation with consistent configuration.
"""

from __future__ import annotations

from typing import Any

import httpx

from openai import AsyncOpenAI

from utils.http_logger import create_logging_client


def create_http_client(enable_logging: bool = False) -> httpx.AsyncClient | None:
    """Create HTTP client with optional request/response logging.

    Args:
        enable_logging: Enable HTTP request/response logging

    Returns:
        httpx.AsyncClient if logging enabled, None otherwise
    """
    if enable_logging:
        client: httpx.AsyncClient = create_logging_client(enabled=True)
        return client
    return None


def create_openai_client(
    api_key: str,
    base_url: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> AsyncOpenAI:
    """Create AsyncOpenAI client with consistent configuration.

    Args:
        api_key: OpenAI or Azure OpenAI API key
        base_url: Optional base URL for Azure or custom endpoints
        http_client: Optional httpx client for request logging

    Returns:
        Configured AsyncOpenAI client
    """
    kwargs: dict[str, Any] = {"api_key": api_key, "http_client": http_client}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


def create_sync_openai_client(
    api_key: str,
    base_url: str | None = None,
) -> Any:
    """Create synchronous OpenAI client for MarkItDown compatibility.

    MarkItDown requires a synchronous client for image processing.

    Args:
        api_key: OpenAI or Azure OpenAI API key
        base_url: Optional base URL for Azure or custom endpoints

    Returns:
        Configured synchronous OpenAI client
    """
    from openai import OpenAI

    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)
