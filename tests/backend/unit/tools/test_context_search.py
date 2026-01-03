"""Unit tests for context search tool."""

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
    from unittest.mock import MagicMock

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
    from unittest.mock import MagicMock

    mock_pool = MagicMock()

    result = await _search_project_context_impl(
        query="test",
        project_id="not-a-valid-uuid",
        pool=mock_pool,
    )

    assert "Invalid project_id format" in result
