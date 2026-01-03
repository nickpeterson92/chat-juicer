"""Unit tests for SummarizationService."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from api.services.summarization_service import (
    SUMMARY_TURN_THRESHOLD,
    SummarizationService,
)


@pytest.fixture
def summarization_service(mock_db_pool: MagicMock) -> SummarizationService:
    # Pass a mock client to avoid lazy initialization
    mock_client = MagicMock()
    return SummarizationService(pool=mock_db_pool, client=mock_client)


@pytest.mark.asyncio
async def test_should_summarize_at_threshold(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test should_summarize returns True at threshold (10, 20, 30...)."""
    session_id = "chat_test123"

    mock_row = {
        "project_id": uuid4(),
        "turn_count": SUMMARY_TURN_THRESHOLD,  # 10
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await summarization_service.should_summarize(session_id)
    assert result is True


@pytest.mark.asyncio
async def test_should_summarize_not_at_threshold(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test should_summarize returns False when not at threshold."""
    mock_row = {
        "project_id": uuid4(),
        "turn_count": 7,  # Not at threshold
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await summarization_service.should_summarize("chat_test")
    assert result is False


@pytest.mark.asyncio
async def test_should_summarize_no_project(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test should_summarize returns False when no project_id."""
    mock_row = {
        "project_id": None,
        "turn_count": 10,
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await summarization_service.should_summarize("chat_test")
    assert result is False


@pytest.mark.asyncio
async def test_should_summarize_session_not_found(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test should_summarize returns False when session not found."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=None)

    result = await summarization_service.should_summarize("nonexistent")
    assert result is False


@pytest.mark.asyncio
async def test_should_summarize_zero_turns(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test should_summarize returns False at turn_count 0."""
    mock_row = {
        "project_id": uuid4(),
        "turn_count": 0,
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await summarization_service.should_summarize("chat_test")
    assert result is False


@pytest.mark.asyncio
async def test_generate_summary_success(summarization_service: SummarizationService, mock_db_pool: MagicMock) -> None:
    """Test generate_summary returns LLM-generated summary."""
    session_id = "chat_test123"

    # Mock message rows
    mock_messages = [
        {"role": "user", "content": "Hello, I need help with Python."},
        {"role": "assistant", "content": "Sure! What do you need help with?"},
        {"role": "user", "content": "I want to learn about async/await."},
        {"role": "assistant", "content": "Async/await is a way to write concurrent code..."},
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_messages)

    # Mock OpenAI client response
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "User asked about Python async/await."

    summarization_service._client.chat.completions.create = AsyncMock(return_value=mock_response)

    result = await summarization_service.generate_summary(session_id)

    assert result == "User asked about Python async/await."
    summarization_service._client.chat.completions.create.assert_called_once()


@pytest.mark.asyncio
async def test_generate_summary_no_messages(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test generate_summary returns None when no messages."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=[])

    result = await summarization_service.generate_summary("chat_empty")
    assert result is None


@pytest.mark.asyncio
async def test_generate_summary_llm_error(summarization_service: SummarizationService, mock_db_pool: MagicMock) -> None:
    """Test generate_summary returns None on LLM error."""
    mock_messages = [{"role": "user", "content": "Test message"}]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_messages)

    # Mock LLM error
    summarization_service._client.chat.completions.create = AsyncMock(side_effect=Exception("API error"))

    result = await summarization_service.generate_summary("chat_test")
    assert result is None


@pytest.mark.asyncio
async def test_get_session_for_embedding_found(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test get_session_for_embedding returns session dict."""
    session_uuid = uuid4()
    project_uuid = uuid4()

    mock_row = {
        "id": session_uuid,
        "session_id": "chat_test",
        "project_id": project_uuid,
        "title": "Test Session",
        "turn_count": 15,
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await summarization_service.get_session_for_embedding("chat_test")

    assert result is not None
    assert result["id"] == session_uuid
    assert result["project_id"] == project_uuid
    assert result["turn_count"] == 15


@pytest.mark.asyncio
async def test_get_session_for_embedding_not_found(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test get_session_for_embedding returns None when not found."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=None)

    result = await summarization_service.get_session_for_embedding("nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_find_sessions_needing_summary(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test find_sessions_needing_summary returns list."""
    mock_rows = [
        {
            "id": uuid4(),
            "session_id": "chat_1",
            "project_id": uuid4(),
            "title": "Session 1",
            "turn_count": 10,
        },
        {
            "id": uuid4(),
            "session_id": "chat_2",
            "project_id": uuid4(),
            "title": "Session 2",
            "turn_count": 20,
        },
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)

    result = await summarization_service.find_sessions_needing_summary(limit=5)

    assert len(result) == 2
    assert result[0]["session_id"] == "chat_1"
    assert result[1]["turn_count"] == 20


@pytest.mark.asyncio
async def test_find_sessions_needing_summary_empty(
    summarization_service: SummarizationService, mock_db_pool: MagicMock
) -> None:
    """Test find_sessions_needing_summary returns empty list."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=[])

    result = await summarization_service.find_sessions_needing_summary()
    assert result == []


@pytest.mark.asyncio
async def test_get_client_lazy_init(mock_db_pool: MagicMock) -> None:
    """Test _get_client lazily initializes the client."""
    # Create service WITHOUT pre-injected client
    service = SummarizationService(pool=mock_db_pool)
    assert service._client is None

    # Mock the client factory
    with patch("api.services.summarization_service.create_openai_client") as mock_factory:
        mock_client = MagicMock()
        mock_factory.return_value = mock_client

        result = await service._get_client()

        assert result == mock_client
        assert service._client == mock_client
        mock_factory.assert_called_once()
