"""Unit tests for ContextService."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from api.services.context_service import (
    ChunkResult,
    ContextService,
    _embedding_to_pgvector,
    _metadata_to_json,
)


@pytest.fixture
def context_service(mock_db_pool: MagicMock) -> ContextService:
    return ContextService(pool=mock_db_pool)


def test_embedding_to_pgvector() -> None:
    """Test _embedding_to_pgvector converts list to pgvector string."""
    embedding = [0.1, 0.2, 0.3]
    result = _embedding_to_pgvector(embedding)
    assert result == "[0.1,0.2,0.3]"


def test_metadata_to_json_none() -> None:
    """Test _metadata_to_json returns None for None input."""
    result = _metadata_to_json(None)
    assert result is None


def test_metadata_to_json_with_uuid() -> None:
    """Test _metadata_to_json serializes UUIDs."""
    test_uuid = uuid4()
    metadata = {"id": test_uuid, "name": "test"}
    result = _metadata_to_json(metadata)
    assert result is not None
    assert str(test_uuid) in result
    assert "test" in result


@pytest.mark.asyncio
async def test_upsert_session_summary(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test upsert_session_summary inserts or updates summary."""
    project_id = uuid4()
    session_id = uuid4()
    chunk_id = uuid4()
    embedding = [0.1] * 1536

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    mock_row = {"id": chunk_id}
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await context_service.upsert_session_summary(
        project_id=project_id,
        session_id=session_id,
        content="Session summary text",
        content_hash="abc123",
        embedding=embedding,
        token_count=50,
        metadata={"title": "Test Session"},
    )

    assert result == chunk_id
    conn.fetchrow.assert_called_once()


@pytest.mark.asyncio
async def test_insert_chunk(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test insert_chunk with deduplication."""
    project_id = uuid4()
    source_id = uuid4()
    chunk_id = uuid4()
    embedding = [0.1] * 1536

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    mock_row = {"id": chunk_id}
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await context_service.insert_chunk(
        project_id=project_id,
        source_type="message",
        source_id=source_id,
        chunk_index=0,
        content="Chunk text",
        content_hash="def456",
        embedding=embedding,
        token_count=25,
    )

    assert result == chunk_id
    conn.fetchrow.assert_called_once()


@pytest.mark.asyncio
async def test_search_chunks(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test search_chunks returns ChunkResult list."""
    project_id = uuid4()
    chunk_id = uuid4()
    source_id = uuid4()
    query_embedding = [0.1] * 1536
    now = datetime.now(timezone.utc)

    mock_rows = [
        {
            "id": chunk_id,
            "source_type": "session_summary",
            "source_id": source_id,
            "chunk_index": 0,
            "content": "Summary of the session",
            "score": 0.85,
            "metadata": '{"title": "Test"}',
            "created_at": now,
        }
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)

    results = await context_service.search_chunks(
        project_id=project_id,
        query_embedding=query_embedding,
        top_k=5,
        score_threshold=0.5,
    )

    assert len(results) == 1
    assert isinstance(results[0], ChunkResult)
    assert results[0].chunk_id == chunk_id
    assert results[0].score == 0.85
    assert results[0].source_type == "session_summary"


@pytest.mark.asyncio
async def test_search_chunks_empty(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test search_chunks returns empty list when no matches."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=[])

    results = await context_service.search_chunks(
        project_id=uuid4(),
        query_embedding=[0.1] * 1536,
    )

    assert results == []


@pytest.mark.asyncio
async def test_delete_chunks_for_source(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test delete_chunks_for_source returns count."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock(return_value="DELETE 3")

    count = await context_service.delete_chunks_for_source(
        source_type="message",
        source_id=uuid4(),
    )

    assert count == 3


@pytest.mark.asyncio
async def test_delete_chunks_for_source_none(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test delete_chunks_for_source returns 0 when none deleted."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock(return_value="DELETE 0")

    count = await context_service.delete_chunks_for_source(
        source_type="file",
        source_id=uuid4(),
    )

    assert count == 0


@pytest.mark.asyncio
async def test_get_chunk_count_for_project(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test get_chunk_count_for_project returns int."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    mock_row = {"count": 42}
    conn.fetchrow = AsyncMock(return_value=mock_row)

    count = await context_service.get_chunk_count_for_project(uuid4())

    assert count == 42


@pytest.mark.asyncio
async def test_get_chunk_count_for_project_empty(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test get_chunk_count_for_project returns 0 for empty project."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    mock_row = {"count": 0}
    conn.fetchrow = AsyncMock(return_value=mock_row)

    count = await context_service.get_chunk_count_for_project(uuid4())

    assert count == 0


@pytest.mark.asyncio
async def test_has_session_summary_true(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test has_session_summary returns True when summary exists."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value={"1": 1})  # Non-None row

    result = await context_service.has_session_summary(uuid4(), uuid4())

    assert result is True


@pytest.mark.asyncio
async def test_has_session_summary_false(context_service: ContextService, mock_db_pool: MagicMock) -> None:
    """Test has_session_summary returns False when no summary."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=None)  # No row found

    result = await context_service.has_session_summary(uuid4(), uuid4())

    assert result is False


def test_chunk_result_dataclass() -> None:
    """Test ChunkResult dataclass creation."""
    chunk_id = uuid4()
    source_id = uuid4()
    now = datetime.now(timezone.utc)

    result = ChunkResult(
        chunk_id=chunk_id,
        source_type="message",
        source_id=source_id,
        chunk_index=1,
        content="Test content",
        score=0.92,
        metadata={"key": "value"},
        created_at=now,
    )

    assert result.chunk_id == chunk_id
    assert result.score == 0.92
    assert result.metadata == {"key": "value"}
