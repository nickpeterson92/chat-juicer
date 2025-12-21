from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.middleware.exception_handlers import register_exception_handlers
from api.routes.v1.config import router


@pytest.fixture
def mock_settings() -> MagicMock:
    settings = MagicMock()
    settings.tavily_api_key = "tavily_key"
    settings.max_file_size = 1024
    settings.app_version = "1.0.0-test"
    settings.api_provider = "openai"  # or azure
    return settings


@pytest.fixture
def app(mock_settings: MagicMock) -> Generator[FastAPI, None, None]:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/api/v1")

    # Patch get_settings in api.dependencies since get_app_settings calls it
    with patch("api.dependencies.get_settings", return_value=mock_settings):
        yield app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def test_get_config_success(client: TestClient, mock_settings: MagicMock) -> None:
    response = client.get("/api/v1/config")

    assert response.status_code == 200
    data = response.json()

    # Verify structure
    assert "models" in data
    assert "mcp_servers" in data
    assert "reasoning_levels" in data
    assert data["max_file_size"] == 1024
    assert data["version"] == "1.0.0-test"

    # Verify Tavily presence (since key is set)
    servers = data["mcp_servers"]
    assert any(s["id"] == "tavily" for s in servers)
    assert any(s["id"] == "fetch" for s in servers)

    # Verify models
    assert len(data["models"]) > 0
    # Note: DEFAULT_MODEL is used in config.py, which is imported statically.
    models = data["models"]
    assert any(m["value"] == "gpt-5.2" for m in models)  # gpt-5.2 is is_ui_model=True


def test_get_config_no_tavily(client: TestClient, mock_settings: MagicMock) -> None:
    # Mock property access: settings.tavily_api_key
    # type(mock_settings).tavily_api_key = PropertyMock(return_value=None) # Requires PropertyMock import
    # Or simpler if it's just an attribute on a MagicMock
    mock_settings.tavily_api_key = None

    response = client.get("/api/v1/config")

    assert response.status_code == 200
    data = response.json()
    servers = data["mcp_servers"]

    assert not any(s["id"] == "tavily" for s in servers)
    assert any(s["id"] == "sequential-thinking" for s in servers)
