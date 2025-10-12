"""
Session management models for Chat Juicer.
Provides Pydantic models for session metadata and commands with runtime validation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, field_validator

# Protocol for Layer 2 persistence (full history storage)


class FullHistoryProtocol(Protocol):
    """Protocol for full history storage implementations (Layer 2 persistence).

    Layer 2 stores complete user-visible conversation history that is never
    trimmed or summarized, separate from the token-optimized LLM context.
    """

    def save_message(self, session_id: str, message: dict[str, Any]) -> bool:
        """Save a message to full history storage.

        Args:
            session_id: Session identifier
            message: Message dict with 'role' and 'content' keys

        Returns:
            True if saved successfully, False otherwise
        """
        ...

    def get_messages(self, session_id: str, limit: int | None = None, offset: int = 0) -> list[dict[str, Any]]:
        """Retrieve messages from full history storage.

        Args:
            session_id: Session identifier
            limit: Maximum number of messages to return (None for all)
            offset: Number of messages to skip (for pagination)

        Returns:
            List of message dicts
        """
        ...

    def clear_session(self, session_id: str) -> bool:
        """Clear all messages for a session.

        Args:
            session_id: Session identifier

        Returns:
            True if cleared successfully, False otherwise
        """
        ...


class SessionMetadata(BaseModel):
    """Pydantic model for session metadata with runtime validation."""

    session_id: str = Field(..., min_length=1, description="Unique session identifier")
    title: str = Field(default="New Conversation", min_length=1, max_length=200)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    last_used: str = Field(default_factory=lambda: datetime.now().isoformat())
    message_count: int = Field(default=0, ge=0, description="Non-negative message count")
    accumulated_tool_tokens: int = Field(default=0, ge=0, description="Accumulated tool tokens for this session")

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id starts with 'chat_' prefix."""
        if not v.startswith("chat_"):
            raise ValueError("session_id must start with 'chat_'")
        return v

    @field_validator("created_at", "last_used")
    @classmethod
    def validate_iso_timestamp(cls, v: str) -> str:
        """Validate ISO format timestamps."""
        try:
            datetime.fromisoformat(v)
        except ValueError as e:
            raise ValueError(f"Must be valid ISO format timestamp: {e}") from e
        return v

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        json_str: str = self.model_dump_json(exclude_none=True, indent=indent)
        return json_str

    model_config = {"frozen": False}  # Allow updates via SessionManager  # Allow updates via SessionManager


# Session Command Models


class CreateSessionCommand(BaseModel):
    """Command to create a new session."""

    command: Literal["new"] = "new"
    title: str | None = Field(default=None, max_length=200)

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class SwitchSessionCommand(BaseModel):
    """Command to switch to a different session."""

    command: Literal["switch"] = "switch"
    session_id: str = Field(..., min_length=1)

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id format."""
        if not v.startswith("chat_"):
            raise ValueError("session_id must start with 'chat_'")
        return v

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class DeleteSessionCommand(BaseModel):
    """Command to delete a session."""

    command: Literal["delete"] = "delete"
    session_id: str = Field(..., min_length=1)

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id format."""
        if not v.startswith("chat_"):
            raise ValueError("session_id must start with 'chat_'")
        return v

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class ListSessionsCommand(BaseModel):
    """Command to list all sessions."""

    command: Literal["list"] = "list"

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class SummarizeSessionCommand(BaseModel):
    """Command to manually trigger session summarization."""

    command: Literal["summarize"] = "summarize"

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


# Union type for all session commands
SessionCommand = (
    CreateSessionCommand | SwitchSessionCommand | DeleteSessionCommand | ListSessionsCommand | SummarizeSessionCommand
)


def parse_session_command(data: dict[str, Any]) -> SessionCommand:
    """Parse and validate session command from raw data.

    Args:
        data: Raw command data from IPC

    Returns:
        Validated session command model

    Raises:
        ValueError: If command data is invalid
    """
    command_type = data.get("command")

    if command_type == "new":
        return CreateSessionCommand.model_validate(data)
    elif command_type == "switch":
        return SwitchSessionCommand.model_validate(data)
    elif command_type == "delete":
        return DeleteSessionCommand.model_validate(data)
    elif command_type == "list":
        return ListSessionsCommand.model_validate(data)
    elif command_type == "summarize":
        return SummarizeSessionCommand.model_validate(data)
    else:
        raise ValueError(f"Unknown command type: {command_type}")


# Message Content Models for MessageNormalizer


class TextContent(BaseModel):
    """Text content item from Agent/Runner."""

    type: Literal["text"]
    text: str


class ImageContent(BaseModel):
    """Image content item from Agent/Runner."""

    type: Literal["image_url"]
    image_url: dict[str, str]


class AudioContent(BaseModel):
    """Audio content item from Agent/Runner."""

    type: Literal["audio", "input_audio"]
    audio: dict[str, Any] | None = None
    input_audio: dict[str, Any] | None = None


class RefusalContent(BaseModel):
    """Refusal content item from Agent/Runner."""

    type: Literal["refusal"]
    refusal: str


class FileContent(BaseModel):
    """File content item from Agent/Runner."""

    type: Literal["file"]
    file: dict[str, Any]


class OutputTextContent(BaseModel):
    """Output text content (non-standard type from Agent/Runner)."""

    type: Literal["output_text"]
    text: str | None = None
    output: str | None = None


# Union type for all content types
ContentItem = (
    TextContent | ImageContent | AudioContent | RefusalContent | FileContent | OutputTextContent | dict[str, Any]
)


__all__ = [
    "AudioContent",
    "ContentItem",
    "CreateSessionCommand",
    "DeleteSessionCommand",
    "FileContent",
    "FullHistoryProtocol",
    "ImageContent",
    "ListSessionsCommand",
    "OutputTextContent",
    "RefusalContent",
    "SessionCommand",
    "SessionMetadata",
    "SummarizeSessionCommand",
    "SwitchSessionCommand",
    "TextContent",
    "parse_session_command",
]
