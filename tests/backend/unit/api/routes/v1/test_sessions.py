from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db, get_file_service, get_session_service
from api.middleware.exception_handlers import register_exception_handlers
from api.routes.v1.sessions import router

# Test Data
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
SESSION_ID = "sess_123"
SESSION_UUID = UUID("00000000-0000-0000-0000-000000000002")


@pytest.fixture
def mock_session_service() -> AsyncMock:
    service = AsyncMock()
    return service


@pytest.fixture
def mock_file_service() -> MagicMock:
    service = MagicMock()
    return service


@pytest.fixture
def mock_db_pool() -> MagicMock:
    pool = MagicMock()  # Not AsyncMock, acquire is sync returning context mgr

    # Create the context manager mock
    cm = MagicMock()
    connection = AsyncMock()

    # Fix nested transaction mock - MUST be sync method returning CM
    transaction_method = MagicMock()
    transaction_cm = MagicMock()
    transaction_cm.__aenter__ = AsyncMock(return_value=None)
    transaction_cm.__aexit__ = AsyncMock(return_value=None)
    transaction_method.return_value = transaction_cm

    connection.transaction = transaction_method

    # __aenter__ must be a coroutine for async with
    cm.__aenter__ = AsyncMock(return_value=connection)
    cm.__aexit__ = AsyncMock(return_value=None)

    pool.acquire.return_value = cm
    return pool


@pytest.fixture
def app(mock_session_service: AsyncMock, mock_file_service: MagicMock, mock_db_pool: MagicMock) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)  # Add handlers so AppExceptions get converted to JSON
    app.include_router(router, prefix="/api/v1/sessions")

    app.dependency_overrides[get_session_service] = lambda: mock_session_service
    app.dependency_overrides[get_file_service] = lambda: mock_file_service
    app.dependency_overrides[get_db] = lambda: mock_db_pool

    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def mock_user_id() -> Generator[AsyncMock, None, None]:
    with patch("api.routes.v1.sessions.get_default_user_id", new_callable=AsyncMock) as mock:
        mock.return_value = USER_ID
        yield mock


def test_list_sessions(client: TestClient, mock_session_service: AsyncMock, mock_user_id: AsyncMock) -> None:
    mock_session_service.list_sessions.return_value = {
        "sessions": [
            {
                "id": str(SESSION_UUID),
                "session_id": SESSION_ID,
                "title": "Test Session",
                "model": "gpt-4o",
                "message_count": 5,
                "reasoning_effort": "medium",
                "accumulated_tool_tokens": 0,
                "total_tokens": 100,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }
        ],
        "total_count": 1,
        "has_more": False,
    }

    response = client.get("/api/v1/sessions")

    assert response.status_code == 200
    data = response.json()
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["session_id"] == SESSION_ID
    assert data["pagination"]["total_count"] == 1

    # Verify default user ID was used
    mock_user_id.assert_called_once()
    mock_session_service.list_sessions.assert_called_with(USER_ID, 0, 50)


def test_create_session(
    client: TestClient,
    mock_session_service: AsyncMock,
    mock_file_service: MagicMock,
    mock_user_id: AsyncMock,
) -> None:
    mock_session_service.create_session.return_value = {
        "id": str(SESSION_UUID),
        "session_id": SESSION_ID,
        "title": "New Session",
        "model": "gpt-4o",
        "reasoning_effort": "medium",
        "message_count": 0,
        "accumulated_tool_tokens": 0,
        "total_tokens": 0,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }

    payload = {"title": "New Session", "model": "gpt-4o", "reasoning_effort": "medium"}

    response = client.post("/api/v1/sessions", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["session_id"] == SESSION_ID
    assert data["title"] == "New Session"

    mock_session_service.create_session.assert_called_with(
        user_id=USER_ID, title="New Session", model="gpt-4o", mcp_config=None, reasoning_effort="medium"
    )
    # verify file service init workspace
    mock_file_service.init_session_workspace.assert_called_once()


def test_get_session(client: TestClient, mock_session_service: AsyncMock, mock_user_id: AsyncMock) -> None:
    mock_session_service.get_session_with_history.return_value = {
        "session": {
            "id": str(SESSION_UUID),
            "session_id": SESSION_ID,
            "title": "Test",
            "model": "gpt-4",
            "message_count": 10,
            "reasoning_effort": "medium",
            "accumulated_tool_tokens": 0,
            "total_tokens": 100,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        },
        "full_history": [],
        "files": [],
        "has_more": False,
        "loaded_count": 0,
        "message_count": 10,
    }

    response = client.get(f"/api/v1/sessions/{SESSION_ID}")

    assert response.status_code == 200
    data = response.json()
    assert data["session"]["session_id"] == SESSION_ID

    mock_session_service.get_session_with_history.assert_called_with(USER_ID, SESSION_ID)


def test_get_session_not_found(client: TestClient, mock_session_service: AsyncMock, mock_user_id: AsyncMock) -> None:
    mock_session_service.get_session_with_history.return_value = None

    response = client.get(f"/api/v1/sessions/{SESSION_ID}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SES_4001"  # SESSION_NOT_FOUND


def test_update_session(client: TestClient, mock_session_service: AsyncMock, mock_user_id: AsyncMock) -> None:
    mock_session_service.update_session.return_value = {
        "id": str(SESSION_UUID),
        "session_id": SESSION_ID,
        "title": "Updated Title",
        "model": "gpt-4",
        "message_count": 5,
        "reasoning_effort": "medium",
        "accumulated_tool_tokens": 0,
        "total_tokens": 100,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }

    response = client.patch(f"/api/v1/sessions/{SESSION_ID}", json={"title": "Updated Title"})

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Title"

    mock_session_service.update_session.assert_called_with(
        user_id=USER_ID, session_id=SESSION_ID, title="Updated Title"
    )


def test_delete_session(client: TestClient, mock_session_service: AsyncMock, mock_user_id: AsyncMock) -> None:
    mock_session_service.delete_session.return_value = True

    response = client.delete(f"/api/v1/sessions/{SESSION_ID}")

    assert response.status_code == 200
    assert response.json()["success"] is True

    mock_session_service.delete_session.assert_called_with(USER_ID, SESSION_ID)


@pytest.mark.asyncio
async def test_summarize_session_not_found(client: TestClient, mock_db_pool: MagicMock) -> None:
    # Setup mock DB to return None for session lookup
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value  # Mock set up in fixture
    conn.fetchrow.return_value = None

    response = client.post(f"/api/v1/sessions/{SESSION_ID}/summarize")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SES_4001"


@pytest.mark.asyncio
async def test_summarize_session_success(client: TestClient, mock_db_pool: MagicMock) -> None:
    # Setup mock DB
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value

    # 1. Fetch session
    conn.fetchrow.return_value = {"id": SESSION_UUID, "model": "gpt-4o"}

    # 2. Mock transaction is already handled in fixture now

    # 3. Patch the source location because usage is a local import
    with patch("api.services.token_aware_session.PostgresTokenAwareSession") as MockSessionClass:
        mock_session = MockSessionClass.return_value
        mock_session.load_token_state_from_db = AsyncMock()
        mock_session.summarize_with_agent = AsyncMock(return_value="Summary text")
        mock_session.total_tokens = 500
        mock_session.accumulated_tool_tokens = 100

        response = client.post(f"/api/v1/sessions/{SESSION_ID}/summarize")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["summary"] == "Summary text"
        assert data["tool_call_id"].startswith("sum_")

        # Verify DB updates were called
        # conn.execute is AsyncMock
        assert conn.execute.call_count == 2
