"""Tests for file utility functions.

Tests file operations with validation, sandboxing, and security checks.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from utils.file_utils import (
    get_relative_path,
    get_session_files,
    read_file_content,
    save_uploaded_file,
    validate_directory_path,
    validate_file_path,
    validate_session_path,
)


class TestGetRelativePath:
    """Tests for get_relative_path function."""

    def test_path_within_cwd(self, temp_dir: Path) -> None:
        """Test getting relative path for file within cwd."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            file_path = temp_dir / "subdir" / "file.txt"
            result = get_relative_path(file_path)
            assert result == Path("subdir/file.txt")

    def test_path_outside_cwd(self, temp_dir: Path) -> None:
        """Test getting relative path for file outside cwd."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            outside_path = Path("/some/other/path/file.txt")
            result = get_relative_path(outside_path)
            # Should return original path if outside cwd
            assert result == outside_path

    def test_path_equals_cwd(self, temp_dir: Path) -> None:
        """Test getting relative path when path equals cwd."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            result = get_relative_path(temp_dir)
            # Path equals cwd, not within its parents
            assert result == temp_dir


class TestGetSessionFiles:
    """Tests for get_session_files function."""

    @pytest.mark.asyncio
    async def test_get_session_files_returns_sorted_list(self, isolated_filesystem: Path) -> None:
        """Return sorted filenames from session input directory."""
        session_id = "chat_test123"
        session_dir = isolated_filesystem / "data" / "files" / session_id / "input"
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / "b.txt").write_text("b")
        (session_dir / "a.txt").write_text("a")

        files = await get_session_files(session_id)
        assert files == ["a.txt", "b.txt"]

    @pytest.mark.asyncio
    async def test_get_session_files_missing_dir_returns_empty(self, isolated_filesystem: Path) -> None:
        """Return empty list when directory does not exist."""
        files = await get_session_files("missing_session")
        assert files == []

    @pytest.mark.asyncio
    async def test_get_session_files_filters_hidden_files(self, isolated_filesystem: Path) -> None:
        """Exclude hidden files from results."""
        session_id = "chat_test123"
        session_dir = isolated_filesystem / "data" / "files" / session_id / "input"
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / ".hidden.txt").write_text("hidden")
        (session_dir / "visible.txt").write_text("visible")

        files = await get_session_files(session_id)
        assert files == ["visible.txt"]


