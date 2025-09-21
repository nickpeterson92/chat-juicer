"""
Pydantic models for Chat Juicer - Runtime validation for data boundaries.

Provides validation for:
1. IPC messages sent between Electron and Python
2. Session event items from Agent/Runner SDK
3. User input validation
4. Standardized responses

Note: Tool input validation is handled by OpenAI SDK's JSON schema validation.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# ============================================================================
# IPC Messages used in main.py
# ============================================================================


class ErrorNotification(BaseModel):
    """Error notification to frontend - used in send_error()."""

    type: Literal["error"] = "error"
    message: str
    code: str | None = None  # e.g., "rate_limit", "api_error"
    details: dict[str, Any] | None = None


class ToolCallNotification(BaseModel):
    """Tool call notification used in handle_tool_call()."""

    type: str = Field(default="function_detected")  # Backward compatibility
    name: str
    arguments: str | dict[str, Any]  # Can be JSON string or dict
    call_id: str | None = None


class ToolResultNotification(BaseModel):
    """Tool result notification used in handle_tool_output()."""

    type: str = Field(default="function_completed")  # Backward compatibility
    name: str
    result: str | dict[str, Any]  # Tool response (JSON string or dict)
    call_id: str | None = None
    success: bool = True


class AssistantMessage(BaseModel):
    """Assistant message streamed to frontend."""

    type: Literal["assistant_delta", "assistant_start", "assistant_end"]
    content: str | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        return self.model_dump_json(exclude_none=True)


class HandoffMessage(BaseModel):
    """Multi-agent handoff messages."""

    type: Literal["handoff_started", "handoff_completed"]
    target_agent: str | None = None  # For handoff_started
    source_agent: str | None = None  # For handoff_completed
    result: str | None = None  # For handoff_completed

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        return self.model_dump_json(exclude_none=True)


class AgentUpdateMessage(BaseModel):
    """Agent state update message."""

    type: Literal["agent_updated"]
    name: str

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        return self.model_dump_json(exclude_none=True)


class FunctionEventMessage(BaseModel):
    """Function execution event for frontend display."""

    type: Literal["function_started", "function_completed"]
    call_id: str
    success: bool = True
    error: str | None = None
    output: str | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        return self.model_dump_json(exclude_none=True)


# ============================================================================
# Session Event Items for Type Safety
# ============================================================================


class SessionItem(BaseModel):
    """Base model for session conversation items."""

    role: Literal["user", "assistant", "system", "tool", "unknown"] | None = Field(
        default="unknown", description="Role of the message sender"
    )
    content: str | list | dict | None = Field(default=None, description="Content of the message")
    type: str | None = Field(default=None, description="Type of the item (for SDK internal items)")

    @field_validator("content")
    @classmethod
    def normalize_content(cls, v):
        """Ensure content is in a usable format."""
        if v is None or v == "":
            return None
        return v

    def to_dict(self) -> dict:
        """Convert to dictionary for session storage."""
        return self.model_dump(exclude_none=True)


class FunctionCallItem(BaseModel):
    """Model for function call items."""

    type: Literal["function_call"]
    name: str
    arguments: str | dict = Field(default="{}")

    def to_session_item(self) -> SessionItem:
        """Convert to SessionItem format."""
        return SessionItem(
            role="assistant", content=f"[Called tool: {self.name} with arguments: {self.arguments}]", type=self.type
        )


class FunctionOutputItem(BaseModel):
    """Model for function output items."""

    type: Literal["function_call_output"]
    output: Any
    error: str | None = None

    def to_session_item(self) -> SessionItem:
        """Convert to SessionItem format."""
        content = f"[Tool result: {self.output}]" if not self.error else f"[Tool error: {self.error}]"
        return SessionItem(role="assistant", content=content, type=self.type)


# ============================================================================
# User Input Validation
# ============================================================================


class UserInput(BaseModel):
    """Model for validating user input."""

    content: str = Field(min_length=1, max_length=100000)

    @field_validator("content")
    @classmethod
    def clean_content(cls, v):
        """Strip whitespace and validate."""
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Input cannot be empty")
        return cleaned


# ============================================================================
# Standardized Responses
# ============================================================================


class FunctionResponse(BaseModel):
    """Standardized response format for all functions."""

    success: bool
    data: dict[str, Any] | None = None
    error: str | None = None

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return self.model_dump_json(exclude_none=True, indent=indent)


# ============================================================================
# Function-Specific Response Models
# ============================================================================


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


# Export all models
__all__ = [
    "AgentUpdateMessage",
    "AssistantMessage",
    "DirectoryListResponse",
    "DocumentGenerateResponse",
    "ErrorNotification",
    "FileInfo",
    "FileReadResponse",
    "FunctionCallItem",
    "FunctionEventMessage",
    "FunctionOutputItem",
    "FunctionResponse",
    "HandoffMessage",
    "SessionItem",
    "TextEditResponse",
    "ToolCallNotification",
    "ToolResultNotification",
    "UserInput",
]
