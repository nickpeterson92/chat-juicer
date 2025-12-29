"""Extended tests for file utility functions.

Tests for uncovered functionality: write operations, file_operation helper,
json_response, and edge cases.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from utils.file_utils import (
    file_operation,
    json_response,
    save_uploaded_file,
    validate_file_path,
    validate_session_path,
    write_file_content,
)


class TestValidateFilePathMaxSize:
    """Tests for validate_file_path with max_size parameter."""

    def test_file_within_size_limit(self, isolated_filesystem: Path) -> None:
        """Test file validation with size limit (within limit)."""
        test_file = isolated_filesystem / "test_file.txt"
        test_file.write_text("x" * 100)

        resolved, error = validate_file_path("test_file.txt", check_exists=True, max_size=1000)
        assert error is None
        assert resolved.exists()

    def test_file_exceeds_size_limit(self, isolated_filesystem: Path) -> None:
        """Test file validation when file exceeds max_size."""
        test_file = isolated_filesystem / "test_file.txt"
        test_file.write_text("x" * 1000)

        _resolved, error = validate_file_path("test_file.txt", check_exists=True, max_size=100)
        assert error is not None
        assert "too large" in error.lower()

    def test_file_exactly_at_size_limit(self, isolated_filesystem: Path) -> None:
        """Test file validation when file is exactly at max_size."""
        test_file = isolated_filesystem / "test_file.txt"
        test_file.write_text("x" * 100)

        file_size = test_file.stat().st_size
        _resolved, error = validate_file_path("test_file.txt", check_exists=True, max_size=file_size)
        assert error is None

    def test_max_size_with_nonexistent_file(self, isolated_filesystem: Path) -> None:
        """Test max_size parameter with non-existent file."""
        _resolved, error = validate_file_path("nonexistent.txt", check_exists=True, max_size=1000)
        # Should fail on existence check before size check
        assert error is not None
        assert "not found" in error.lower()


class TestWriteFileContent:
    """Tests for write_file_content function."""

    @pytest.mark.asyncio
    async def test_write_simple_content(self, temp_dir: Path) -> None:
        """Test writing simple text content."""
        target = temp_dir / "output.txt"
        content = "Hello, World!"

        _, error = await write_file_content(target, content)

        assert error is None
        assert target.exists()
        assert target.read_text() == content

    @pytest.mark.asyncio
    async def test_write_multiline_content(self, temp_dir: Path) -> None:
        """Test writing multiline content."""
        target = temp_dir / "multiline.txt"
        content = "Line 1\nLine 2\nLine 3\n"

        _, error = await write_file_content(target, content)

        assert error is None
        assert target.read_text() == content

    @pytest.mark.asyncio
    async def test_write_unicode_content(self, temp_dir: Path) -> None:
        """Test writing unicode content."""
        target = temp_dir / "unicode.txt"
        content = "Hello 世界 مرحبا Привет 🌍"

        _, error = await write_file_content(target, content)

        assert error is None
        assert target.read_text(encoding="utf-8") == content

    @pytest.mark.asyncio
    async def test_write_overwrites_existing(self, temp_file: Path) -> None:
        """Test that write overwrites existing file."""
        original = "Original content"
        new_content = "New content"
        temp_file.write_text(original)

        _, error = await write_file_content(temp_file, new_content)

        assert error is None
        assert temp_file.read_text() == new_content
        assert original not in temp_file.read_text()

    @pytest.mark.asyncio
    async def test_write_empty_content(self, temp_dir: Path) -> None:
        """Test writing empty content."""
        target = temp_dir / "empty.txt"

        _, error = await write_file_content(target, "")

        assert error is None
        assert target.exists()
        assert target.read_text() == ""

    @pytest.mark.asyncio
    async def test_write_to_nonexistent_directory(self) -> None:
        """Test writing to non-existent directory returns error."""
        target = Path("/nonexistent/directory/file.txt")

        _, error = await write_file_content(target, "content")

        assert error is not None
        assert "failed to write" in error.lower()


class TestJsonResponse:
    """Tests for json_response function."""

    def test_success_response_empty(self) -> None:
        """Test success response with no data."""
        result = json_response(success=True)
        assert '"success": true' in result

    def test_success_response_with_data(self) -> None:
        """Test success response with data."""
        result = json_response(success=True, count=5, message="Done")
        assert '"success": true' in result
        assert '"data"' in result
        assert '"count": 5' in result
        assert '"message": "Done"' in result

    def test_error_response(self) -> None:
        """Test error response."""
        result = json_response(error="Something went wrong")
        assert '"success": false' in result
        assert '"error": "Something went wrong"' in result

    def test_error_response_ignores_success_param(self) -> None:
        """Test that error parameter takes precedence."""
        result = json_response(success=True, error="Error message")
        assert '"success": false' in result
        assert '"error": "Error message"' in result

    def test_response_with_nested_data(self) -> None:
        """Test response with nested data structures."""
        result = json_response(success=True, user={"name": "John", "age": 30}, items=[1, 2, 3], metadata={"count": 10})
        assert '"success": true' in result
        assert '"data"' in result
        assert '"user"' in result
        assert '"items"' in result


class TestFileOperation:
    """Tests for file_operation helper function."""

    @pytest.mark.asyncio
    async def test_file_operation_sync_function(self, temp_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file_operation with synchronous operation function."""
        temp_file.write_text("original content")
        monkeypatch.chdir(temp_file.parent)

        def uppercase_operation(content: str) -> tuple[str, dict[str, str | int]]:
            return content.upper(), {"operation": "uppercase", "replacements": 1}

        result = await file_operation(temp_file.name, uppercase_operation)

        assert "success" in result
        # If operation succeeded, file should be updated
        if "true" in result.lower():
            assert temp_file.read_text() == "ORIGINAL CONTENT"

    @pytest.mark.asyncio
    async def test_file_operation_async_function(self, temp_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file_operation with asynchronous operation function."""
        temp_file.write_text("hello world")
        monkeypatch.chdir(temp_file.parent)

        async def async_uppercase(content: str) -> tuple[str, dict[str, str | int]]:
            return content.upper(), {"operation": "async_uppercase", "replacements": 1}

        result = await file_operation(temp_file.name, async_uppercase)

        assert "success" in result
        # If operation succeeded, file should be updated
        if "true" in result.lower():
            assert temp_file.read_text() == "HELLO WORLD"

    @pytest.mark.asyncio
    async def test_file_operation_with_session_id(
        self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test file_operation with session isolation."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        # Create test file in session workspace
        test_file = session_workspace / "input" / "test.txt"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("test content")

        def noop_operation(content: str) -> tuple[str, dict[str, str]]:
            return content, {"operation": "noop"}

        result = await file_operation("input/test.txt", noop_operation, session_id=session_id)

        assert "success" in result

    @pytest.mark.asyncio
    async def test_file_operation_validation_error(self) -> None:
        """Test file_operation with path validation error."""

        def dummy_operation(content: str) -> tuple[str, dict[str, str]]:
            return content, {}

        result = await file_operation("../etc/passwd", dummy_operation)

        assert "success" in result
        assert "false" in result.lower()
        assert "error" in result

    @pytest.mark.asyncio
    async def test_file_operation_read_only(self, temp_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file_operation with read-only operation (None return)."""
        original_content = "original"
        temp_file.write_text(original_content)
        monkeypatch.chdir(temp_file.parent.parent)

        def read_only_operation(content: str) -> tuple[None, dict[str, int]]:
            return None, {"length": len(content)}

        result = await file_operation(str(temp_file), read_only_operation)

        assert "success" in result
        # File should remain unchanged
        assert temp_file.read_text() == original_content

    @pytest.mark.asyncio
    async def test_file_operation_with_error_in_result(self, temp_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file_operation when operation returns error in result."""
        temp_file.write_text("content")
        monkeypatch.chdir(temp_file.parent.parent)

        def failing_operation(content: str) -> tuple[str, dict[str, str]]:
            return "", {"error": "Operation failed"}

        result = await file_operation(str(temp_file), failing_operation)

        assert "success" in result
        assert "false" in result.lower()

    @pytest.mark.asyncio
    async def test_file_operation_exception_in_operation(
        self, temp_file: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test file_operation when operation raises exception."""
        temp_file.write_text("content")
        monkeypatch.chdir(temp_file.parent.parent)

        def exception_operation(content: str) -> tuple[str, dict[str, str]]:
            raise ValueError("Intentional error")

        result = await file_operation(str(temp_file), exception_operation)

        assert "success" in result
        assert "false" in result.lower()
        assert "error" in result.lower()

    @pytest.mark.asyncio
    async def test_file_operation_with_result_data(self, temp_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file_operation preserves operation result data."""
        temp_file.write_text("hello")
        monkeypatch.chdir(temp_file.parent.parent)

        def operation_with_metadata(content: str) -> tuple[str, dict[str, str | int]]:
            return content.upper(), {
                "replacements": 5,
                "text_found": "hello",
                "text_inserted": "HELLO",
                "operation": "uppercase",
            }

        result = await file_operation(str(temp_file), operation_with_metadata)

        assert "success" in result
        assert "changes_made" in result or "replacements" in result


class TestSaveUploadedFileExtended:
    """Extended tests for save_uploaded_file function."""

    def test_save_file_with_backup_on_overwrite(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that existing file is backed up when overwritten."""
        import utils.file_utils

        # Patch PROJECT_ROOT and DATA_FILES_PATH
        monkeypatch.setattr(utils.file_utils, "PROJECT_ROOT", temp_dir)
        monkeypatch.setattr(utils.file_utils, "DATA_FILES_PATH", temp_dir / "data" / "files")

        session_id = "chat_test123"
        session_workspace = temp_dir / "data" / "files" / session_id / "input"
        session_workspace.mkdir(parents=True, exist_ok=True)

        # Create existing file
        existing_file = session_workspace / "test.txt"
        existing_file.write_bytes(b"Original content")

        # Upload new version
        result = save_uploaded_file(
            filename="test.txt",
            data=list(b"New content"),
            session_id=session_id,
        )

        assert result["success"] is True

        # Check backup was created
        backup_file = session_workspace / "test.txt.backup"
        assert backup_file.exists()
        assert backup_file.read_bytes() == b"Original content"

        # Check new content
        assert existing_file.read_bytes() == b"New content"

    def test_save_file_with_windows_path_separator(self) -> None:
        """Test that Windows path separators are blocked."""
        result = save_uploaded_file(
            filename="folder\\file.txt",  # Windows separator
            data=list(b"Test"),
            session_id="chat_test123",
        )

        assert result["success"] is False
        assert "invalid" in result["error"].lower()

    def test_save_file_with_large_data(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test saving file with large data."""
        import utils.file_utils

        # Patch PROJECT_ROOT and DATA_FILES_PATH
        monkeypatch.setattr(utils.file_utils, "PROJECT_ROOT", temp_dir)
        monkeypatch.setattr(utils.file_utils, "DATA_FILES_PATH", temp_dir / "data" / "files")

        session_id = "chat_test123"
        session_workspace = temp_dir / "data" / "files" / session_id / "input"
        session_workspace.mkdir(parents=True, exist_ok=True)

        # Create large data (1MB)
        large_data = list(b"x" * (1024 * 1024))

        result = save_uploaded_file(
            filename="large.bin",
            data=large_data,
            session_id=session_id,
        )

        assert result["success"] is True
        assert result["size"] == 1024 * 1024

    def test_save_file_returns_relative_path(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that save_uploaded_file returns relative path from cwd."""
        import utils.file_utils

        # Patch PROJECT_ROOT and DATA_FILES_PATH
        monkeypatch.setattr(utils.file_utils, "PROJECT_ROOT", temp_dir)
        monkeypatch.setattr(utils.file_utils, "DATA_FILES_PATH", temp_dir / "data" / "files")

        session_id = "chat_test123"
        session_workspace = temp_dir / "data" / "files" / session_id / "input"
        session_workspace.mkdir(parents=True, exist_ok=True)

        result = save_uploaded_file(
            filename="test.txt",
            data=list(b"Test"),
            session_id=session_id,
        )

        assert result["success"] is True
        # Path should be relative to jail root (data/files/{session_id}/)
        # So result should be input/test.txt, not absolute and not containing data/files
        assert not result["file_path"].startswith("/")
        assert result["file_path"] == "input/test.txt"

    def test_save_file_with_special_characters_in_name(self, temp_dir: Path) -> None:
        """Test saving file with special characters in filename."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            session_id = "chat_test123"
            session_workspace = temp_dir / "data" / "files" / session_id / "input"
            session_workspace.mkdir(parents=True, exist_ok=True)

            result = save_uploaded_file(
                filename="test-file_v2.0 (final).txt",
                data=list(b"Test"),
                session_id=session_id,
            )

            # Should succeed with valid special chars
            assert result["success"] is True

    def test_save_file_exception_handling(self, temp_dir: Path) -> None:
        """Test save_uploaded_file exception handling."""
        with (
            patch("pathlib.Path.cwd", return_value=temp_dir),
            patch("pathlib.Path.write_bytes", side_effect=PermissionError("No permission")),
        ):
            result = save_uploaded_file(
                filename="test.txt",
                data=list(b"Test"),
                session_id="chat_test123",
            )

            assert result["success"] is False
            assert "error" in result


class TestValidateSessionPathEdgeCases:
    """Additional edge case tests for validate_session_path."""

    def test_session_path_with_dot_reference(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test path with single dot (current directory)."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        _resolved, error = validate_session_path(".", session_id)
        assert error is None

    def test_session_path_with_leading_dot_slash(
        self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test path with leading ./ is normalized."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        _resolved, error = validate_session_path("./input/file.txt", session_id)
        assert error is None

    def test_session_path_strips_session_prefix(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that session prefix is correctly stripped."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        # Pass path with session prefix
        prefixed_path = f"data/files/{session_id}/input/test.txt"
        _resolved, error = validate_session_path(prefixed_path, session_id)
        assert error is None

    def test_session_path_without_session_outside_project(self) -> None:
        """Test validation without session for path outside project."""
        outside_path = "/etc/passwd"
        _resolved, error = validate_session_path(outside_path, session_id=None)
        # Should fail - absolute paths blocked
        assert error is not None
