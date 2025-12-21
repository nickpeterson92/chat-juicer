from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from fastapi.testclient import TestClient

from api.main import app, lifespan


@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)


@pytest.mark.asyncio
async def test_lifespan_startup_success() -> None:
    """Test successful application startup."""
    mock_app = Mock()
    mock_app.state = Mock()

    # Mock settings to have predictable timeouts
    mock_settings = Mock()
    mock_settings.database_url = "postgres://test"
    mock_settings.db_pool_min_size = 1
    mock_settings.db_pool_max_size = 1
    mock_settings.db_command_timeout = 10.0
    mock_settings.db_connection_timeout = 10.0
    mock_settings.db_statement_cache_size = 100
    mock_settings.db_max_inactive_connection_lifetime = 300.0
    mock_settings.ws_idle_timeout = 60
    mock_settings.ws_max_connections = 100
    mock_settings.ws_max_connections_per_session = 10
    mock_settings.mcp_pool_size = 1
    mock_settings.mcp_acquire_timeout = 10.0
    mock_settings.shutdown_connection_drain_timeout = 5.0
    mock_settings.shutdown_timeout = 10.0
    mock_settings.api_provider = "openai"
    mock_settings.openai_api_key = "key"
    mock_settings.http_request_logging = False
    mock_settings.http_read_timeout = 10.0

    # Mock all startup dependencies
    with (
        patch("api.main.settings", mock_settings),
        patch("api.main._setup_openai_client") as mock_setup_client,
        patch("api.main.patch_sdk_for_auto_tracking") as mock_patch_sdk,
        patch("api.main.create_database_pool", new_callable=AsyncMock) as mock_create_db,
        patch("api.main.check_pool_health", new_callable=AsyncMock) as mock_check_health,
        patch("api.main.initialize_mcp_pool", new_callable=AsyncMock) as mock_init_mcp,
        patch("api.main.graceful_pool_close", new_callable=AsyncMock) as mock_close_db,
        patch("api.main.WebSocketManager", autospec=True) as MockWSManager,
    ):

        # Configure mocks
        mock_check_health.return_value = {"healthy": True}
        mock_db_pool = Mock()
        mock_create_db.return_value = mock_db_pool

        mock_mcp_pool = AsyncMock()
        mock_init_mcp.return_value = mock_mcp_pool

        # Configure WebSocketManager instance
        mock_ws_instance = MockWSManager.return_value
        # Important: Ensure the method is an AsyncMock that returns a coroutine
        mock_ws_instance.start_idle_checker = AsyncMock()

        # Enter lifespan context
        async with lifespan(mock_app):
            # Verify startup actions
            mock_setup_client.assert_called_once()
            mock_patch_sdk.assert_called_once()
            mock_create_db.assert_called_once()
            mock_check_health.assert_called_once()
            mock_init_mcp.assert_called_once()
            mock_ws_instance.start_idle_checker.assert_called_once()

            # Verify state assignment
            assert mock_app.state.db_pool == mock_db_pool
            assert mock_app.state.mcp_pool == mock_mcp_pool
            assert hasattr(mock_app.state, "ws_manager")
            assert hasattr(mock_app.state, "shutdown_event")

        # Verify shutdown calls handled in finally
        mock_close_db.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_startup_db_failure() -> None:
    """Test startup fails if DB is unhealthy."""
    mock_app = Mock()

    with (
        patch("api.main._setup_openai_client"),
        patch("api.main.patch_sdk_for_auto_tracking"),
        patch("api.main.create_database_pool", new_callable=AsyncMock),
        patch("api.main.check_pool_health", new_callable=AsyncMock) as mock_check_health,
    ):

        mock_check_health.return_value = {"healthy": False}

        with pytest.raises(RuntimeError, match="Database connection failed"):
            async with lifespan(mock_app):
                pass


@pytest.mark.asyncio
async def test_lifespan_shutdown() -> None:
    """Test graceful shutdown sequence."""
    mock_app = Mock()
    mock_app.state = Mock()

    mock_settings = Mock()
    mock_settings.shutdown_connection_drain_timeout = 5.0
    mock_settings.shutdown_timeout = 10.0
    mock_settings.database_url = "postgres://"

    # Mock startup dependencies to allow entering context
    with (
        patch("api.main.settings", mock_settings),
        patch("api.main._setup_openai_client"),
        patch("api.main.patch_sdk_for_auto_tracking"),
        patch("api.main.create_database_pool", new_callable=AsyncMock) as mock_create_db,
        patch("api.main.check_pool_health", new_callable=AsyncMock) as mock_check,
        patch("api.main.initialize_mcp_pool", new_callable=AsyncMock) as mock_init_mcp,
        patch("api.main.graceful_pool_close", new_callable=AsyncMock) as mock_close_db,
        patch("api.main.WebSocketManager", autospec=True) as MockWSManager,
    ):

        mock_check.return_value = {"healthy": True}

        # Mock WS Manager instance
        mock_ws_instance = MockWSManager.return_value
        mock_ws_instance.start_idle_checker = AsyncMock()
        mock_ws_instance.graceful_shutdown = AsyncMock()

        # Mock MCP pool instance
        mock_mcp_pool = AsyncMock()
        mock_init_mcp.return_value = mock_mcp_pool

        # Mock DB pool instance
        mock_db_pool = AsyncMock()
        mock_create_db.return_value = mock_db_pool

        async with lifespan(mock_app):
            pass

        # Verify shutdown actions
        mock_ws_instance.graceful_shutdown.assert_called_once_with(timeout=5.0)

        # Check MCP pool shutdown
        mcp_pool = mock_app.state.mcp_pool
        mcp_pool.shutdown.assert_called_once()

        # Check DB pool shutdown
        db_pool = mock_app.state.db_pool
        mock_close_db.assert_called_once_with(db_pool, timeout=10.0)


@patch("api.main.lifespan", MagicMock())
def test_app_routes_exist(test_client: TestClient) -> None:
    """Smoke test to verify router mounting."""
    # We can inspect the app routes without making requests that trigger lifespan
    routes = [r.path for r in app.routes]
    assert "/api/v1/health" in routes
    assert "/api/v1/auth/login" in routes
    assert "/ws/chat/{session_id}" in routes
