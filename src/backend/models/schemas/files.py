"""
File-related API schemas.

Provides request/response models for file operations
with comprehensive OpenAPI documentation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FileInfo(BaseModel):
    """File or directory metadata."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "report.pdf",
                "type": "file",
                "size": 245760,
                "modified": "2025-01-15T10:30:00Z",
                "extension": ".pdf",
            }
        }
    )

    name: str = Field(
        ...,
        description="File or directory name",
        json_schema_extra={"example": "report.pdf"},
    )
    type: Literal["file", "folder"] = Field(
        ...,
        description="Item type",
        json_schema_extra={"example": "file"},
    )
    size: int = Field(
        default=0,
        ge=0,
        description="Size in bytes (0 for directories)",
        json_schema_extra={"example": 245760},
    )
    modified: datetime | None = Field(
        default=None,
        description="Last modification timestamp",
        json_schema_extra={"example": "2025-01-15T10:30:00Z"},
    )
    file_count: int | None = Field(
        default=None,
        ge=0,
        description="Number of files (for directories only)",
        json_schema_extra={"example": 5},
    )
    extension: str | None = Field(
        default=None,
        description="File extension including dot (for files only)",
        json_schema_extra={"example": ".pdf"},
    )


class FileListResponse(BaseModel):
    """List of files in a session folder."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "files": [
                    {
                        "name": "report.pdf",
                        "type": "file",
                        "size": 245760,
                        "extension": ".pdf",
                    },
                    {
                        "name": "data.csv",
                        "type": "file",
                        "size": 1024,
                        "extension": ".csv",
                    },
                ],
                "folder": "input",
                "count": 2,
            }
        }
    )

    files: list[FileInfo] = Field(
        ...,
        description="List of files in the folder",
    )
    folder: str = Field(
        default="input",
        description="Folder name within session",
        json_schema_extra={"example": "input"},
    )
    count: int = Field(
        default=0,
        ge=0,
        description="Total number of files",
        json_schema_extra={"example": 2},
    )


class FileUploadResponse(BaseModel):
    """Response from file upload."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "document.pdf",
                "type": "file",
                "size": 102400,
                "modified": "2025-01-15T10:30:00Z",
                "extension": ".pdf",
                "path": "sources/document.pdf",
            }
        }
    )

    name: str = Field(..., description="Uploaded file name")
    type: Literal["file"] = Field(default="file", description="Always 'file'")
    size: int = Field(..., ge=0, description="File size in bytes")
    modified: datetime | None = Field(default=None, description="Upload timestamp")
    extension: str | None = Field(default=None, description="File extension")
    path: str = Field(
        ...,
        description="Relative path within session",
        json_schema_extra={"example": "sources/document.pdf"},
    )


class FilePathResponse(BaseModel):
    """Local file path for shell.openPath."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "path": "/Users/user/chat-juicer/data/files/sess_123/sources/doc.pdf",
                "exists": True,
            }
        }
    )

    path: str = Field(
        ...,
        description="Absolute file path",
        json_schema_extra={"example": "/data/files/sess_123/sources/doc.pdf"},
    )
    exists: bool = Field(
        default=True,
        description="Whether file exists",
        json_schema_extra={"example": True},
    )


class DeleteFileResponse(BaseModel):
    """Response from file deletion."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "File deleted successfully",
                "filename": "document.pdf",
            }
        }
    )

    success: bool = Field(
        default=True,
        description="Whether the operation succeeded",
    )
    message: str | None = Field(
        default=None,
        description="Result message",
    )
    filename: str | None = Field(
        default=None,
        description="Name of deleted file",
        json_schema_extra={"example": "document.pdf"},
    )
