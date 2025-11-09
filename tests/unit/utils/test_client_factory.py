"""Tests for OpenAI client factory utilities.

Tests client creation and configuration.
"""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from utils.client_factory import (
    create_http_client,
    create_openai_client,
    create_sync_openai_client,
)


class TestCreateHttpClient:
    """Tests for create_http_client function."""

    def test_create_http_client_with_logging_enabled(self) -> None:
        """Test creating HTTP client with logging enabled."""
        with patch("utils.client_factory.create_logging_client") as mock_create:
            mock_client = Mock()
            mock_create.return_value = mock_client

            result = create_http_client(enable_logging=True)

            assert result is mock_client
            mock_create.assert_called_once_with(enabled=True)

    def test_create_http_client_with_logging_disabled(self) -> None:
        """Test creating HTTP client with logging disabled."""
        result = create_http_client(enable_logging=False)

        assert result is None

    def test_create_http_client_default(self) -> None:
        """Test creating HTTP client with default settings (no logging)."""
        result = create_http_client()

        assert result is None


class TestCreateOpenAIClient:
    """Tests for create_openai_client function."""

    def test_create_openai_client_minimal(self) -> None:
        """Test creating OpenAI client with minimal args."""
        with patch("utils.client_factory.AsyncOpenAI") as mock_async_openai:
            mock_client = Mock()
            mock_async_openai.return_value = mock_client

            result = create_openai_client(api_key="test-key")

            assert result is mock_client
            mock_async_openai.assert_called_once()
            call_kwargs = mock_async_openai.call_args[1]
            assert call_kwargs["api_key"] == "test-key"
            assert call_kwargs["http_client"] is None

    def test_create_openai_client_with_base_url(self) -> None:
        """Test creating OpenAI client with base URL."""
        with patch("utils.client_factory.AsyncOpenAI") as mock_async_openai:
            mock_client = Mock()
            mock_async_openai.return_value = mock_client

            result = create_openai_client(
                api_key="test-key",
                base_url="https://api.example.com"
            )

            assert result is mock_client
            call_kwargs = mock_async_openai.call_args[1]
            assert call_kwargs["api_key"] == "test-key"
            assert call_kwargs["base_url"] == "https://api.example.com"

    def test_create_openai_client_with_http_client(self) -> None:
        """Test creating OpenAI client with custom HTTP client."""
        with patch("utils.client_factory.AsyncOpenAI") as mock_async_openai:
            mock_client = Mock()
            mock_http_client = Mock()
            mock_async_openai.return_value = mock_client

            result = create_openai_client(
                api_key="test-key",
                http_client=mock_http_client
            )

            assert result is mock_client
            call_kwargs = mock_async_openai.call_args[1]
            assert call_kwargs["http_client"] is mock_http_client

    def test_create_openai_client_all_params(self) -> None:
        """Test creating OpenAI client with all parameters."""
        with patch("utils.client_factory.AsyncOpenAI") as mock_async_openai:
            mock_client = Mock()
            mock_http_client = Mock()
            mock_async_openai.return_value = mock_client

            result = create_openai_client(
                api_key="test-key",
                base_url="https://api.example.com",
                http_client=mock_http_client
            )

            assert result is mock_client
            call_kwargs = mock_async_openai.call_args[1]
            assert call_kwargs["api_key"] == "test-key"
            assert call_kwargs["base_url"] == "https://api.example.com"
            assert call_kwargs["http_client"] is mock_http_client


class TestCreateSyncOpenAIClient:
    """Tests for create_sync_openai_client function."""

    def test_create_sync_client_minimal(self) -> None:
        """Test creating sync OpenAI client with minimal args."""
        with patch("openai.OpenAI") as mock_openai:
            mock_client = Mock()
            mock_openai.return_value = mock_client

            result = create_sync_openai_client(api_key="test-key")

            assert result is mock_client
            mock_openai.assert_called_once()
            call_kwargs = mock_openai.call_args[1]
            assert call_kwargs["api_key"] == "test-key"

    def test_create_sync_client_with_base_url(self) -> None:
        """Test creating sync OpenAI client with base URL."""
        with patch("openai.OpenAI") as mock_openai:
            mock_client = Mock()
            mock_openai.return_value = mock_client

            result = create_sync_openai_client(
                api_key="test-key",
                base_url="https://azure.openai.azure.com/"
            )

            assert result is mock_client
            call_kwargs = mock_openai.call_args[1]
            assert call_kwargs["api_key"] == "test-key"
            assert call_kwargs["base_url"] == "https://azure.openai.azure.com/"
