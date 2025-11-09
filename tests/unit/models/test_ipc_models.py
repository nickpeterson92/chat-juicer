"""Tests for IPC models module.

Tests TypedDict definitions used for IPC communication between Python and Electron.
"""

from __future__ import annotations

from models.ipc_models import UploadError, UploadResult, UploadSuccess


class TestUploadSuccess:
    """Tests for UploadSuccess TypedDict."""

    def test_upload_success_structure(self) -> None:
        """Test creating successful upload result."""
        result: UploadSuccess = {
            "success": True,
            "file_path": "data/files/chat_123/sources/test.txt",
            "size": 1024,
            "message": "Saved test.txt (1,024 bytes)",
        }
        assert result["success"] is True
        assert result["file_path"] == "data/files/chat_123/sources/test.txt"
        assert result["size"] == 1024
        assert "test.txt" in result["message"]

    def test_upload_success_type_checking(self) -> None:
        """Test that UploadSuccess has required fields."""
        result: UploadSuccess = {
            "success": True,
            "file_path": "/path/to/file",
            "size": 500,
            "message": "Success",
        }
        # Verify all required keys are present
        assert "success" in result
        assert "file_path" in result
        assert "size" in result
        assert "message" in result


class TestUploadError:
    """Tests for UploadError TypedDict."""

    def test_upload_error_structure(self) -> None:
        """Test creating failed upload result."""
        result: UploadError = {
            "success": False,
            "error": "File not found",
        }
        assert result["success"] is False
        assert result["error"] == "File not found"

    def test_upload_error_with_detailed_message(self) -> None:
        """Test upload error with detailed error message."""
        result: UploadError = {
            "success": False,
            "error": "Path traversal attempt detected: ../../../etc/passwd",
        }
        assert result["success"] is False
        assert "Path traversal" in result["error"]


class TestUploadResult:
    """Tests for UploadResult union type."""

    def test_upload_result_success_variant(self) -> None:
        """Test UploadResult with success variant."""
        result: UploadResult = {
            "success": True,
            "file_path": "/test/path",
            "size": 100,
            "message": "OK",
        }
        # Type narrowing via discriminator
        if result["success"]:
            assert result["file_path"] == "/test/path"
            assert result["size"] == 100

    def test_upload_result_error_variant(self) -> None:
        """Test UploadResult with error variant."""
        result: UploadResult = {
            "success": False,
            "error": "Upload failed",
        }
        # Type narrowing via discriminator
        if not result["success"]:
            assert result["error"] == "Upload failed"

    def test_type_narrowing_with_success_flag(self) -> None:
        """Test that type narrowing works correctly based on success flag."""
        success_result: UploadResult = {
            "success": True,
            "file_path": "/path",
            "size": 123,
            "message": "Done",
        }
        error_result: UploadResult = {
            "success": False,
            "error": "Failed",
        }

        # Test type narrowing
        assert success_result["success"] is True
        assert error_result["success"] is False

        # Access type-specific fields
        if success_result["success"]:
            _ = success_result["file_path"]  # Should be accessible

        if not error_result["success"]:
            _ = error_result["error"]  # Should be accessible
