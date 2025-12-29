"""IPC communication type definitions for Electron ↔ Python data transfer.

This module defines TypedDict types for structured data passed between the Python
backend and Electron frontend via IPC (Inter-Process Communication). These types
provide type safety for dictionary-based data structures that are serialized to
JSON for cross-process communication.

Usage:
    from models.ipc_models import UploadResult

    def save_file(...) -> UploadResult:
        return {"success": True, "file_path": "...", "size": 123, "message": "..."}
"""

from __future__ import annotations

from typing import Literal, TypedDict


class UploadSuccess(TypedDict):
    """Successful file upload response.

    Returned when a file is successfully saved to the session workspace or
    general input directory. Includes metadata about the saved file.

    Attributes:
        success: Always True for successful uploads
        file_path: Relative path to the saved file from project root
        size: File size in bytes
        message: Human-readable success message (e.g., "Saved file.txt (1,234 bytes)")
    """

    success: Literal[True]
    file_path: str
    size: int
    message: str


class UploadError(TypedDict):
    """Failed file upload response.

    Returned when file upload fails due to validation errors, I/O errors,
    or security constraints (e.g., path traversal attempts).

    Attributes:
        success: Always False for failed uploads
        error: Human-readable error message describing the failure
    """

    success: Literal[False]
    error: str


# Union type for all possible upload responses
# Type narrowing works via the 'success' discriminator field:
#   if result["success"]:  # Type narrowed to UploadSuccess
#       path = result["file_path"]  # ✅ Type-safe access
#   else:  # Type narrowed to UploadError
#       error = result["error"]  # ✅ Type-safe access
UploadResult = UploadSuccess | UploadError


__all__ = [
    "UploadError",
    "UploadResult",
    "UploadSuccess",
]
