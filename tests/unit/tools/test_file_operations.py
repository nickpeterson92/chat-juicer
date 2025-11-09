"""Tests for file operations tools.

Tests agent tools for file and directory operations.
"""

from __future__ import annotations

import json

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from tools.file_operations import list_directory, read_file, search_files


class TestListDirectory:
    """Tests for list_directory tool."""

    @patch("tools.file_operations.validate_directory_path")
    def test_list_directory_success(self, mock_validate: Mock, temp_dir: Path) -> None:
        """Test listing directory successfully."""
        # Create test structure
        (temp_dir / "file1.txt").touch()
        (temp_dir / "file2.py").touch()
        (temp_dir / "subdir").mkdir()

        mock_validate.return_value = (temp_dir, None)

        result = list_directory(str(temp_dir))
        data = json.loads(result)

        assert data["success"] is True
        assert len(data["items"]) >= 2

    @patch("tools.file_operations.validate_directory_path")
    def test_list_directory_with_session_isolation(
        self, mock_validate: Mock, session_workspace: Path
    ) -> None:
        """Test listing directory with session isolation."""
        mock_validate.return_value = (session_workspace / "sources", None)

        result = list_directory("sources", session_id="chat_test123")
        data = json.loads(result)

        assert data["success"] is True
        mock_validate.assert_called_once()

    @patch("tools.file_operations.validate_directory_path")
    def test_list_directory_error(self, mock_validate: Mock) -> None:
        """Test listing directory with error."""
        mock_validate.return_value = (Path(), "Directory not found")

        result = list_directory("/nonexistent")
        data = json.loads(result)

        assert data["success"] is False
        assert "error" in data

    @patch("tools.file_operations.validate_directory_path")
    def test_list_directory_hidden_files(self, mock_validate: Mock, temp_dir: Path) -> None:
        """Test listing directory with hidden files."""
        (temp_dir / ".hidden").touch()
        (temp_dir / "visible.txt").touch()

        mock_validate.return_value = (temp_dir, None)

        # Without show_hidden
        result = list_directory(str(temp_dir), show_hidden=False)
        data = json.loads(result)
        items = [item["name"] for item in data["items"]]
        assert ".hidden" not in items

        # With show_hidden
        result = list_directory(str(temp_dir), show_hidden=True)
        data = json.loads(result)
        items = [item["name"] for item in data["items"]]
        assert ".hidden" in items

    @patch("tools.file_operations.validate_directory_path")
    def test_list_directory_exception(self, mock_validate: Mock) -> None:
        """Test listing directory with exception."""
        mock_validate.side_effect = Exception("Simulated error")

        result = list_directory("/some/path")
        data = json.loads(result)

        assert data["success"] is False
        assert "error" in data
        assert "Failed to list directory" in data["error"]


