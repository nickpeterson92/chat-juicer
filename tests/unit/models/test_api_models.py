"""Tests for API models module.

Tests Pydantic models used for function/tool response formats.
"""

from __future__ import annotations

import json

from models.api_models import (
    DirectoryListResponse,
    DocumentGenerateResponse,
    FileInfo,
    FileReadResponse,
    FunctionResponse,
    SearchFilesResponse,
    TextEditResponse,
)


class TestFunctionResponse:
    """Tests for FunctionResponse model."""

    def test_success_response(self) -> None:
        """Test successful function response."""
        response = FunctionResponse(success=True, data={"result": "value"})
        assert response.success is True
        assert response.data == {"result": "value"}
        assert response.error is None

    def test_error_response(self) -> None:
        """Test error function response."""
        response = FunctionResponse(success=False, error="Something failed")
        assert response.success is False
        assert response.error == "Something failed"
        assert response.data is None

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        response = FunctionResponse(success=True, data={"key": "value"})
        json_str = response.to_json()
        data = json.loads(json_str)
        assert data["success"] is True
        assert data["data"] == {"key": "value"}

    def test_to_json_excludes_none(self) -> None:
        """Test that None values are excluded from JSON."""
        response = FunctionResponse(success=True)
        json_str = response.to_json()
        data = json.loads(json_str)
        assert "data" not in data
        assert "error" not in data


class TestFileInfo:
    """Tests for FileInfo model."""

    def test_file_info(self) -> None:
        """Test file information model."""
        file_info = FileInfo(
            name="test.txt",
            type="file",
            size=1024,
            modified="2025-01-01T12:00:00",
            extension=".txt",
        )
        assert file_info.name == "test.txt"
        assert file_info.type == "file"
        assert file_info.size == 1024
        assert file_info.extension == ".txt"

    def test_folder_info(self) -> None:
        """Test folder information model."""
        folder_info = FileInfo(
            name="my_folder",
            type="folder",
            size=0,
            file_count=5,
        )
        assert folder_info.name == "my_folder"
        assert folder_info.type == "folder"
        assert folder_info.file_count == 5

    def test_minimal_file_info(self) -> None:
        """Test file info with minimal fields."""
        file_info = FileInfo(name="test", type="file")
        assert file_info.size == 0
        assert file_info.modified is None
        assert file_info.extension is None


class TestDirectoryListResponse:
    """Tests for DirectoryListResponse model."""

    def test_successful_directory_list(self) -> None:
        """Test successful directory listing."""
        files = [
            FileInfo(name="file1.txt", type="file", size=100),
            FileInfo(name="folder1", type="folder", file_count=3),
        ]
        response = DirectoryListResponse(
            success=True,
            path="/test/path",
            items=files,
        )
        assert response.success is True
        assert response.path == "/test/path"
        assert len(response.items) == 2
        assert response.error is None

    def test_failed_directory_list(self) -> None:
        """Test failed directory listing."""
        response = DirectoryListResponse(
            success=False,
            path="/invalid/path",
            items=[],
            error="Directory not found",
        )
        assert response.success is False
        assert response.error == "Directory not found"
        assert len(response.items) == 0

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        response = DirectoryListResponse(
            path="/test",
            items=[FileInfo(name="test.txt", type="file")],
        )
        json_str = response.to_json()
        data = json.loads(json_str)
        assert data["path"] == "/test"
        assert len(data["items"]) == 1


class TestFileReadResponse:
    """Tests for FileReadResponse model."""

    def test_successful_file_read(self) -> None:
        """Test successful file read response."""
        response = FileReadResponse(
            success=True,
            content="File contents here",
            file_path="/test/file.txt",
            size=1024,
            format="text",
        )
        assert response.success is True
        assert response.content == "File contents here"
        assert response.file_path == "/test/file.txt"
        assert response.size == 1024
        assert response.format == "text"
        assert response.error is None

    def test_failed_file_read(self) -> None:
        """Test failed file read response."""
        response = FileReadResponse(
            success=False,
            error="File not found",
        )
        assert response.success is False
        assert response.error == "File not found"
        assert response.content is None

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        response = FileReadResponse(
            content="Test content",
            file_path="/test.txt",
        )
        json_str = response.to_json()
        data = json.loads(json_str)
        assert data["content"] == "Test content"


