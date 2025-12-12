"""
API response models for Chat Juicer functions.
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


# -----------------------------------------------------------------------------
# API (FastAPI) response models
# -----------------------------------------------------------------------------


class UserInfo(BaseModel):
    """Public user information."""

    id: str
    email: str
    display_name: str | None = None


class TokenResponse(BaseModel):
    """Auth tokens with bearer type."""

    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user: UserInfo | None = None


class HealthResponse(BaseModel):
    """Health check payload."""

    status: str
    database: str
    version: str


class ModelConfigItem(BaseModel):
    """Model metadata for config endpoint."""

    id: str
    name: str
    provider: str
    context_window: int
    supports_reasoning: bool


class ConfigResponse(BaseModel):
    """Configuration payload for renderer."""

    models: list[ModelConfigItem]
    reasoning_efforts: list[str]
    mcp_servers: list[str]
    max_file_size: int


class FileListResponse(BaseModel):
    """List of files for a session."""

    files: list[FileInfo]


class FilePathResponse(BaseModel):
    """Local path for shell.openPath."""

    path: str


class MessageItem(BaseModel):
    """Message history item.

    For tool_call messages, uses frontend-expected field names:
    - call_id (not tool_call_id)
    - name (not tool_name)
    - arguments (not tool_arguments)
    - result (not tool_result)
    - success (not tool_success)
    - status: "completed" for all persisted tool calls

    For interrupted messages:
    - partial: True if response was interrupted (for CSS styling)
    """

    id: str
    role: str
    content: str | None = None
    created_at: str | None = None
    # Tool call fields - use frontend-expected names
    call_id: str | None = None
    name: str | None = None
    arguments: dict[str, Any] | str | None = None
    result: str | None = None
    success: bool | None = None
    status: str | None = None
    # Interrupted response flag
    partial: bool | None = None


class SessionRecord(BaseModel):
    """Session metadata."""

    id: str
    session_id: str
    title: str | None = None
    model: str
    reasoning_effort: str
    mcp_config: list[str]
    pinned: bool
    is_named: bool
    message_count: int
    total_tokens: int
    created_at: str | None = None
    last_used_at: str | None = None


class SessionWithHistoryResponse(BaseModel):
    """Session plus history/files."""

    session: SessionRecord
    full_history: list[MessageItem]
    files: list[FileInfo]
    has_more: bool
    loaded_count: int
    message_count: int


class SessionListResponse(BaseModel):
    """Paginated session list."""

    sessions: list[SessionRecord]
    total_count: int
    has_more: bool
