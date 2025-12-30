from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db
from api.routes.v1.health import router


@pytest.fixture
def mock_db_pool() -> MagicMock:
    pool = MagicMock()
    # Mock pool stats for check_pool_health
    pool.get_size.return_value = 10
    pool.get_idle_size.return_value = 8

    # Mock acquire for readiness check
    cm = MagicMock()
    conn = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=conn)
    cm.__aexit__ = AsyncMock(return_value=None)
    pool.acquire.return_value = cm

    return pool


@pytest.fixture
def mock_ws_manager() -> MagicMock:
    manager = MagicMock()
    manager.get_stats.return_value = {"active_connections": 5, "active_sessions": 3, "shutting_down": False}
    return manager


@pytest.fixture
def mock_mcp_manager() -> MagicMock:
    manager = MagicMock()
    manager.get_stats.return_value = {"initialized": True, "servers": ["test"], "server_count": 1}
    return manager


@pytest.fixture
def app(mock_db_pool: MagicMock, mock_ws_manager: MagicMock, mock_mcp_manager: MagicMock) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="")  # router has paths starting with /health

    app.dependency_overrides[get_db] = lambda: mock_db_pool

    # Set app state
    app.state.ws_manager = mock_ws_manager
    app.state.mcp_manager = mock_mcp_manager

    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def test_liveness_check(client: TestClient) -> None:
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["alive"] is True


@pytest.mark.asyncio
async def test_readiness_check_success(client: TestClient, mock_db_pool: MagicMock) -> None:
    # Setup fetchval success
    cm = mock_db_pool.acquire.return_value
    conn = cm.__aenter__.return_value
    conn.fetchval.return_value = 1

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["ready"] is True


@pytest.mark.asyncio
async def test_readiness_check_failure(client: TestClient, mock_db_pool: MagicMock) -> None:
    # Setup db acquire failure
    mock_db_pool.acquire.side_effect = Exception("DB Down")

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["ready"] is False
    assert "DB Down" in response.json()["error"]


@pytest.mark.asyncio
async def test_health_check_healthy(client: TestClient, mock_db_pool: MagicMock) -> None:
    # check_pool_health uses db.acquire context manager to check "SELECT 1" usually?
    # Let's verify check_pool_health impl or assume it uses helper methods.
    # In health.py: db_health_data = await check_pool_health(db)
    # If I mock check_pool_health, I control the result.

    with patch("api.routes.v1.health.check_pool_health", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = {"healthy": True, "pool_size": 10, "pool_free": 8, "pool_used": 2}

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"]["healthy"] is True
        assert data["websocket"]["active_connections"] == 5
        assert data["mcp"]["initialized"] is True


@pytest.mark.asyncio
async def test_health_check_degraded(client: TestClient, mock_db_pool: MagicMock, mock_ws_manager: MagicMock) -> None:
    # Simulate DB healthy but WS error (if possible logic allows)
    # health.py logic:
    # if db_healthy and ws_healthy: healthy
    # elif db_healthy or ws_healthy: degraded
    # else: unhealthy

    # 1. DB Unhealthy
    with patch("api.routes.v1.health.check_pool_health", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = {"healthy": False, "error": "Connection failed"}

        response = client.get("/health")

        data = response.json()
        assert data["status"] == "degraded"  # Because WS is healthy (mocked healthy by default)
        assert data["database"]["healthy"] is False


@pytest.mark.asyncio
async def test_health_check_unhealthy(client: TestClient, mock_ws_manager: MagicMock) -> None:
    # DB Unhealthy and WS shutting down
    mock_ws_manager.get_stats.return_value = {"shutting_down": True}

    with patch("api.routes.v1.health.check_pool_health", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = {"healthy": False}

        response = client.get("/health")

        data = response.json()
        assert data["status"] == "unhealthy"