class TestDocumentGenerateResponse:
    """Tests for DocumentGenerateResponse model."""

    def test_successful_document_generate(self) -> None:
        """Test successful document generation."""
        response = DocumentGenerateResponse(
            success=True,
            output_file="/output/doc.pdf",
            size=2048,
            message="Document generated successfully",
        )
        assert response.success is True
        assert response.output_file == "/output/doc.pdf"
        assert response.size == 2048
        assert response.message == "Document generated successfully"

    def test_failed_document_generate(self) -> None:
        """Test failed document generation."""
        response = DocumentGenerateResponse(
            success=False,
            error="Template not found",
        )
        assert response.success is False
        assert response.error == "Template not found"

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        response = DocumentGenerateResponse(
            output_file="/doc.pdf",
            message="Success",
        )
        json_str = response.to_json()
        data = json.loads(json_str)
        assert data["output_file"] == "/doc.pdf"


class TestTextEditResponse:
    """Tests for TextEditResponse model."""

    def test_successful_text_edit(self) -> None:
        """Test successful text edit response."""
        response = TextEditResponse(
            success=True,
            file_path="/test/file.txt",
            changes_made=3,
            message="3 replacements made",
            original_text="old text",
            new_text="new text",
        )
        assert response.success is True
        assert response.file_path == "/test/file.txt"
        assert response.changes_made == 3
        assert response.message == "3 replacements made"
        assert response.original_text == "old text"
        assert response.new_text == "new text"

    def test_failed_text_edit(self) -> None:
        """Test failed text edit response."""
        response = TextEditResponse(
            success=False,
            error="File is read-only",
        )
        assert response.success is False
        assert response.error == "File is read-only"
        assert response.changes_made == 0

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        response = TextEditResponse(
            file_path="/test.txt",
            changes_made=1,
        )
        json_str = response.to_json()
        data = json.loads(json_str)
        assert data["changes_made"] == 1


class TestSearchFilesResponse:
    """Tests for SearchFilesResponse model."""

    def test_successful_search(self) -> None:
        """Test successful file search."""
        files = [
            FileInfo(name="test1.py", type="file", size=100),
            FileInfo(name="test2.py", type="file", size=200),
        ]
        response = SearchFilesResponse(
            success=True,
            pattern="*.py",
            base_path="/project",
            items=files,
            count=2,
            truncated=False,
        )
        assert response.success is True
        assert response.pattern == "*.py"
        assert response.base_path == "/project"
        assert response.count == 2
        assert len(response.items) == 2
        assert response.truncated is False

    def test_truncated_search_results(self) -> None:
        """Test search with truncated results."""
        files = [FileInfo(name=f"file{i}.txt", type="file") for i in range(100)]
        response = SearchFilesResponse(
            pattern="*.txt",
            base_path="/project",
            items=files,
            count=100,
            truncated=True,
        )
        assert response.truncated is True
        assert response.count == 100

    def test_failed_search(self) -> None:
        """Test failed file search."""
        response = SearchFilesResponse(
            success=False,
            pattern="*.invalid",
            base_path="/invalid",
            items=[],
            count=0,
            error="Invalid pattern",
        )
        assert response.success is False
        assert response.error == "Invalid pattern"
        assert response.count == 0

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        response = SearchFilesResponse(
            pattern="*.txt",
            base_path="/test",
            items=[],
            count=0,
        )
        json_str = response.to_json()
        data = json.loads(json_str)
        assert data["pattern"] == "*.txt"
        assert data["count"] == 0
