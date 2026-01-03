"""Unit tests for PostgresSession."""

import json

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import asyncpg
import pytest

from api.services.postgres_session import PostgresSession, _parse_json_item


@pytest.fixture
def postgres_session(mock_db_pool: MagicMock) -> PostgresSession:
    session_id = "chat_test123"
    session_uuid = uuid4()
    return PostgresSession(session_id, session_uuid, mock_db_pool)


@pytest.mark.asyncio
async def test_get_items_returns_parsed_json(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test get_items returns JSON-parsed items in order."""
    mock_rows = [
        {"content": json.dumps({"role": "user", "content": "Hello"})},
        {"content": json.dumps({"role": "assistant", "content": "Hi there!"})},
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)

    items = await postgres_session.get_items()

    assert len(items) == 2
    assert items[0]["role"] == "user"
    assert items[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_get_items_with_limit(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test get_items with limit returns latest N items in chronological order."""
    # Mock returns in DESC order (latest first), then reversed
    mock_rows = [
        {"content": json.dumps({"role": "assistant", "content": "Response 2"})},
        {"content": json.dumps({"role": "user", "content": "Query 2"})},
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)

    items = await postgres_session.get_items(limit=2)

    # After reversal, should be chronological
    assert len(items) == 2
    assert items[0]["content"] == "Query 2"
    assert items[1]["content"] == "Response 2"


@pytest.mark.asyncio
async def test_get_items_skips_invalid_json(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test get_items skips rows with invalid JSON."""
    mock_rows = [
        {"content": json.dumps({"role": "user", "content": "Valid"})},
        {"content": "not valid json {{{"},
        {"content": json.dumps({"role": "assistant", "content": "Also valid"})},
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)

    items = await postgres_session.get_items()

    assert len(items) == 2  # Skipped invalid JSON


@pytest.mark.asyncio
async def test_get_items_empty(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test get_items returns empty list when no items."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=[])

    items = await postgres_session.get_items()
    assert items == []


@pytest.mark.asyncio
async def test_add_items_inserts_json(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test add_items inserts items as JSON blobs."""
    items = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi!"},
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock()

    await postgres_session.add_items(items)

    # Should have 2 execute calls (one per item)
    assert conn.execute.call_count == 2


@pytest.mark.asyncio
async def test_add_items_empty_list(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test add_items with empty list does nothing."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock()

    await postgres_session.add_items([])

    conn.execute.assert_not_called()


@pytest.mark.asyncio
async def test_add_items_skips_unserializable(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test add_items skips items that can't be serialized."""

    # Create an object that can't be JSON serialized
    class Unserializable:
        pass

    items = [
        {"role": "user", "content": "Valid"},
        Unserializable(),
        {"role": "assistant", "content": "Also valid"},
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock()

    await postgres_session.add_items(items)

    # Only 2 valid items should be inserted
    assert conn.execute.call_count == 2


@pytest.mark.asyncio
async def test_add_items_handles_foreign_key_violation(
    postgres_session: PostgresSession, mock_db_pool: MagicMock
) -> None:
    """Test add_items silently skips on ForeignKeyViolation (deleted session)."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value

    # Simulate ForeignKeyViolation at transaction level
    conn.transaction.return_value.__aenter__.side_effect = asyncpg.ForeignKeyViolationError("null value in column")

    # Should not raise
    await postgres_session.add_items([{"role": "user", "content": "Test"}])


@pytest.mark.asyncio
async def test_pop_item_returns_and_deletes(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test pop_item returns and deletes the most recent item."""
    mock_row = {"content": json.dumps({"role": "assistant", "content": "Last response"})}

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    item = await postgres_session.pop_item()

    assert item is not None
    assert item["role"] == "assistant"
    assert item["content"] == "Last response"


@pytest.mark.asyncio
async def test_pop_item_returns_none_when_empty(postgres_session: PostgresSession, mock_db_pool: MagicMock) -> None:
    """Test pop_item returns None when no items."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=None)

    item = await postgres_session.pop_item()
    assert item is None


@pytest.mark.asyncio
async def test_pop_item_returns_none_on_invalid_json(
    postgres_session: PostgresSession, mock_db_pool: MagicMock
) -> None:
    """Test pop_item returns None if stored JSON is invalid."""
    mock_row = {"content": "not valid json"}

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    item = await postgres_session.pop_item()
    assert item is None


def test_parse_json_item_valid() -> None:
    """Test _parse_json_item with valid JSON."""
    content = json.dumps({"role": "user", "content": "Test"})
    result = _parse_json_item(content, "test_session")

    assert result is not None
    assert result["role"] == "user"


def test_parse_json_item_invalid() -> None:
    """Test _parse_json_item returns None for invalid JSON."""
    result = _parse_json_item("not json {{{", "test_session")
    assert result is None