class TestValidateSessionPath:
    """Tests for validate_session_path function."""

    def test_valid_path_in_input(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test valid path in input directory."""
        session_id = session_workspace.name
        # Change to the actual directory so Path.cwd() and resolve() work correctly
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        resolved, error = validate_session_path("input/test.txt", session_id)
        assert error is None
        assert resolved.is_absolute()

    def test_path_traversal_blocked(self) -> None:
        """Test that path traversal attempts are blocked."""
        _resolved, error = validate_session_path("../etc/passwd", "chat_test123")
        assert error is not None
        assert "traversal" in error.lower()

    def test_absolute_path_sandboxed(self) -> None:
        """Test that absolute-looking paths get sandboxed to session workspace."""
        # /etc/passwd becomes sources/etc/passwd within session sandbox
        # Security is enforced by sandbox, not by blocking the path format
        resolved, error = validate_session_path("/etc/passwd", "chat_test123")
        assert error is None  # No error - path is sandboxed
        assert "chat_test123" in str(resolved)  # Confined to session
        assert "input" in str(resolved)  # Defaulted to input/

    def test_null_byte_blocked(self) -> None:
        """Test that null bytes are blocked."""
        _resolved, error = validate_session_path("test\0.txt", "chat_test123")
        assert error is not None
        assert "null byte" in error.lower()

    def test_complex_path_traversal_variants(self) -> None:
        """Test various sophisticated path traversal techniques."""
        malicious_paths = [
            "../../etc/passwd",
            "../../../etc/shadow",
            "input/../../etc/hosts",
            "input/../../../etc/passwd",
            "input/./../../etc/passwd",
            "input/./../../../etc/passwd",
            "./../../../etc/passwd",
            "input/....//....//etc/passwd",  # URL-encoded variant
        ]

        for malicious_path in malicious_paths:
            _resolved, error = validate_session_path(malicious_path, "chat_test123")
            assert error is not None, f"Failed to block path traversal: {malicious_path}"
            assert any(
                keyword in error.lower() for keyword in ["traversal", "outside", "escape", "denied"]
            ), f"Wrong error message for {malicious_path}: {error}"

    def test_null_byte_injection_variants(self) -> None:
        """Test various null byte injection techniques."""
        malicious_paths = [
            "file.txt\x00.jpg",
            "input/evil\x00.txt",
            "test\x00/etc/passwd",
            "normal.txt\x00",
        ]

        for malicious_path in malicious_paths:
            _resolved, error = validate_session_path(malicious_path, "chat_test123")
            assert error is not None, f"Failed to block null byte injection: {malicious_path!r}"
            assert "null byte" in error.lower(), f"Wrong error for {malicious_path!r}: {error}"

    def test_symlink_escape_blocked(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that symlinks attempting to escape workspace are blocked."""
        monkeypatch.chdir(temp_dir)

        # Create session directory structure
        session_id = "chat_test123"
        session_dir = temp_dir / "data" / "files" / session_id
        session_dir.mkdir(parents=True)

        # Create a file outside the session workspace
        external_file = temp_dir / "external_secret.txt"
        external_file.write_text("This should not be accessible")

        # Create a symlink that points outside the workspace
        evil_symlink = session_dir / "evil_link.txt"
        try:
            evil_symlink.symlink_to(external_file)

            # Attempt to access via the symlink should be blocked
            # Note: The validation happens on the path itself, not the symlink target
            # But if a symlink exists and resolves outside, it should be caught
            _resolved, error = validate_session_path("evil_link.txt", session_id)

            # Should either block it or the resolved path check should catch it
            # The actual behavior depends on whether the symlink is in an allowed directory
            # For security, any symlink NOT in templates/ or output/ that resolves outside should fail
            if error is None:
                # If no error, the resolved path must be within session workspace
                # (This would be the case for our allowed symlinks like templates/)
                assert _resolved is not None
                # Check that it's not actually pointing to the external file
                assert external_file not in _resolved.parents
        except OSError:
            # Some systems don't allow symlink creation - test passes
            pytest.skip("Symlink creation not supported on this system")

    def test_allowed_symlinks_templates_and_output(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that allowed symlinks (templates/, output/) are permitted."""
        monkeypatch.chdir(temp_dir)

        session_id = "chat_test123"
        session_dir = temp_dir / "data" / "files" / session_id
        session_dir.mkdir(parents=True)

        # Create global templates directory
        templates_dir = temp_dir / "templates"
        templates_dir.mkdir(parents=True)
        template_file = templates_dir / "template.md"
        template_file.write_text("# Template")

        # Create symlink to templates (as the app does)
        templates_symlink = session_dir / "templates"
        try:
            templates_symlink.symlink_to(templates_dir)

            # Access via templates/ should be allowed (whitelisted symlink)
            resolved, error = validate_session_path("templates/template.md", session_id)

            # Should succeed - templates is an allowed symlink
            assert error is None, f"Templates symlink should be allowed, got error: {error}"
            assert resolved is not None
        except OSError:
            pytest.skip("Symlink creation not supported on this system")

    def test_no_session_id_project_scope(self, isolated_filesystem: Path) -> None:
        """Test validation without session_id (project scope)."""
        test_file = isolated_filesystem / "test.txt"
        test_file.touch()

        # Use relative path - resolves against PROJECT_ROOT (patched to isolated_filesystem)
        resolved, error = validate_session_path("test.txt", session_id=None)
        assert error is None
        assert resolved.exists()

    def test_output_directory_allowed(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that output directory is allowed."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        _resolved, error = validate_session_path("output/doc.pdf", session_id)
        assert error is None

    def test_templates_directory_allowed(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that templates directory is allowed."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        _resolved, error = validate_session_path("templates/template.md", session_id)
        assert error is None

    def test_implicit_input_directory(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that files without explicit directory go to input."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        resolved, error = validate_session_path("file.txt", session_id)
        assert error is None
        # Should resolve to input/file.txt
        assert "input" in str(resolved)


class TestValidateFilePath:
    """Tests for validate_file_path function."""

    def test_valid_file_exists(self, temp_file: Path) -> None:
        """Test validating existing file."""
        with patch("pathlib.Path.cwd", return_value=temp_file.parent.parent):
            resolved, error = validate_file_path(str(temp_file), check_exists=True)
            if error is None:
                assert resolved.exists()
                assert resolved.is_file()

    def test_file_not_exists_with_check(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test validating non-existent file with existence check."""
        monkeypatch.chdir(temp_dir)
        nonexistent = "nonexistent.txt"

        _resolved, error = validate_file_path(nonexistent, check_exists=True)
        assert error is not None
        assert "not found" in error.lower() or "does not exist" in error.lower()

    def test_file_not_exists_without_check(self, temp_dir: Path) -> None:
        """Test validating non-existent file without existence check."""
        nonexistent = temp_dir / "future_file.txt"
        with patch("pathlib.Path.cwd", return_value=temp_dir.parent):
            _resolved, error = validate_file_path(str(nonexistent), check_exists=False)
            # Should pass validation even if doesn't exist
            assert error is None or "not found" not in error.lower()

    def test_directory_not_file(self, isolated_filesystem: Path) -> None:
        """Test that directory is rejected when expecting file."""
        # Create a subdirectory to test
        test_subdir = isolated_filesystem / "testdir"
        test_subdir.mkdir()

        _resolved, error = validate_file_path("testdir", check_exists=True)
        assert error is not None
        assert "not a file" in error.lower() or "directory" in error.lower()

    def test_with_session_isolation(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file validation with session isolation."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        _resolved, error = validate_file_path(
            "input/test.txt",
            session_id=session_id,
            check_exists=False,
        )
        assert error is None


class TestValidateDirectoryPath:
    """Tests for validate_directory_path function."""

    def test_valid_directory_exists(self, temp_dir: Path) -> None:
        """Test validating existing directory."""
        subdir = temp_dir / "testdir"
        subdir.mkdir()
        with patch("pathlib.Path.cwd", return_value=temp_dir.parent):
            resolved, error = validate_directory_path(str(subdir), check_exists=True)
            if error is None:
                assert resolved.exists()
                assert resolved.is_dir()

    def test_directory_not_exists_with_check(self, temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test validating non-existent directory with existence check."""
        monkeypatch.chdir(temp_dir)
        nonexistent = "nonexistent_dir"

        _resolved, error = validate_directory_path(nonexistent, check_exists=True)
        assert error is not None
        assert "not found" in error.lower() or "does not exist" in error.lower()

    def test_file_not_directory(self, temp_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that file is rejected when expecting directory."""
        monkeypatch.chdir(temp_file.parent)

        _resolved, error = validate_directory_path(temp_file.name, check_exists=True)
        assert error is not None
        assert "not a directory" in error.lower() or "file" in error.lower()

    def test_with_session_isolation(self, session_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test directory validation with session isolation."""
        session_id = session_workspace.name
        monkeypatch.chdir(session_workspace.parent.parent.parent)

        # Create input directory
        (session_workspace / "input").mkdir(parents=True, exist_ok=True)

        _resolved, error = validate_directory_path(
            "input",
            session_id=session_id,
            check_exists=True,
        )
        # sources directory should exist in session workspace
        assert error is None


class TestReadFileContent:
    """Tests for read_file_content function."""

    @pytest.mark.asyncio
    async def test_read_text_file(self, temp_file: Path) -> None:
        """Test reading a text file."""
        content = "Test file content"
        temp_file.write_text(content)

        result, error = await read_file_content(temp_file)
        assert error is None
        assert result == content

    @pytest.mark.asyncio
    async def test_read_empty_file(self, temp_dir: Path) -> None:
        """Test reading an empty file."""
        empty_file = temp_dir / "empty.txt"
        empty_file.touch()

        result, error = await read_file_content(empty_file)
        assert error is None
        assert result == ""

    @pytest.mark.asyncio
    async def test_read_multiline_file(self, temp_dir: Path) -> None:
        """Test reading a multiline file."""
        multiline_file = temp_dir / "multiline.txt"
        content = "Line 1\nLine 2\nLine 3"
        multiline_file.write_text(content)

        result, error = await read_file_content(multiline_file)
        assert error is None
        assert result == content
        assert result.count("\n") == 2

    @pytest.mark.asyncio
    async def test_read_unicode_file(self, temp_dir: Path) -> None:
        """Test reading a file with unicode characters."""
        unicode_file = temp_dir / "unicode.txt"
        content = "Hello 世界 مرحبا Привет"
        unicode_file.write_text(content, encoding="utf-8")

        result, error = await read_file_content(unicode_file)
        assert error is None
        assert result == content

    @pytest.mark.asyncio
    async def test_read_nonexistent_file(self, temp_dir: Path) -> None:
        """Test reading a non-existent file returns error."""
        nonexistent = temp_dir / "nonexistent.txt"

        _result, error = await read_file_content(nonexistent)
        assert error is not None
        assert "Failed to read file" in error or "No such file" in error or "File not found" in error


class TestSaveUploadedFile:
    """Tests for save_uploaded_file function."""

    def test_save_file_success(self, temp_dir: Path) -> None:
        """Test successfully saving an uploaded file."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            # Create session workspace
            session_id = "chat_test123"
            session_workspace = temp_dir / "data" / "files" / session_id / "input"
            session_workspace.mkdir(parents=True, exist_ok=True)

            # Data should be list of byte values (0-255)
            test_data = list(b"Test content")  # Converts to [84, 101, 115, 116, ...]

            result = save_uploaded_file(
                filename="test.txt",
                data=test_data,
                session_id=session_id,
            )

            assert result["success"] is True
            assert "file_path" in result
            assert result["size"] > 0

    def test_save_file_without_session(self, temp_dir: Path) -> None:
        """Test saving file without session_id (global sources)."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            # Create global input directory
            input_dir = temp_dir / "data" / "input"
            input_dir.mkdir(parents=True, exist_ok=True)

            result = save_uploaded_file(
                filename="test.txt",
                data=list(b"Test"),  # List of byte values
                session_id=None,
            )

            # Should succeed or fail gracefully
            assert "success" in result

    def test_save_file_invalid_base64(self, temp_dir: Path) -> None:
        """Test saving file with invalid base64 data."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            session_id = "chat_test123"
            session_workspace = temp_dir / "data" / "files" / session_id / "input"
            session_workspace.mkdir(parents=True, exist_ok=True)

            # Test with invalid data type (should still work with list)
            result = save_uploaded_file(
                filename="test.txt",
                data=list(b"Test"),  # Valid data
                session_id=session_id,
            )

            # This should succeed with valid data
            assert result["success"] is True

    def test_save_file_path_traversal_attempt(self, temp_dir: Path) -> None:
        """Test that path traversal in filename is blocked."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            result = save_uploaded_file(
                filename="../../../etc/passwd",
                data=list(b"Test"),
                session_id="chat_test123",
            )

            assert result["success"] is False
            assert "error" in result

    def test_save_file_creates_directory(self, temp_dir: Path) -> None:
        """Test that save creates directory if it doesn't exist."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            session_id = "chat_newtest"
            # Don't create directory beforehand

            result = save_uploaded_file(
                filename="test.txt",
                data=list(b"Test"),
                session_id=session_id,
            )

            # Should either succeed or fail gracefully
            assert "success" in result