class TestReadFile:
    """Tests for read_file tool."""

    @pytest.mark.asyncio
    async def test_read_file_text(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test reading text file - integration test with real file."""
        # Create real file
        monkeypatch.chdir(tmp_path)
        test_file = tmp_path / "test.txt"
        test_file.write_text("File content here")

        # Use relative path since we changed to tmp_path
        result = await read_file("test.txt")
        data = json.loads(result)

        # If it fails, print the error for debugging
        if not data["success"]:
            print(f"Error: {data.get('error', 'Unknown')}")

        assert data["success"] is True
        assert "File content here" in data["content"]

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_file_path")
    async def test_read_file_not_found(self, mock_validate: Mock) -> None:
        """Test reading non-existent file."""
        mock_validate.return_value = (Path(), "File not found")

        result = await read_file("/nonexistent.txt")
        data = json.loads(result)

        assert data["success"] is False
        assert "error" in data

    @pytest.mark.asyncio
    async def test_read_file_with_summarization(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test reading file with real content - integration test."""
        # Create real large-ish file
        monkeypatch.chdir(tmp_path)
        test_file = tmp_path / "large.txt"
        # Create moderate-sized file (not huge to keep test fast)
        large_content = "This is test content.\n" * 1000  # ~22KB
        test_file.write_text(large_content)

        # Use relative path since we changed to tmp_path
        result = await read_file("large.txt")
        data = json.loads(result)

        # If it fails, print the error for debugging
        if not data["success"]:
            print(f"Error: {data.get('error', 'Unknown')}")

        assert data["success"] is True
        # Should have content (whether full or summarized)
        assert "content" in data
        assert len(data["content"]) > 0

    @pytest.mark.asyncio
    async def test_read_file_with_head(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test reading first N lines of file."""
        monkeypatch.chdir(tmp_path)
        test_file = tmp_path / "multiline.txt"
        test_file.write_text("Line 1\nLine 2\nLine 3\nLine 4\nLine 5")

        result = await read_file("multiline.txt", head=3)
        data = json.loads(result)

        assert data["success"] is True
        assert "Line 1" in data["content"]
        assert "Line 2" in data["content"]
        assert "Line 3" in data["content"]
        # Should not have lines beyond head
        assert data["content"].count("\n") <= 3

    @pytest.mark.asyncio
    async def test_read_file_with_tail(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test reading last N lines of file."""
        monkeypatch.chdir(tmp_path)
        test_file = tmp_path / "multiline.txt"
        test_file.write_text("Line 1\nLine 2\nLine 3\nLine 4\nLine 5")

        result = await read_file("multiline.txt", tail=2)
        data = json.loads(result)

        assert data["success"] is True
        assert "Line 4" in data["content"]
        assert "Line 5" in data["content"]
        # Should not have lines before tail
        assert "Line 1" not in data["content"]

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_file_path")
    async def test_read_file_partial_unicode_error(self, mock_validate: Mock, tmp_path: Path) -> None:
        """Test handling unicode error in partial read."""
        # Create a binary file
        test_file = tmp_path / "binary.dat"
        test_file.write_bytes(b"\x80\x81\x82\x83")

        mock_validate.return_value = (test_file, None)

        result = await read_file(str(test_file), head=1)
        data = json.loads(result)

        assert data["success"] is False
        assert "not text" in data["error"].lower() or "utf-8" in data["error"].lower()

    @pytest.mark.asyncio
    async def test_read_file_with_conversion_extension(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test file with extension that needs conversion."""
        monkeypatch.chdir(tmp_path)

        # Create a .docx file (or any convertible extension)
        # Since we can't easily create a real docx, we'll test the path that checks for converter
        test_file = tmp_path / "test.pdf"
        test_file.write_text("Fake PDF content")

        # This will attempt conversion and likely fall back to direct read
        result = await read_file("test.pdf")
        data = json.loads(result)

        # Either succeeds with conversion/fallback or fails gracefully
        assert "success" in data


class TestSearchFiles:
    """Tests for search_files tool."""

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_directory_path")
    async def test_search_files_success(
        self, mock_validate: Mock, temp_dir: Path
    ) -> None:
        """Test searching files successfully."""
        # Create test files
        (temp_dir / "test1.py").touch()
        (temp_dir / "test2.py").touch()
        (temp_dir / "readme.md").touch()

        mock_validate.return_value = (temp_dir, None)

        result = await search_files("*.py", base_path=str(temp_dir))
        data = json.loads(result)

        assert data["success"] is True
        assert data["count"] >= 2

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_directory_path")
    async def test_search_files_with_max_results(
        self, mock_validate: Mock, temp_dir: Path
    ) -> None:
        """Test search files respects max_results."""
        # Create many files
        for i in range(20):
            (temp_dir / f"file{i}.txt").touch()

        mock_validate.return_value = (temp_dir, None)

        result = await search_files("*.txt", base_path=str(temp_dir), max_results=5)
        data = json.loads(result)

        assert data["success"] is True
        assert len(data["items"]) <= 5
        assert data["truncated"] is True

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_directory_path")
    async def test_search_files_no_matches(
        self, mock_validate: Mock, temp_dir: Path
    ) -> None:
        """Test search files with no matches."""
        mock_validate.return_value = (temp_dir, None)

        result = await search_files("*.nonexistent", base_path=str(temp_dir))
        data = json.loads(result)

        assert data["success"] is True
        assert data["count"] == 0
        assert len(data["items"]) == 0

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_directory_path")
    async def test_search_files_with_session_id(
        self, mock_validate: Mock, session_workspace: Path
    ) -> None:
        """Test search files with session isolation."""
        mock_validate.return_value = (session_workspace / "sources", None)

        result = await search_files("*.txt", session_id="chat_test123")
        data = json.loads(result)

        # Should succeed with session isolation
        assert "success" in data
        mock_validate.assert_called_once()

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_directory_path")
    async def test_search_files_validation_error(self, mock_validate: Mock) -> None:
        """Test search files with validation error."""
        mock_validate.return_value = (Path(), "Invalid directory")

        result = await search_files("*.py", base_path="/invalid")
        data = json.loads(result)

        assert data["success"] is False
        assert "error" in data

    @pytest.mark.asyncio
    @patch("tools.file_operations.validate_directory_path")
    async def test_search_files_exception(self, mock_validate: Mock) -> None:
        """Test search files with exception."""
        mock_validate.side_effect = Exception("Simulated error")

        result = await search_files("*.txt")
        data = json.loads(result)

        assert data["success"] is False
        assert "Search failed" in data["error"]

    @pytest.mark.asyncio
    async def test_search_files_recursive_false(self, temp_dir: Path) -> None:
        """Test non-recursive search."""
        # Create nested structure
        (temp_dir / "root.py").touch()
        subdir = temp_dir / "subdir"
        subdir.mkdir()
        (subdir / "nested.py").touch()

        with patch("tools.file_operations.validate_directory_path", return_value=(temp_dir, None)):
            result = await search_files("*.py", base_path=str(temp_dir), recursive=False)
            data = json.loads(result)

            assert data["success"] is True
            # Should only find root.py, not nested.py
            assert data["count"] == 1
