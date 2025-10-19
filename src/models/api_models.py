"""
API response models for Wishgate functions.
Provides standardized response schemas for tool outputs.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class FunctionResponse(BaseModel):
    """Standardized response format for all functions."""

    success: bool
    data: dict[str, Any] | None = None
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        json_str: str = self.model_dump_json(exclude_none=True, indent=indent)
        return json_str


class FileInfo(BaseModel):
    """Information about a file or directory."""

    name: str
    type: Literal["file", "folder"]
    size: int = 0
    modified: str | None = None
    file_count: int | None = None  # For directories
    extension: str | None = None  # For files


class DirectoryListResponse(BaseModel):
    """Response model for list_directory function."""

    success: bool = True
    path: str
    items: list[FileInfo]
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string for function return."""
        return self.model_dump_json(exclude_none=True, indent=indent)


class FileReadResponse(BaseModel):
    """Response model for read_file function."""

    success: bool = True
    content: str | None = None
    file_path: str | None = None
    size: int | None = None
    format: str | None = None  # e.g., "text", "pdf", "docx"
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string for function return."""
        return self.model_dump_json(exclude_none=True, indent=indent)


class DocumentGenerateResponse(BaseModel):
    """Response model for generate_document function."""

    success: bool = True
    output_file: str | None = None
    size: int | None = None
    message: str | None = None
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string for function return."""
        return self.model_dump_json(exclude_none=True, indent=indent)


class TextEditResponse(BaseModel):
    """Response model for text editing functions."""

    success: bool = True
    file_path: str | None = None
    changes_made: int = 0
    message: str | None = None
    original_text: str | None = None
    new_text: str | None = None
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string for function return."""
        return self.model_dump_json(exclude_none=True, indent=indent)


class SearchFilesResponse(BaseModel):
    """Response model for search_files function."""

    success: bool = True
    pattern: str
    base_path: str
    items: list[FileInfo]
    count: int
    truncated: bool = False  # True if results limited by max_results
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string for function return."""
        return self.model_dump_json(exclude_none=True, indent=indent)


__all__ = [
    "DirectoryListResponse",
    "DocumentGenerateResponse",
    "FileInfo",
    "FileReadResponse",
    "FunctionResponse",
    "SearchFilesResponse",
    "TextEditResponse",
]
