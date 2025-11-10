"""Pytest fixtures for integration tests.

Provides real database setup with temporary paths and mock external services.
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.state import AppState
from core.full_history import FullHistoryStore
from core.session_manager import SessionManager


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    """Provide temporary database path for integration tests."""
    db_path = tmp_path / "test_chat_history.db"
    return db_path


@pytest.fixture
def temp_metadata_path(tmp_path: Path) -> Path:
    """Provide temporary metadata path for integration tests."""
    metadata_path = tmp_path / "test_sessions.json"
    return metadata_path


@pytest.fixture
def temp_workspace_root(tmp_path: Path) -> Path:
    """Provide temporary workspace root for session files."""
    workspace_root = tmp_path / "data" / "files"
    workspace_root.mkdir(parents=True, exist_ok=True)
    return workspace_root


@pytest.fixture
def session_manager(temp_metadata_path: Path) -> SessionManager:
    """Provide SessionManager with temporary metadata file."""
    return SessionManager(metadata_path=str(temp_metadata_path))


@pytest.fixture
def full_history_store(temp_db_path: Path) -> FullHistoryStore:
    """Provide FullHistoryStore with temporary database."""
    return FullHistoryStore(db_path=str(temp_db_path))


@pytest.fixture
def mock_openai_client() -> Mock:
    """Provide mocked OpenAI client for integration tests."""
    client = Mock()

    # Mock basic client properties
    client.api_key = "test-api-key"
    client.base_url = "https://test.openai.azure.com/"

    return client


@pytest.fixture
def mock_mcp_server() -> Mock:
    """Provide mocked MCP server for integration tests."""
    server = Mock()

    # Mock async context manager
    server.__aenter__ = AsyncMock(return_value=server)
    server.__aexit__ = AsyncMock(return_value=None)

    # Mock server properties
    server.name = "test-mcp-server"
    server.tools = []

    return server


@pytest.fixture
def mock_agent() -> Mock:
    """Provide mocked Agent for integration tests."""
    agent = Mock()

    # Mock agent properties
    agent.name = "test-agent"
    agent.model = "gpt-4o"
    agent.instructions = "Test instructions"

    return agent


@pytest.fixture
def mock_app_state(
    session_manager: SessionManager,
    full_history_store: FullHistoryStore,
    mock_agent: Mock,
    mock_mcp_server: Mock,
) -> AppState:
    """Provide AppState with real persistence and mocked external services."""
    return AppState(
        session_manager=session_manager,
        current_session=None,
        agent=mock_agent,
        deployment="gpt-4o",
        full_history_store=full_history_store,
        mcp_servers={"test-mcp": mock_mcp_server},
    )


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """Auto-mock settings for all integration tests to avoid environment variable requirements."""
    settings = Mock()
    settings.azure_openai_api_key = "test-api-key"
    settings.azure_openai_endpoint = "https://test.openai.azure.com/"
    settings.azure_openai_deployment = "gpt-4o"
    settings.azure_endpoint_str = "https://test.openai.azure.com/"
    settings.api_provider = "azure"
    settings.reasoning_effort = "medium"
    settings.http_request_logging = False

    # Patch get_settings for all integration tests
    with patch("core.constants.get_settings", return_value=settings):
        yield


@pytest.fixture
def integration_test_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Set up complete integration test environment with proper paths."""
    # Change to temp directory so Path.cwd() works correctly
    monkeypatch.chdir(tmp_path)

    # Create necessary directories
    (tmp_path / "data" / "files").mkdir(parents=True, exist_ok=True)
    (tmp_path / "logs").mkdir(parents=True, exist_ok=True)

    return tmp_path
