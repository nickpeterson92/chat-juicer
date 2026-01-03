"""Unit tests for context search tool."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from tools.context_search import (
    _search_project_context_impl,
    search_project_context,
)


@pytest.mark.asyncio
async def test_search_project_context_placeholder() -> None:
    """Test the placeholder function returns error message."""
    result = await search_project_context("test query")
    assert "requires session context wrapper" in result


@pytest.mark.asyncio
async def test_search_project_context_impl_no_project() -> None:
    """Test impl returns helpful message when no project_id."""
    mock_pool = MagicMock()

    result = await _search_project_context_impl(
        query="test",
        project_id="",
        pool=mock_pool,
    )

    assert "No project associated" in result


@pytest.mark.asyncio
async def test_search_project_context_impl_invalid_uuid() -> None:
    """Test impl returns error for invalid project_id format."""
    mock_pool = MagicMock()

    result = await _search_project_context_impl(
        query="test",
        project_id="not-a-valid-uuid",
        pool=mock_pool,
    )

    assert "Invalid project_id format" in result


@pytest.mark.asyncio
async def test_search_project_context_impl_no_results() -> None:
    """Test impl returns message when no matching chunks."""
    mock_pool = MagicMock()
    project_id = str(uuid4())

    with (
        patch("tools.context_search.ContextService") as MockContextService,
        patch("tools.context_search.get_embedding_service") as mock_get_embedding,
    ):
        # Mock embedding service
        mock_embedding_service = MagicMock()
        mock_embedding_service.embed_text = AsyncMock(return_value=[0.1] * 1536)
        mock_get_embedding.return_value = mock_embedding_service

        # Mock context service
        mock_context = MockContextService.return_value
        mock_context.search_chunks = AsyncMock(return_value=[])

        result = await _search_project_context_impl(
            query="test query",
            project_id=project_id,
            pool=mock_pool,
            min_score=0.8,
        )

        assert "No relevant context found" in result
        assert "min_score=0.8" in result


@pytest.mark.asyncio
async def test_search_project_context_impl_with_results() -> None:
    """Test impl returns formatted results."""
    mock_pool = MagicMock()
    project_id = str(uuid4())

    with (
        patch("tools.context_search.ContextService") as MockContextService,
        patch("tools.context_search.get_embedding_service") as mock_get_embedding,
    ):
        # Mock embedding service
        mock_embedding_service = MagicMock()
        mock_embedding_service.embed_text = AsyncMock(return_value=[0.1] * 1536)
        mock_get_embedding.return_value = mock_embedding_service

        # Mock search results
        mock_chunk = MagicMock()
        mock_chunk.source_type = "session_summary"
        mock_chunk.score = 0.92
        mock_chunk.content = "This is a relevant summary."

        mock_context = MockContextService.return_value
        mock_context.search_chunks = AsyncMock(return_value=[mock_chunk])

        result = await _search_project_context_impl(
            query="test query",
            project_id=project_id,
            pool=mock_pool,
        )

        assert "Found 1 relevant context chunks" in result
        assert "Session Summary" in result
        assert "0.92" in result
        assert "This is a relevant summary" in result


@pytest.mark.asyncio
async def test_search_project_context_impl_clamps_top_k() -> None:
    """Test impl clamps top_k to 1-20 range."""
    mock_pool = MagicMock()
    project_id = str(uuid4())

    with (
        patch("tools.context_search.ContextService") as MockContextService,
        patch("tools.context_search.get_embedding_service") as mock_get_embedding,
    ):
        mock_embedding_service = MagicMock()
        mock_embedding_service.embed_text = AsyncMock(return_value=[0.1] * 1536)
        mock_get_embedding.return_value = mock_embedding_service

        mock_context = MockContextService.return_value
        mock_context.search_chunks = AsyncMock(return_value=[])

        # Test with top_k=100 (should be clamped to 20)
        await _search_project_context_impl(
            query="test",
            project_id=project_id,
            pool=mock_pool,
            top_k=100,
        )

        # Check the call was made with clamped value
        call_args = mock_context.search_chunks.call_args
        assert call_args.kwargs["top_k"] == 20


@pytest.mark.asyncio
async def test_search_project_context_impl_clamps_min_score() -> None:
    """Test impl clamps min_score to 0-1 range."""
    mock_pool = MagicMock()
    project_id = str(uuid4())

    with (
        patch("tools.context_search.ContextService") as MockContextService,
        patch("tools.context_search.get_embedding_service") as mock_get_embedding,
    ):
        mock_embedding_service = MagicMock()
        mock_embedding_service.embed_text = AsyncMock(return_value=[0.1] * 1536)
        mock_get_embedding.return_value = mock_embedding_service

        mock_context = MockContextService.return_value
        mock_context.search_chunks = AsyncMock(return_value=[])

        # Test with min_score=2.0 (should be clamped to 1.0)
        await _search_project_context_impl(
            query="test",
            project_id=project_id,
            pool=mock_pool,
            min_score=2.0,
        )

        call_args = mock_context.search_chunks.call_args
        assert call_args.kwargs["score_threshold"] == 1.0


@pytest.mark.asyncio
async def test_search_project_context_impl_multiple_source_types() -> None:
    """Test impl formats different source types correctly."""
    mock_pool = MagicMock()
    project_id = str(uuid4())

    with (
        patch("tools.context_search.ContextService") as MockContextService,
        patch("tools.context_search.get_embedding_service") as mock_get_embedding,
    ):
        mock_embedding_service = MagicMock()
        mock_embedding_service.embed_text = AsyncMock(return_value=[0.1] * 1536)
        mock_get_embedding.return_value = mock_embedding_service

        # Create mock results with different source types
        mock_chunks = [
            MagicMock(source_type="session_summary", score=0.9, content="Summary"),
            MagicMock(source_type="message", score=0.85, content="Message text"),
            MagicMock(source_type="file", score=0.8, content="File content"),
        ]

        mock_context = MockContextService.return_value
        mock_context.search_chunks = AsyncMock(return_value=mock_chunks)

        result = await _search_project_context_impl(
            query="test",
            project_id=project_id,
            pool=mock_pool,
        )

        assert "Session Summary" in result
        assert "Message" in result
        assert "File" in result
        assert "Found 3 relevant context chunks" in result
