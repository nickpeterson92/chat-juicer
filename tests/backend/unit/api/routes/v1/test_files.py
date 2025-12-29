from unittest.mock import AsyncMock, MagicMock

import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_file_service
from api.middleware.exception_handlers import register_exception_handlers
from api.routes.v1.files import router

SESSION_ID = "sess_123"
FOLDER = "input"


@pytest.fixture
def mock_file_service() -> AsyncMock:
    service = AsyncMock()
    # service methods are async
    return service


@pytest.fixture
def app(mock_file_service: AsyncMock) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/api/v1")

    app.dependency_overrides[get_file_service] = lambda: mock_file_service
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def test_list_files(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.list_files.return_value = [
        {"name": "a.txt", "type": "file", "size": 1024, "modified": "2024-01-01T00:00:00Z"},
        {"name": "b.log", "type": "file", "size": 2048, "modified": "2024-01-01T00:00:00Z"},
    ]

    response = client.get(f"/api/v1/{SESSION_ID}/files?folder={FOLDER}")

    assert response.status_code == 200
    data = response.json()
    assert len(data["files"]) == 2
    assert data["files"][0]["name"] == "a.txt"
    assert data["count"] == 2
    assert data["folder"] == FOLDER

    mock_file_service.list_files.assert_called_with(SESSION_ID, FOLDER)


def test_list_files_empty(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.list_files.return_value = []

    response = client.get(f"/api/v1/{SESSION_ID}/files")

    assert response.status_code == 200
    assert len(response.json()["files"]) == 0


def test_upload_file(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.save_file.return_value = {
        "name": "upload.txt",
        "type": "file",
        "size": 11,
        "modified": "2024-01-01T00:00:00Z",
        "extension": ".txt",
    }

    files = {"file": ("upload.txt", b"Hello World", "text/plain")}
    response = client.post(f"/api/v1/{SESSION_ID}/files/upload", files=files)

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "upload.txt"
    assert data["path"] == f"{FOLDER}/upload.txt"

    # Verify service call
    mock_file_service.save_file.assert_called_once()
    _, kwargs = mock_file_service.save_file.call_args
    assert kwargs["filename"] == "upload.txt"
    assert kwargs["content"] == b"Hello World"


def test_download_file(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.get_file_content.return_value = b"File Content"

    filename = "doc.txt"
    response = client.get(f"/api/v1/{SESSION_ID}/files/{filename}/download")

    assert response.status_code == 200
    assert response.content == b"File Content"
    assert response.headers["content-disposition"] == f'attachment; filename="{filename}"'


def test_download_file_not_found(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.get_file_content.side_effect = FileNotFoundError("Not found")

    filename = "missing.txt"
    response = client.get(f"/api/v1/{SESSION_ID}/files/{filename}/download")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FILE_5001"  # FILE_NOT_FOUND (Check ErrorCode enum later if different)


def test_get_file_path(client: TestClient, mock_file_service: AsyncMock) -> None:
    # Mocking Path object returned by service
    mock_path = MagicMock()
    mock_path.absolute.return_value = "/abs/path/sess_123/sources/doc.txt"
    mock_path.exists.return_value = True

    # get_file_path is SYNC method in protocol?
    # Let's check LocalFileService protocol in file_service.py:
    # def get_file_path(self, session_id: str, folder: str, filename: str) -> Path: ...
    # It is synchronous in my implementation.
    # But AsyncMock doesn't mock sync methods well if assigned to the object?
    # If mock_file_service is AsyncMock, its children are AsyncMock.
    # get_file_path needs to be a standard Mock/MagicMock if the service method is sync.
    # However, Python doesn't enforce async constraint on mocks unless spec is used.
    # The router calls: path = files.get_file_path(...) -> SYNC call.
    # So I must ensure mock_file_service.get_file_path is NOT async.
    mock_file_service.get_file_path = MagicMock(return_value=mock_path)

    response = client.get(f"/api/v1/{SESSION_ID}/files/doc.txt/path")

    assert response.status_code == 200
    data = response.json()
    assert data["path"] == "/abs/path/sess_123/sources/doc.txt"
    assert data["exists"] is True


def test_get_file_path_not_found(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_path = MagicMock()
    mock_path.exists.return_value = False
    mock_file_service.get_file_path = MagicMock(return_value=mock_path)

    response = client.get(f"/api/v1/{SESSION_ID}/files/missing.txt/path")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FILE_5001"


def test_delete_file(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.delete_file.return_value = True

    response = client.delete(f"/api/v1/{SESSION_ID}/files/del.txt")

    assert response.status_code == 200
    assert response.json()["success"] is True

    mock_file_service.delete_file.assert_called_with(SESSION_ID, FOLDER, "del.txt")


def test_delete_file_not_found(client: TestClient, mock_file_service: AsyncMock) -> None:
    mock_file_service.delete_file.return_value = False

    response = client.delete(f"/api/v1/{SESSION_ID}/files/missing.txt")

    assert response.status_code == 404
