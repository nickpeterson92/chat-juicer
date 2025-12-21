import json

from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock
from uuid import uuid4

import pytest

from api.services.session_service import SessionService
from core.constants import DEFAULT_MODEL


@pytest.fixture
def session_service(mock_db_pool: Mock) -> SessionService:
    return SessionService(pool=mock_db_pool)


@pytest.mark.asyncio
async def test_create_session(session_service: SessionService, mock_db_pool: Mock) -> None:
    """Test creating a new session."""
    user_id = uuid4()

    # Mock DB return
    mock_row = {
        "id": uuid4(),
        "session_id": "chat_12345",
        "title": None,
        "model": DEFAULT_MODEL,
        "mcp_config": json.dumps(["sequential-thinking", "fetch"]),
        "reasoning_effort": "medium",
        "pinned": False,
        "is_named": False,
        "message_count": 0,
        "turn_count": 0,
        "total_tokens": 0,
        "created_at": datetime.now(timezone.utc),
        "last_used_at": datetime.now(timezone.utc),
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow.return_value = mock_row

    result = await session_service.create_session(user_id=user_id)

    assert result["session_id"] == "chat_12345"
    assert result["model"] == DEFAULT_MODEL
    assert result["mcp_config"] == ["sequential-thinking", "fetch"]

    # Verify DB call
    conn.fetchrow.assert_called_once()
    args = conn.fetchrow.call_args[0]
    assert "INSERT INTO sessions" in args[0]
    assert args[1] == user_id


@pytest.mark.asyncio
async def test_get_session_found(session_service: SessionService, mock_db_pool: Mock) -> None:
    """Test retrieving an existing session."""
    user_id = uuid4()
    session_id = "chat_abc"

    mock_row = {
        "id": uuid4(),
        "session_id": session_id,
        "title": "Test Chat",
        "model": "gpt-4o",
        "mcp_config": None,
        "reasoning_effort": "medium",
        "pinned": True,
        "is_named": True,
        "message_count": 5,
        "turn_count": 2,
        "total_tokens": 100,
        "created_at": datetime.now(timezone.utc),
        "last_used_at": datetime.now(timezone.utc),
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow.return_value = mock_row

    result = await session_service.get_session(user_id, session_id)

    assert result is not None
    assert result["session_id"] == session_id
    assert result["title"] == "Test Chat"
    assert result["pinned"] is True


@pytest.mark.asyncio
async def test_get_session_not_found(session_service: SessionService, mock_db_pool: Mock) -> None:
    """Test get session returns None if not found."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow.return_value = None

    result = await session_service.get_session(uuid4(), "nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_list_sessions(session_service: SessionService, mock_db_pool: Mock) -> None:
    """Test listing sessions with pagination."""
    user_id = uuid4()

    mock_rows = [
        {
            "id": uuid4(),
            "session_id": f"chat_{i}",
            "title": f"Chat {i}",
            "model": "gpt-4o",
            "mcp_config": None,
            "reasoning_effort": "medium",
            "pinned": False,
            "is_named": True,
            "message_count": i,
            "turn_count": i,
            "total_tokens": i * 100,
            "created_at": datetime.now(timezone.utc),
            "last_used_at": datetime.now(timezone.utc),
        }
        for i in range(2)
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch.return_value = mock_rows
    conn.fetchval.return_value = 10  # Total count

    result = await session_service.list_sessions(user_id, offset=0, limit=2)

    assert len(result["sessions"]) == 2
    assert result["total_count"] == 10
    assert result["has_more"] is True  # 2 < 10


@pytest.mark.asyncio
async def test_update_session(session_service: SessionService, mock_db_pool: Mock) -> None:
    """Test updating allowed session fields."""
    user_id = uuid4()
    session_id = "chat_update"

    mock_row = {
        "id": uuid4(),
        "session_id": session_id,
        "title": "New Title",
        "model": "gpt-4o",
        "mcp_config": None,
        "reasoning_effort": "medium",  # Default for mock
        "pinned": False,
        "is_named": True,
        "message_count": 0,
        "turn_count": 0,
        "total_tokens": 0,
        "created_at": datetime.now(timezone.utc),
        "last_used_at": datetime.now(timezone.utc),
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow.return_value = mock_row

    result = await session_service.update_session(user_id, session_id, title="New Title", invalid_field="ignore_me")

    assert result["title"] == "New Title"

    # Check that update query only included allowed fields
    query = conn.fetchrow.call_args[0][0]
    assert "title = $3" in query
    assert "invalid_field" not in query
    assert "last_used_at" in query  # Always updated


@pytest.mark.asyncio
async def test_delete_session(
    session_service: SessionService, mock_db_pool: Mock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test deleting a session and cleaning up files."""
    user_id = uuid4()
    session_id = "chat_delete"

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute.return_value = "DELETE 1"

    # Mock file cleanup
    mock_rmtree = MagicMock()
    # Mock Path.exists
    mock_path = MagicMock()
    mock_path.exists.return_value = True

    # We need to patch DATA_FILES_PATH / session_id
    # Since DATA_FILES_PATH is imported in service, we patch shutil.rmtree
    # and maybe the path check if possible, or just rely on rmtree being called if exists

    monkeypatch.setattr("api.services.session_service.shutil.rmtree", mock_rmtree)

    # Mock the Path object creation in the service
    # The service does: session_dir = DATA_FILES_PATH / session_id
    # We can mock DATA_FILES_PATH in the service module
    mock_data_path = MagicMock()
    mock_data_path.__truediv__.return_value = mock_path
    monkeypatch.setattr("api.services.session_service.DATA_FILES_PATH", mock_data_path)

    result = await session_service.delete_session(user_id, session_id)

    assert result is True
    conn.execute.assert_called_once()
    mock_rmtree.assert_called_once_with(mock_path)


@pytest.mark.asyncio
async def test_get_session_with_history(session_service: SessionService, mock_db_pool: Mock) -> None:
    """Test retrieving session with message history and files."""
    user_id = uuid4()
    session_id = "chat_hist"

    # 1. Mock get_session (which calls fetchrow)
    # 2. Mock messages fetch
    # 3. Mock files fetch
    # 4. Mock count fetchval

    # Since get_session calls acquire() and then get_session_with_history calls acquire() again,
    # and mock_db_pool.acquire returns the SAME connection mock usually in basics, we need to handle sequential calls.
    # unittest.mock.MagicMock will simply return the same or new mocks depending on config.
    # Let's set up the connection mock to handle multiple calls.

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value

    session_row = {
        "id": str(uuid4()),  # row_to_message expects UUID string or obj?
        # In service: session_uuid = UUID(session["id"]) so session["id"] must be str.
        # session_service._row_to_session converts uuid to str.
        # But fetchrow returns Record (dict-like).
        # In _row_to_session: row["id"] is usually UUID object from asyncpg.
        "session_id": session_id,
        "title": "History Chat",
        "model": "gpt-4o",
        "mcp_config": None,
        "reasoning_effort": "medium",
        "pinned": False,
        "is_named": False,
        "message_count": 10,
        "turn_count": 5,
        "total_tokens": 500,
        "created_at": datetime.now(timezone.utc),
        "last_used_at": datetime.now(timezone.utc),
    }

    conn.fetchrow.return_value = session_row

    # For fetch(), we have two calls: messages and files.
    # side_effect for fetch can return the lists sequentially

    # Message row mock needed for row_to_message
    msg_row = {
        "id": uuid4(),
        "session_id": uuid4(),
        "role": "user",
        "content": "Hello",
        "created_at": datetime.now(timezone.utc),
        "prompt_tokens": 10,
        "completion_tokens": 0,
        "total_tokens": 10,
        "model": "gpt-4o",
        "tool_calls": None,
        "tool_call_id": None,
        "tool_name": None,
        "tool_arguments": None,
        "tool_result": None,
        "tool_success": None,
        "metadata": "{}",
    }

    file_row = {
        "id": uuid4(),
        "filename": "test.txt",
        "size_bytes": 123,
        "folder": "uploads",
        "uploaded_at": datetime.now(timezone.utc),
    }

    conn.fetch.side_effect = [
        [msg_row],  # messages
        [file_row],  # files
    ]

    conn.fetchval.return_value = 1  # Total count

    result = await session_service.get_session_with_history(user_id, session_id)

    assert result is not None
    assert result["session"]["session_id"] == session_id
    assert len(result["full_history"]) == 1
    assert len(result["files"]) == 1
    assert result["files"][0]["name"] == "test.txt"


def test_get_model_limit(session_service: SessionService) -> None:
    """Test token limit logic."""
    # Known model
    assert session_service._get_model_limit("gpt-4o") == 128000

    # Partial match
    assert session_service._get_model_limit("azure-gpt-4o-deployment") == 128000

    # Unknown/Default
    assert session_service._get_model_limit("unknown-model") == 15000
