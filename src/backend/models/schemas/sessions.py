"""
Session-related API schemas.

Provides request/response models for session CRUD operations
with comprehensive OpenAPI documentation.
"""

from __future__ import annotations

import json

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.schemas.base import PaginationMeta

# =============================================================================
# Request Models
# =============================================================================


class CreateSessionRequest(BaseModel):
    """Request body for creating a new chat session."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Project Planning Discussion",
                "model": "gpt-4o",
                "reasoning_effort": "medium",
                "mcp_config": ["sequential-thinking", "fetch"],
            }
        }
    )

    title: str | None = Field(
        default=None,
        max_length=200,
        description="Optional session title (auto-generated if not provided)",
        json_schema_extra={"example": "Project Planning Discussion"},
    )
    model: str | None = Field(
        default=None,
        description="Model to use for this session",
        json_schema_extra={"example": "gpt-4o"},
    )
    reasoning_effort: str | None = Field(
        default=None,
        pattern="^(none|low|medium|high)$",
        description="Reasoning effort level for extended thinking",
        json_schema_extra={"example": "medium"},
    )
    mcp_config: list[str] | None = Field(
        default=None,
        description="List of MCP servers to enable",
        json_schema_extra={"example": ["sequential-thinking", "fetch"]},
    )
    project_id: str | None = Field(
        default=None,
        description="Project ID to assign this session to (immutable after creation)",
        json_schema_extra={"example": "550e8400-e29b-41d4-a716-446655440000"},
    )


class UpdateSessionRequest(BaseModel):
    """Request body for updating an existing session."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Updated Title",
                "pinned": True,
            }
        }
    )

    title: str | None = Field(
        default=None,
        max_length=200,
        description="New session title",
        json_schema_extra={"example": "Updated Title"},
    )
    pinned: bool | None = Field(
        default=None,
        description="Pin/unpin the session",
        json_schema_extra={"example": True},
    )
    model: str | None = Field(
        default=None,
        description="Change the model for future messages",
        json_schema_extra={"example": "gpt-4o"},
    )
    reasoning_effort: str | None = Field(
        default=None,
        pattern="^(none|low|medium|high)$",
        description="Update reasoning effort level",
        json_schema_extra={"example": "high"},
    )
    mcp_config: list[str] | None = Field(
        default=None,
        description="Update enabled MCP servers",
        json_schema_extra={"example": ["sequential-thinking"]},
    )


# =============================================================================
# Response Models
# =============================================================================


class SessionResponse(BaseModel):
    """Session entity with all metadata."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "session_id": "sess_abc123",
                "title": "Project Planning Discussion",
                "model": "gpt-4o",
                "reasoning_effort": "medium",
                "mcp_config": ["sequential-thinking", "fetch"],
                "pinned": False,
                "is_named": True,
                "message_count": 24,
                "total_tokens": 15420,
                "tokens": 15420,
                "max_tokens": 128000,
                "trigger_tokens": 102400,
                "created_at": "2025-01-15T10:30:00Z",
                "last_used_at": "2025-01-15T14:22:00Z",
            }
        }
    )

    id: str = Field(
        ...,
        description="Internal UUID for the session",
        json_schema_extra={"example": "550e8400-e29b-41d4-a716-446655440000"},
    )
    session_id: str = Field(
        ...,
        description="Public session identifier",
        json_schema_extra={"example": "sess_abc123"},
    )
    title: str | None = Field(
        default=None,
        description="Session title",
        json_schema_extra={"example": "Project Planning Discussion"},
    )
    model: str = Field(
        ...,
        description="Model used for this session",
        json_schema_extra={"example": "gpt-4o"},
    )
    reasoning_effort: str = Field(
        ...,
        description="Reasoning effort level",
        json_schema_extra={"example": "medium"},
    )
    mcp_config: list[str] = Field(
        default_factory=list,
        description="Enabled MCP servers",
        json_schema_extra={"example": ["sequential-thinking", "fetch"]},
    )
    pinned: bool = Field(
        default=False,
        description="Whether session is pinned",
        json_schema_extra={"example": False},
    )
    is_named: bool = Field(
        default=False,
        description="Whether session has a custom title",
        json_schema_extra={"example": True},
    )
    message_count: int = Field(
        default=0,
        ge=0,
        description="Total number of messages in session",
        json_schema_extra={"example": 24},
    )
    total_tokens: int = Field(
        default=0,
        ge=0,
        description="Total tokens used in session",
        json_schema_extra={"example": 15420},
    )
    # Token tracking fields for frontend indicator
    tokens: int = Field(
        default=0,
        ge=0,
        description="Current token usage (alias for total_tokens)",
        json_schema_extra={"example": 15420},
    )
    max_tokens: int = Field(
        default=128000,
        ge=0,
        description="Model's context window limit",
        json_schema_extra={"example": 128000},
    )
    trigger_tokens: int = Field(
        default=102400,
        ge=0,
        description="Auto-summarization threshold (80% of max)",
        json_schema_extra={"example": 102400},
    )
    created_at: datetime | None = Field(
        default=None,
        description="Session creation timestamp",
        json_schema_extra={"example": "2025-01-15T10:30:00Z"},
    )
    last_used_at: datetime | None = Field(
        default=None,
        description="Last activity timestamp",
        json_schema_extra={"example": "2025-01-15T14:22:00Z"},
    )
    project_id: str | None = Field(
        default=None,
        description="Project this session belongs to",
        json_schema_extra={"example": "550e8400-e29b-41d4-a716-446655440000"},
    )
    project_name: str | None = Field(
        default=None,
        description="Project name (for display)",
        json_schema_extra={"example": "My Project"},
    )


class MessageResponse(BaseModel):
    """Message entity within a session."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "msg_123",
                "role": "assistant",
                "content": "Here's how to implement that feature...",
                "created_at": "2025-01-15T10:32:00Z",
            }
        }
    )

    id: str = Field(
        ...,
        description="Message identifier",
        json_schema_extra={"example": "msg_123"},
    )
    role: Literal["user", "assistant", "system", "tool_call"] = Field(
        ...,
        description="Message role",
        json_schema_extra={"example": "assistant"},
    )
    content: str | None = Field(
        default=None,
        description="Message content",
        json_schema_extra={"example": "Here's how to implement that feature..."},
    )
    created_at: datetime | None = Field(
        default=None,
        description="Message timestamp",
    )
    # Tool call fields
    tool_call_id: str | None = Field(
        default=None,
        description="Tool call identifier",
    )
    tool_name: str | None = Field(
        default=None,
        description="Name of the tool called",
    )
    tool_arguments: dict[str, Any] | None = Field(
        default=None,
        description="Tool call arguments",
    )

    @field_validator("tool_arguments", mode="before")
    @classmethod
    def parse_tool_arguments(cls, v: Any) -> dict[str, Any] | None:
        if v is None:
            return None
        if isinstance(v, str):
            try:
                parsed: dict[str, Any] = json.loads(v)
                return parsed
            except json.JSONDecodeError:
                return {"raw": v}
        if isinstance(v, dict):
            return v
        return {"raw": str(v)}

    tool_result: str | None = Field(
        default=None,
        description="Tool execution result",
    )
    tool_success: bool | None = Field(
        default=None,
        description="Whether tool execution succeeded",
    )
    status: str | None = Field(
        default=None,
        description="Tool call status",
    )
    partial: bool | None = Field(
        default=None,
        description="Whether response was interrupted",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Optional metadata for the message",
    )


