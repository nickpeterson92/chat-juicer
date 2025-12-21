from unittest.mock import AsyncMock, MagicMock

import pytest

from api.services.file_service import LocalFileService

SESSION_ID = "sess_123"
FOLDER = "sources"


@pytest.fixture
def mock_pool() -> MagicMock:
    pool = MagicMock()
    # Mock acquire returning async context manager
    cm = MagicMock()
    connection = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=connection)
    cm.__aexit__ = AsyncMock(return_value=None)
    pool.acquire.return_value = cm

    # Mock transaction needed? save_file uses it?
    # save_file calls _upsert_file_record which uses transaction()
    transaction_method = MagicMock()
    transaction_cm = MagicMock()
    transaction_cm.__aenter__ = AsyncMock(return_value=None)
    transaction_cm.__aexit__ = AsyncMock(return_value=None)
    transaction_method.return_value = transaction_cm
    connection.transaction = transaction_method

    return pool


@pytest.fixture
def file_service(tmp_path: MagicMock, mock_pool: MagicMock) -> LocalFileService:
    # Use tmp_path as base_path for isolation
    return LocalFileService(base_path=tmp_path, pool=mock_pool)


@pytest.mark.asyncio
async def test_save_file(file_service: LocalFileService, tmp_path: MagicMock, mock_pool: MagicMock) -> None:
    content = b"Hello World"
    filename = "test.txt"

    result = await file_service.save_file(
        session_id=SESSION_ID, folder=FOLDER, filename=filename, content=content, content_type="text/plain"
    )

    # Verify return value
    assert result["name"] == filename
    assert result["size"] == len(content)
    assert result["type"] == "file"

    # Verify file exists on disk
    expected_path = tmp_path / SESSION_ID / FOLDER / filename
    assert expected_path.exists()
    assert expected_path.read_bytes() == content

    # Verify DB interaction
    # Need to verify _get_session_uuid was called -> logic inside _upsert_file_record
    # _get_session_uuid uses conn.fetchval
    cm = mock_pool.acquire.return_value
    conn = cm.__aenter__.return_value

    # We didn't set return value for fetchval, so it's AsyncMock -> returns AsyncMock object which is True-ish?
    # Wait, fetchval returns a coroutine. Awaiting it returns a child mock.
    # We need to set it to return a UUID or None.
    # Default is a mock object, which is not None, so it proceeds to upsert.
    assert conn.execute.call_count >= 1  # upsert calls execute (delete then insert)


@pytest.mark.asyncio
async def test_list_files(file_service: LocalFileService, tmp_path: MagicMock) -> None:
    # Setup files
    session_dir = tmp_path / SESSION_ID / FOLDER
    session_dir.mkdir(parents=True)

    (session_dir / "a.txt").write_text("A")
    (session_dir / "b.log").write_text("B")
    (session_dir / ".hidden").write_text("Hidden")
    (session_dir / "subdir").mkdir()

    files = await file_service.list_files(SESSION_ID, FOLDER)

    # Should contain a.txt, b.log, subdir. Should skip .hidden
    names = [f["name"] for f in files]
    assert "a.txt" in names
    assert "b.log" in names
    assert "subdir" in names
    assert ".hidden" not in names
    assert len(files) == 3

    # Verify subdir type
    subdir = next(f for f in files if f["name"] == "subdir")
    assert subdir["type"] == "folder"


@pytest.mark.asyncio
async def test_get_file_content(file_service: LocalFileService, tmp_path: MagicMock) -> None:
    # Setup file
    session_dir = tmp_path / SESSION_ID / FOLDER
    session_dir.mkdir(parents=True)
    file_path = session_dir / "read.txt"
    file_path.write_bytes(b"Read Me")

    content = await file_service.get_file_content(SESSION_ID, FOLDER, "read.txt")
    assert content == b"Read Me"


@pytest.mark.asyncio
async def test_get_file_content_not_found(file_service: LocalFileService) -> None:
    with pytest.raises(FileNotFoundError):
        await file_service.get_file_content(SESSION_ID, FOLDER, "nonexistent.txt")


@pytest.mark.asyncio
async def test_delete_file(file_service: LocalFileService, tmp_path: MagicMock, mock_pool: MagicMock) -> None:
    # Setup file
    session_dir = tmp_path / SESSION_ID / FOLDER
    session_dir.mkdir(parents=True)
    file_path = session_dir / "delete.txt"
    file_path.write_text("Delete Me")

    # Verify it exists
    assert file_path.exists()

    success = await file_service.delete_file(SESSION_ID, FOLDER, "delete.txt")
    assert success is True
    assert not file_path.exists()

    # Verify DB delete
    cm = mock_pool.acquire.return_value
    conn = cm.__aenter__.return_value
    conn.execute.assert_called()


def test_init_session_workspace(file_service: LocalFileService, tmp_path: MagicMock) -> None:
    templates_src = tmp_path / "global_templates"
    templates_src.mkdir()
    (templates_src / "t1.md").write_text("Template")

    file_service.init_session_workspace(SESSION_ID, templates_path=templates_src)

    session_dir = tmp_path / SESSION_ID
    assert (session_dir / "sources").exists()
    assert (session_dir / "output").exists()
    assert (session_dir / "templates").exists()
    # Check if templates is symlink or copy (depends on OS but usually symlink in test env)
    # Just check content
    assert (session_dir / "templates" / "t1.md").exists()
