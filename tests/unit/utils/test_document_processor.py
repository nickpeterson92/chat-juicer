"""Tests for document processor utilities.

Tests document conversion and summarization functionality.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from utils.document_processor import get_markitdown_converter, summarize_content


class TestSummarizeContent:
    """Tests for summarize_content function."""

    @pytest.mark.asyncio
    async def test_summarize_content_success(self) -> None:
        """Test successful content summarization."""
        mock_result = Mock()
        mock_result.final_output = "This is a summary of the document."

        with patch("utils.document_processor.Agent") as mock_agent, \
             patch("utils.document_processor.Runner") as mock_runner, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.count_tokens") as mock_count_tokens:

            # Setup mocks
            mock_settings.return_value.azure_openai_deployment = "gpt-5-mini"
            mock_runner.run = AsyncMock(return_value=mock_result)
            mock_count_tokens.return_value = {"exact_tokens": 1000}

            content = "This is a very long document content that needs to be summarized."
            result = await summarize_content(content, file_name="test.txt")

            assert result == "This is a summary of the document."
            mock_agent.assert_called_once()
            mock_runner.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_summarize_content_empty_response(self) -> None:
        """Test summarization with empty response returns original."""
        mock_result = Mock()
        mock_result.final_output = ""

        with patch("utils.document_processor.Agent"), \
             patch("utils.document_processor.Runner") as mock_runner, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.count_tokens"):

            mock_settings.return_value.azure_openai_deployment = "gpt-5-mini"
            mock_runner.run = AsyncMock(return_value=mock_result)

            content = "Original content"
            result = await summarize_content(content, file_name="test.txt")

            # Should return original content when summary is empty
            assert result == content

    @pytest.mark.asyncio
    async def test_summarize_content_null_response(self) -> None:
        """Test summarization with null response returns original."""
        mock_result = Mock()
        mock_result.final_output = None

        with patch("utils.document_processor.Agent"), \
             patch("utils.document_processor.Runner") as mock_runner, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.count_tokens"):

            mock_settings.return_value.azure_openai_deployment = "gpt-5-mini"
            mock_runner.run = AsyncMock(return_value=mock_result)

            content = "Original content"
            result = await summarize_content(content, file_name="test.txt")

            assert result == content

    @pytest.mark.asyncio
    async def test_summarize_content_exception(self) -> None:
        """Test summarization with exception returns original content."""
        with patch("utils.document_processor.Agent") as mock_agent:
            mock_agent.side_effect = Exception("Simulated error")

            content = "Original content"
            result = await summarize_content(content, file_name="test.txt")

            # Should return original content on error
            assert result == content

    @pytest.mark.asyncio
    async def test_summarize_content_with_custom_model(self) -> None:
        """Test summarization with custom model."""
        mock_result = Mock()
        mock_result.final_output = "Summary"

        with patch("utils.document_processor.Agent"), \
             patch("utils.document_processor.Runner") as mock_runner, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.count_tokens") as mock_count_tokens:

            mock_settings.return_value.azure_openai_deployment = "custom-model"
            mock_runner.run = AsyncMock(return_value=mock_result)
            mock_count_tokens.return_value = {"exact_tokens": 500}

            result = await summarize_content("Content", file_name="doc.txt", model="custom-model")

            assert result == "Summary"


class TestGetMarkitdownConverter:
    """Tests for get_markitdown_converter function."""

    def test_get_converter_cached(self) -> None:
        """Test that converter is cached after first call."""
        # Clear cache first
        from utils.document_processor import _converter_cache
        _converter_cache.clear()

        mock_converter = Mock()

        with patch("utils.document_processor._MarkItDownAvailable", True), \
             patch("utils.document_processor._MarkItDown") as mock_markitdown, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.create_sync_openai_client"):

            mock_settings.return_value.api_provider = "azure"
            mock_settings.return_value.azure_openai_api_key = "test-key"
            mock_settings.return_value.azure_endpoint_str = "https://test.openai.azure.com/"
            mock_settings.return_value.azure_openai_deployment = "gpt-5-mini"
            mock_markitdown.return_value = mock_converter

            # First call
            result1 = get_markitdown_converter()
            # Second call should return cached
            result2 = get_markitdown_converter()

            assert result1 is mock_converter
            assert result2 is mock_converter
            # Should only initialize once
            mock_markitdown.assert_called_once()

    def test_get_converter_not_available(self) -> None:
        """Test when MarkItDown is not installed."""
        from utils.document_processor import _converter_cache
        _converter_cache.clear()

        with patch("utils.document_processor._MarkItDownAvailable", False):
            result = get_markitdown_converter()
            assert result is None

    def test_get_converter_azure_provider(self) -> None:
        """Test converter initialization with Azure provider."""
        from utils.document_processor import _converter_cache
        _converter_cache.clear()

        mock_converter = Mock()

        with patch("utils.document_processor._MarkItDownAvailable", True), \
             patch("utils.document_processor._MarkItDown") as mock_markitdown, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.create_sync_openai_client") as mock_client:

            mock_settings.return_value.api_provider = "azure"
            mock_settings.return_value.azure_openai_api_key = "azure-key"
            mock_settings.return_value.azure_endpoint_str = "https://azure.openai.azure.com/"
            mock_settings.return_value.azure_openai_deployment = "gpt-5-mini"
            mock_markitdown.return_value = mock_converter

            result = get_markitdown_converter()

            assert result is mock_converter
            mock_client.assert_called_once()
            mock_markitdown.assert_called_once()

    def test_get_converter_openai_provider(self) -> None:
        """Test converter initialization with OpenAI provider."""
        from utils.document_processor import _converter_cache
        _converter_cache.clear()

        mock_converter = Mock()

        with patch("utils.document_processor._MarkItDownAvailable", True), \
             patch("utils.document_processor._MarkItDown") as mock_markitdown, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.create_sync_openai_client") as mock_client:

            mock_settings.return_value.api_provider = "openai"
            mock_settings.return_value.openai_api_key = "openai-key"
            mock_settings.return_value.openai_model = "gpt-4"
            mock_markitdown.return_value = mock_converter

            result = get_markitdown_converter()

            assert result is mock_converter
            mock_client.assert_called_once()

    def test_get_converter_unknown_provider(self) -> None:
        """Test converter with unknown API provider."""
        from utils.document_processor import _converter_cache
        _converter_cache.clear()

        with patch("utils.document_processor._MarkItDownAvailable", True), \
             patch("utils.document_processor.get_settings") as mock_settings:

            mock_settings.return_value.api_provider = "unknown"

            result = get_markitdown_converter()

            assert result is None

    def test_get_converter_initialization_error(self) -> None:
        """Test converter initialization with exception."""
        from utils.document_processor import _converter_cache
        _converter_cache.clear()

        with patch("utils.document_processor._MarkItDownAvailable", True), \
             patch("utils.document_processor._MarkItDown") as mock_markitdown, \
             patch("utils.document_processor.get_settings") as mock_settings, \
             patch("utils.document_processor.create_sync_openai_client"):

            mock_settings.return_value.api_provider = "azure"
            mock_settings.return_value.azure_openai_api_key = "key"
            mock_settings.return_value.azure_endpoint_str = "endpoint"
            mock_settings.return_value.azure_openai_deployment = "model"
            mock_markitdown.side_effect = Exception("Init failed")

            result = get_markitdown_converter()

            assert result is None
