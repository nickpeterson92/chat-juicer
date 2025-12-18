"""Tests for document generation tools.

Tests agent tools for document creation.
"""

from __future__ import annotations

import json

from pathlib import Path
from unittest.mock import patch

import pytest

from tools.document_generation import generate_document


class TestGenerateDocument:
    """Tests for generate_document function."""

    @pytest.fixture(autouse=True)
    def setup_project_root(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Patch PROJECT_ROOT for all tests in this class."""
        import utils.file_utils

        monkeypatch.setattr(utils.file_utils, "PROJECT_ROOT", tmp_path)
        monkeypatch.setattr(utils.file_utils, "DATA_FILES_PATH", tmp_path / "data" / "files")

    @pytest.mark.asyncio
    async def test_generate_document_success(self, tmp_path: Path) -> None:
        """Test successful document generation."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        content = "# Test Document\n\nThis is test content."
        result = await generate_document(content, "test.md")

        data = json.loads(result)
        assert data["success"] is True
        assert "test.md" in data["output_file"]
        assert data["size"] > 0

        # Verify file was created
        assert (output_dir / "test.md").exists()

    @pytest.mark.asyncio
    async def test_generate_document_with_subdirectory(self, tmp_path: Path) -> None:
        """Test generating document in subdirectory."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        content = "Test content"
        result = await generate_document(content, "reports/test.md")

        data = json.loads(result)
        assert data["success"] is True

        # Verify file and parent directory were created
        assert (output_dir / "reports" / "test.md").exists()

    @pytest.mark.asyncio
    async def test_generate_document_overwrites_existing(self, tmp_path: Path) -> None:
        """Test generating document overwrites existing file."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        # Create existing file
        test_file = output_dir / "test.md"
        test_file.write_text("Old content")

        # Generate new document (overwrites existing)
        result = await generate_document("New content", "test.md")

        data = json.loads(result)
        assert data["success"] is True

        # Verify new content replaced old
        assert test_file.read_text() == "New content"

    @pytest.mark.asyncio
    async def test_generate_document_with_session(self, tmp_path: Path) -> None:
        """Test generating document with session workspace."""
        # Create session workspace
        session_workspace = tmp_path / "data" / "files" / "chat_test" / "output"
        session_workspace.mkdir(parents=True)

        content = "Session content"
        result = await generate_document(content, "session_doc.md", session_id="chat_test")

        data = json.loads(result)
        assert data["success"] is True

        # Verify file was created in session workspace
        assert (session_workspace / "session_doc.md").exists()

    @pytest.mark.asyncio
    async def test_generate_document_invalid_path(self) -> None:
        """Test generating document with invalid path."""
        # Try to use path traversal
        result = await generate_document("content", "../../../etc/passwd")

        data = json.loads(result)
        assert data["success"] is False
        assert "error" in data

    @pytest.mark.asyncio
    async def test_generate_document_write_error(self, tmp_path: Path) -> None:
        """Test error handling when write fails."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        with patch("tools.document_generation.write_file_content") as mock_write:
            mock_write.return_value = (None, "Write failed")

            result = await generate_document("content", "test.md")

            data = json.loads(result)
            assert data["success"] is False
            assert "error" in data

    @pytest.mark.asyncio
    async def test_generate_document_exception(self) -> None:
        """Test error handling when exception occurs."""
        with patch("tools.document_generation.validate_file_path") as mock_validate:
            mock_validate.side_effect = Exception("Unexpected error")

            result = await generate_document("content", "test.md")

            data = json.loads(result)
            assert data["success"] is False
            assert "Failed to generate document" in data["error"]

    @pytest.mark.asyncio
    async def test_generate_document_stats(self, tmp_path: Path) -> None:
        """Test that document stats are calculated correctly."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        content = "Line 1\nLine 2\nLine 3"
        result = await generate_document(content, "stats_test.md")

        data = json.loads(result)
        assert data["success"] is True
        assert data["size"] == len(content.encode("utf-8"))
        assert "3 lines" in data["message"]