class FileInfoResponse(BaseModel):
    """File metadata for session files."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "document.pdf",
                "type": "file",
                "size": 102400,
                "modified": "2025-01-15T10:30:00Z",
                "extension": ".pdf",
            }
        }
    )

    name: str = Field(..., description="File name")
    type: Literal["file", "folder"] = Field(..., description="Item type")
    size: int = Field(default=0, ge=0, description="Size in bytes")
    modified: datetime | None = Field(default=None, description="Last modified")
    file_count: int | None = Field(default=None, description="Files in folder")
    extension: str | None = Field(default=None, description="File extension")


class SessionListResponse(BaseModel):
    """Paginated list of sessions."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sessions": [
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "session_id": "sess_abc123",
                        "title": "Project Planning",
                        "model": "gpt-4o",
                        "message_count": 24,
                    }
                ],
                "pagination": {
                    "total_count": 42,
                    "offset": 0,
                    "limit": 50,
                    "has_more": False,
                },
            }
        }
    )

    sessions: list[SessionResponse] = Field(
        ...,
        description="List of sessions",
    )
    pagination: PaginationMeta = Field(
        ...,
        description="Pagination metadata",
    )


class SessionWithHistoryResponse(BaseModel):
    """Session with full message history and files."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "session": {"session_id": "sess_abc123", "title": "Discussion"},
                "messages": [{"id": "msg_1", "role": "user", "content": "Hello"}],
                "files": [{"name": "doc.pdf", "type": "file", "size": 1024}],
                "has_more": False,
                "loaded_count": 50,
                "message_count": 24,
            }
        }
    )

    session: SessionResponse = Field(..., description="Session metadata")
    messages: list[MessageResponse] = Field(
        default_factory=list,
        description="Message history",
    )
    files: list[FileInfoResponse] = Field(
        default_factory=list,
        description="Session files",
    )
    has_more: bool = Field(default=False, description="More messages available")
    loaded_count: int = Field(default=0, description="Number of messages loaded")
    message_count: int = Field(default=0, description="Total message count")


class SummarizeResponse(BaseModel):
    """Response from session summarization."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Conversation summarized successfully",
                "summary": "Discussion covered project architecture...",
                "tokens_before": 45000,
                "tokens_after": 12000,
                "tool_call_id": "sum_abc123",
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
    summary: str | None = Field(
        default=None,
        description="Generated summary text",
    )
    tokens_before: int | None = Field(
        default=None,
        ge=0,
        description="Token count before summarization",
    )
    tokens_after: int | None = Field(
        default=None,
        ge=0,
        description="Token count after summarization",
    )
    tool_call_id: str | None = Field(
        default=None,
        description="Tool call ID for frontend card",
    )


class DeleteSessionResponse(BaseModel):
    """Response from session deletion."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Session deleted successfully",
                "session_id": "sess_abc123",
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
    session_id: str | None = Field(
        default=None,
        description="ID of deleted session",
    )
