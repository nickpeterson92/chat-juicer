"""
OpenAI client factory utilities.
Centralizes AsyncOpenAI client creation with consistent configuration.
"""

from __future__ import annotations

from typing import Any

import httpx

from openai import AsyncOpenAI

from utils.http_logger import create_logging_client

# Timeout configuration for streaming with reasoning models
# Reasoning models (GPT-5, O1, O3) can pause 30+ seconds while "thinking"
# before producing output, so we need generous read timeouts
DEFAULT_CONNECT_TIMEOUT = 30.0  # Time to establish connection
DEFAULT_READ_TIMEOUT = 600.0  # 10 minutes - reasoning models need this
DEFAULT_WRITE_TIMEOUT = 30.0  # Time to send request
DEFAULT_POOL_TIMEOUT = 30.0  # Time to acquire connection from pool


def create_http_client(
    enable_logging: bool = False,
    read_timeout: float | None = None,
) -> httpx.AsyncClient:
    """Create HTTP client with proper timeouts for streaming.

    Args:
        enable_logging: Enable HTTP request/response logging
        read_timeout: Read timeout in seconds (default: 600s for reasoning models)

    Returns:
        Configured httpx.AsyncClient
    """
    effective_read_timeout = read_timeout if read_timeout is not None else DEFAULT_READ_TIMEOUT
    timeout = httpx.Timeout(
        connect=DEFAULT_CONNECT_TIMEOUT,
        read=effective_read_timeout,
        write=DEFAULT_WRITE_TIMEOUT,
        pool=DEFAULT_POOL_TIMEOUT,
    )

    if enable_logging:
        client: httpx.AsyncClient = create_logging_client(enabled=True, timeout=timeout)
        return client

    return httpx.AsyncClient(timeout=timeout)


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
