"""Unit tests for projects routes."""

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_db
from api.middleware.auth import get_current_user
from api.middleware.exception_handlers import register_exception_handlers
from api.routes.v1.projects import router
from models.api_models import UserInfo

# Test Data
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
PROJECT_ID = uuid4()


@pytest.fixture
def mock_project_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_db_pool() -> MagicMock:
    return MagicMock()


@pytest.fixture
def app(mock_project_service: AsyncMock, mock_db_pool: MagicMock) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/api/v1")

    def mock_current_user() -> UserInfo:
        return UserInfo(id=str(USER_ID), email="test@example.com", display_name="Test User")

    # Override the Projects dependency
    from api.dependencies import get_project_service

    app.dependency_overrides[get_project_service] = lambda: mock_project_service
    app.dependency_overrides[get_db] = lambda: mock_db_pool
    app.dependency_overrides[get_current_user] = mock_current_user

    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def test_create_project(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test creating a project."""
    mock_project_service.create_project.return_value = {
        "id": str(PROJECT_ID),
        "name": "New Project",
        "description": "Test description",
        "session_count": 0,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }

    response = client.post(
        "/api/v1/projects",
        json={"name": "New Project", "description": "Test description"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New Project"
    mock_project_service.create_project.assert_called_once()


def test_list_projects(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test listing projects."""
    mock_project_service.list_projects.return_value = {
        "projects": [
            {
                "id": str(PROJECT_ID),
                "name": "Project 1",
                "description": None,
                "session_count": 5,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }
        ],
        "total_count": 1,
        "has_more": False,
    }

    response = client.get("/api/v1/projects")

    assert response.status_code == 200
    data = response.json()
    assert len(data["projects"]) == 1
    assert data["pagination"]["total_count"] == 1


def test_get_project(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test getting a specific project."""
    mock_project_service.get_project.return_value = {
        "id": str(PROJECT_ID),
        "name": "My Project",
        "description": "Details",
        "session_count": 3,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }

    response = client.get(f"/api/v1/projects/{PROJECT_ID}")

    assert response.status_code == 200
    assert response.json()["name"] == "My Project"


def test_get_project_not_found(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test getting a non-existent project."""
    mock_project_service.get_project.return_value = None

    response = client.get(f"/api/v1/projects/{PROJECT_ID}")

    assert response.status_code == 404


def test_update_project(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test updating a project."""
    mock_project_service.update_project.return_value = {
        "id": str(PROJECT_ID),
        "name": "Updated Name",
        "description": "Updated description",
        "session_count": 2,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }

    response = client.patch(
        f"/api/v1/projects/{PROJECT_ID}",
        json={"name": "Updated Name"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"


def test_update_project_not_found(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test updating a non-existent project."""
    mock_project_service.update_project.return_value = None

    response = client.patch(
        f"/api/v1/projects/{PROJECT_ID}",
        json={"name": "New Name"},
    )

    assert response.status_code == 404


def test_delete_project(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test deleting a project."""
    mock_project_service.delete_project.return_value = True

    response = client.delete(f"/api/v1/projects/{PROJECT_ID}")

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_delete_project_not_found(client: TestClient, mock_project_service: AsyncMock) -> None:
    """Test deleting a non-existent project."""
    mock_project_service.delete_project.return_value = False

    response = client.delete(f"/api/v1/projects/{PROJECT_ID}")

    assert response.status_code == 404
