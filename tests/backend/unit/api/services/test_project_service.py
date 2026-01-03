"""Unit tests for ProjectService."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from api.services.project_service import ProjectService


@pytest.fixture
def project_service(mock_db_pool: MagicMock) -> ProjectService:
    return ProjectService(pool=mock_db_pool)


@pytest.mark.asyncio
async def test_create_project(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test creating a new project."""
    user_id = uuid4()
    project_id = uuid4()

    mock_row = {
        "id": project_id,
        "name": "Test Project",
        "description": "A test project",
        "session_count": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await project_service.create_project(
        user_id=user_id,
        name="Test Project",
        description="A test project",
    )

    assert result["id"] == str(project_id)
    assert result["name"] == "Test Project"
    assert result["description"] == "A test project"
    conn.fetchrow.assert_called_once()


@pytest.mark.asyncio
async def test_get_project_found(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test retrieving an existing project."""
    user_id = uuid4()
    project_id = uuid4()

    mock_row = {
        "id": project_id,
        "name": "My Project",
        "description": "Description",
        "session_count": 5,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=mock_row)

    result = await project_service.get_project(user_id, project_id)

    assert result is not None
    assert result["id"] == str(project_id)
    assert result["name"] == "My Project"
    assert result["session_count"] == 5


@pytest.mark.asyncio
async def test_get_project_not_found(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test get project returns None if not found."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=None)

    result = await project_service.get_project(uuid4(), uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_list_projects(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test listing projects with pagination."""
    user_id = uuid4()

    mock_rows = [
        {
            "id": uuid4(),
            "name": f"Project {i}",
            "description": None,
            "session_count": i,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for i in range(2)
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)
    conn.fetchval = AsyncMock(return_value=5)  # Total count

    result = await project_service.list_projects(user_id, offset=0, limit=2)

    assert len(result["projects"]) == 2
    assert result["total_count"] == 5
    assert result["has_more"] is True  # 2 < 5


@pytest.mark.asyncio
async def test_list_projects_no_more(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test list_projects has_more is False when all returned."""
    user_id = uuid4()

    mock_rows = [
        {
            "id": uuid4(),
            "name": "Only Project",
            "description": None,
            "session_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    ]

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetch = AsyncMock(return_value=mock_rows)
    conn.fetchval = AsyncMock(return_value=1)  # Total = returned

    result = await project_service.list_projects(user_id)

    assert result["has_more"] is False


@pytest.mark.asyncio
async def test_update_project(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test updating project fields."""
    user_id = uuid4()
    project_id = uuid4()

    # First call: UPDATE RETURNING
    update_row = {
        "id": project_id,
        "name": "Updated Name",
        "description": "Updated desc",
        "session_count": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    # Second call: get_project
    get_row = {
        "id": project_id,
        "name": "Updated Name",
        "description": "Updated desc",
        "session_count": 3,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(side_effect=[update_row, get_row])

    result = await project_service.update_project(user_id, project_id, name="Updated Name", description="Updated desc")

    assert result is not None
    assert result["name"] == "Updated Name"
    assert result["session_count"] == 3


@pytest.mark.asyncio
async def test_update_project_not_found(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test update returns None when project doesn't exist."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.fetchrow = AsyncMock(return_value=None)

    result = await project_service.update_project(uuid4(), uuid4(), name="New Name")
    assert result is None


@pytest.mark.asyncio
async def test_delete_project_success(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test deleting a project successfully."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock(return_value="DELETE 1")

    result = await project_service.delete_project(uuid4(), uuid4())
    assert result is True


@pytest.mark.asyncio
async def test_delete_project_not_found(project_service: ProjectService, mock_db_pool: MagicMock) -> None:
    """Test delete returns False when project doesn't exist."""
    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute = AsyncMock(return_value="DELETE 0")

    result = await project_service.delete_project(uuid4(), uuid4())
    assert result is False


def test_row_to_project(project_service: ProjectService) -> None:
    """Test _row_to_project converts row to dict."""
    project_id = uuid4()
    now = datetime.now(timezone.utc)

    mock_row = MagicMock()
    mock_row.__getitem__ = lambda self, key: {
        "id": project_id,
        "name": "Test",
        "description": "Desc",
        "session_count": 2,
        "created_at": now,
        "updated_at": now,
    }[key]
    mock_row.get = lambda key, default=None: {
        "id": project_id,
        "name": "Test",
        "description": "Desc",
        "session_count": 2,
        "created_at": now,
        "updated_at": now,
    }.get(key, default)

    result = project_service._row_to_project(mock_row)

    assert result["id"] == str(project_id)
    assert result["name"] == "Test"
    assert result["session_count"] == 2
