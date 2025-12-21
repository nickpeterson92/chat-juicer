import datetime
import json

from unittest.mock import AsyncMock, MagicMock

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db
from api.middleware.exception_handlers import register_exception_handlers
from api.routes.v1.messages import router
from models.error_models import ErrorCode

SESSION_ID = "sess_123"
SESSION_UUID = "550e8400-e29b-41d4-a716-446655440000"


@pytest.fixture
def mock_db_pool() -> MagicMock:
    pool = MagicMock()

    cm = MagicMock()
    conn = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=conn)
    cm.__aexit__ = AsyncMock(return_value=None)
    pool.acquire.return_value = cm

    return pool


@pytest.fixture
def app(mock_db_pool: MagicMock) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/api/v1/sessions")

    app.dependency_overrides[get_db] = lambda: mock_db_pool
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.asyncio
async def test_list_messages_success(client: TestClient, mock_db_pool: MagicMock) -> None:
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value

    # 1. Fetch Session UUID
    conn.fetchrow.return_value = {"id": SESSION_UUID}

    # 2. Count messages
    conn.fetchval.return_value = 2

    # 3. Fetch messages
    now = datetime.datetime.now(datetime.timezone.utc)
    conn.fetch.return_value = [
        {
            "id": "msg_1",
            "role": "user",
            "content": "Hello",
            "created_at": now,
            "tool_call_id": None,
            "tool_name": None,
            "tool_arguments": None,
            "tool_result": None,
            "tool_success": None,
        },
        {
            "id": "msg_2",
            "role": "assistant",
            "content": "Hi!",
            "created_at": now,
            "tool_call_id": None,
            "tool_name": None,
            "tool_arguments": None,
            "tool_result": None,
            "tool_success": None,
        },
    ]

    response = client.get(f"/api/v1/sessions/{SESSION_ID}/messages")

    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 2
    assert data["pagination"]["total_count"] == 2
    assert data["messages"][0]["content"] == "Hello"


@pytest.mark.asyncio
async def test_list_messages_session_not_found(client: TestClient, mock_db_pool: MagicMock) -> None:
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value

    conn.fetchrow.return_value = None

    response = client.get(f"/api/v1/sessions/{SESSION_ID}/messages")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == ErrorCode.SESSION_NOT_FOUND


@pytest.mark.asyncio
async def test_list_messages_with_tools_and_json_parsing(client: TestClient, mock_db_pool: MagicMock) -> None:
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value

    conn.fetchrow.return_value = {"id": SESSION_UUID}
    conn.fetchval.return_value = 1

    now = datetime.datetime.now(datetime.timezone.utc)
    # Simulate DB storing JSON string for arguments
    tool_args = json.dumps({"query": "python"})

    conn.fetch.return_value = [
        {
            "id": "msg_tool",
            "role": "assistant",
            "content": None,
            "created_at": now,
            "tool_call_id": "call_123",
            "tool_name": "search",
            "tool_arguments": tool_args,  # Stringified JSON
            "tool_result": "Found python",
            "tool_success": True,
        }
    ]

    response = client.get(f"/api/v1/sessions/{SESSION_ID}/messages")

    assert response.status_code == 200
    data = response.json()
    msg = data["messages"][0]

    assert msg["tool_call_id"] == "call_123"
    assert msg["status"] == "completed"
    assert msg["tool_arguments"] == {"query": "python"}  # Should be parsed back to dict


@pytest.mark.asyncio
async def test_list_messages_pagination(client: TestClient, mock_db_pool: MagicMock) -> None:
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value

    conn.fetchrow.return_value = {"id": SESSION_UUID}
    conn.fetchval.return_value = 100
    conn.fetch.return_value = []  # Return empty for simplicity, checking pagination meta

    response = client.get(f"/api/v1/sessions/{SESSION_ID}/messages?limit=10&offset=50")

    assert response.status_code == 200
    data = response.json()
    assert data["pagination"]["total_count"] == 100
    assert data["pagination"]["limit"] == 10
    assert data["pagination"]["offset"] == 50
    assert data["pagination"]["has_more"] is True  # 50 + 10 < 100
