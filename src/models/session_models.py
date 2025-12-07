"""
Session management models for Chat Juicer.
Provides Pydantic models for session metadata and commands with runtime validation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal, Protocol, TypedDict

from pydantic import BaseModel, Field, field_validator

if TYPE_CHECKING:
    from agents import Agent

    from core.full_history import FullHistoryStore
    from core.session import TokenAwareSQLiteSession
    from core.session_manager import SessionManager

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


class AppStateProtocol(Protocol):
    """Protocol defining required AppState interface for session commands.

    Used for structural typing - any class with these attributes satisfies this protocol.
    """

    session_manager: SessionManager | None
    current_session: TokenAwareSQLiteSession | None
    agent: Agent | None
    deployment: str
    full_history_store: FullHistoryStore | None


class SessionMetadataParams(TypedDict, total=False):
    """Parameters for creating SessionMetadata instances.

    Used when dynamically building kwargs for SessionMetadata(**kwargs).
    All fields optional except session_id and title (which have required values).

    Note: Links to SessionMetadata Pydantic model - keep in sync when fields change.
    """

    session_id: str  # Required - always provided
    title: str  # Required - always provided (or has default)
    mcp_config: list[str]  # Optional - has default_factory
    model: str  # Optional - has default_factory
    reasoning_effort: str  # Optional - has default_factory


class SessionMetadata(BaseModel):
    """Pydantic model for session metadata with runtime validation."""

    session_id: str = Field(..., min_length=1, description="Unique session identifier")
    title: str = Field(default="New Conversation", min_length=1, max_length=200)
    is_named: bool = Field(default=False, description="Whether session has been auto-named")
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    last_used: str = Field(default_factory=lambda: datetime.now().isoformat())
    message_count: int = Field(default=0, ge=0, description="Non-negative message count")
    accumulated_tool_tokens: int = Field(default=0, ge=0, description="Accumulated tool tokens for this session")
    mcp_config: list[str] = Field(
        default_factory=lambda: ["sequential", "fetch", "tavily"],
        description="List of enabled MCP server names (sequential, fetch, tavily)",
    )
    model: str = Field(
        default="gpt-5",
        description="Model deployment name for this session",
    )
    reasoning_effort: str = Field(
        default="medium",
        description="Reasoning effort level: minimal | low | medium | high",
    )

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

    @field_validator("reasoning_effort")
    @classmethod
    def validate_reasoning_effort(cls, v: str) -> str:
        """Validate reasoning_effort parameter."""
        valid_values = ["minimal", "low", "medium", "high"]
        if v not in valid_values:
            raise ValueError(f"reasoning_effort must be one of {valid_values}")
        return v

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        json_str: str = self.model_dump_json(exclude_none=True, indent=indent)
        return json_str

    model_config = {"frozen": False}  # Allow updates via SessionManager


@dataclass
class SessionUpdate:
    """Data structure for session metadata updates.

    Consolidates optional update parameters into a single cohesive structure
    for cleaner method signatures and easier testing.

    Example:
        update = SessionUpdate(title="New Title", message_count=42)
        session_manager.update_session("chat_123", update)
    """

    title: str | None = None
    last_used: str | None = None
    message_count: int | None = None
    accumulated_tool_tokens: int | None = None
    model: str | None = None
    mcp_config: list[str] | None = None
    reasoning_effort: str | None = None

    def has_updates(self) -> bool:
        """Check if any fields are set for update.

        Returns:
            True if at least one field is non-None
        """
        return any(
            [
                self.title is not None,
                self.last_used is not None,
                self.message_count is not None,
                self.accumulated_tool_tokens is not None,
                self.model is not None,
                self.mcp_config is not None,
                self.reasoning_effort is not None,
            ]
        )


# Session Command Models


class CreateSessionCommand(BaseModel):
    """Command to create a new session."""

    command: Literal["new"] = "new"
    title: str | None = Field(default=None, max_length=200)
    mcp_config: list[str] | None = Field(default=None, description="List of enabled MCP servers (None = use defaults)")
    model: str | None = Field(default=None, description="Model deployment name (None = use default)")
    reasoning_effort: str | None = Field(default=None, description="Reasoning effort level (None = use default)")

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
    """Command to list all sessions with optional pagination."""

    command: Literal["list"] = "list"
    offset: int = 0  # Start index for pagination
    limit: int | None = None  # Max sessions to return (None = all)

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


class ClearSessionCommand(BaseModel):
    """Command to clear current session (lazy initialization pattern).

    Clears the current session without creating a new one immediately.
    Next user message will trigger fresh session creation via lazy initialization.
    """

    command: Literal["clear"] = "clear"

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


# Union type for all session commands


class LoadMoreMessagesCommand(BaseModel):
    """Command to load additional messages for pagination.

    Used for progressive loading of large sessions to avoid IPC buffer overflow
    and timeout issues. Initial session load returns first chunk, then this command
    loads remaining messages in batches.
    """

    command: Literal["load_more"] = "load_more"
    session_id: str = Field(..., min_length=1, description="Session to load messages from")
    offset: int = Field(ge=0, description="Starting position (0-based index)")
    limit: int = Field(default=50, ge=1, le=100, description="Number of messages to load (max 100)")

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


class RenameSessionCommand(BaseModel):
    """Command to rename a session."""

    command: Literal["rename"] = "rename"
    session_id: str = Field(..., min_length=1, description="Session to rename")
    title: str = Field(..., min_length=1, max_length=200, description="New session title")

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


class ConfigMetadataCommand(BaseModel):
    """Command to request available configuration options."""

    command: Literal["config_metadata"] = "config_metadata"

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class UpdateSessionConfigCommand(BaseModel):
    """Command to update session configuration (model, MCP, reasoning effort).

    Updates the session metadata and recreates the agent with new settings.
    Session ID and files remain unchanged.
    """

    command: Literal["update_config"] = "update_config"
    session_id: str = Field(..., min_length=1, description="Session to update")
    model: str | None = Field(default=None, description="New model deployment name")
    mcp_config: list[str] | None = Field(default=None, description="New MCP server configuration")
    reasoning_effort: str | None = Field(default=None, description="New reasoning effort level")

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


SessionCommand = (
    CreateSessionCommand
    | SwitchSessionCommand
    | DeleteSessionCommand
    | ListSessionsCommand
    | SummarizeSessionCommand
    | ClearSessionCommand
    | LoadMoreMessagesCommand
    | RenameSessionCommand
    | ConfigMetadataCommand
    | UpdateSessionConfigCommand
)


def parse_session_command(data: dict[str, Any]) -> SessionCommand:  # noqa: PLR0911
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
    elif command_type == "clear":
        return ClearSessionCommand.model_validate(data)
    elif command_type == "load_more":
        return LoadMoreMessagesCommand.model_validate(data)
    elif command_type == "rename":
        return RenameSessionCommand.model_validate(data)
    elif command_type == "config_metadata":
        return ConfigMetadataCommand.model_validate(data)
    elif command_type == "update_config":
        return UpdateSessionConfigCommand.model_validate(data)
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
    "AppStateProtocol",
    "AudioContent",
    "ClearSessionCommand",
    "ConfigMetadataCommand",
    "ContentItem",
    "CreateSessionCommand",
    "DeleteSessionCommand",
    "FileContent",
    "FullHistoryProtocol",
    "ImageContent",
    "ListSessionsCommand",
    "LoadMoreMessagesCommand",
    "OutputTextContent",
    "RefusalContent",
    "RenameSessionCommand",
    "SessionCommand",
    "SessionMetadata",
    "SessionMetadataParams",
    "SessionUpdate",
    "SummarizeSessionCommand",
    "SwitchSessionCommand",
    "TextContent",
    "parse_session_command",
]
