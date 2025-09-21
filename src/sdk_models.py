"""
Type definitions for SDK events and streaming items.

Provides TypedDict and type aliases for better type safety
when handling Agent/Runner SDK events.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol, TypedDict, runtime_checkable

# ============================================================================
# SDK Streaming Event Protocols (Better than TypedDict for SDK objects)
# ============================================================================


@runtime_checkable
class RunItemStreamEvent(Protocol):
    """Protocol for run item streaming events from SDK."""

    type: Literal["run_item_stream_event"]
    item: RunItem


@runtime_checkable
class AgentUpdatedStreamEvent(Protocol):
    """Protocol for agent update streaming events."""

    type: Literal["agent_updated_stream_event"]
    name: str
    new_agent: Any  # Agent instance


# ============================================================================
# Run Item Protocols (Handle dynamic SDK objects)
# ============================================================================


@runtime_checkable
class RunItem(Protocol):
    """Protocol for all run items from SDK."""

    type: str
    raw_item: Any | None
    output: Any | None


class MessageOutputItem(TypedDict):
    """Message output item with content."""

    type: Literal["message_output_item"]
    raw_item: RawMessageItem


class RawMessageItem(TypedDict):
    """Raw message item structure."""

    content: list[ContentItem] | None


class ContentItem(TypedDict):
    """Content item within a message."""

    type: str
    text: str | None


class ToolCallItem(TypedDict):
    """Tool call item structure."""

    type: Literal["tool_call_item"]
    raw_item: RawToolCallItem


class RawToolCallItem(TypedDict):
    """Raw tool call details."""

    name: str
    arguments: str
    call_id: str | None
    id: str | None


class ToolCallOutputItem(TypedDict):
    """Tool call output item structure."""

    type: Literal["tool_call_output_item"]
    output: Any
    raw_item: dict[str, Any] | None


class ReasoningItem(TypedDict):
    """Reasoning item for Sequential Thinking."""

    type: Literal["reasoning_item"]
    raw_item: RawMessageItem


class HandoffCallItem(TypedDict):
    """Multi-agent handoff call item."""

    type: Literal["handoff_call_item"]
    raw_item: RawHandoffItem


class HandoffOutputItem(TypedDict):
    """Multi-agent handoff output item."""

    type: Literal["handoff_output_item"]
    output: Any
    raw_item: RawHandoffItem | None


class RawHandoffItem(TypedDict, total=False):
    """Raw handoff item structure."""

    target_agent: str | None
    source_agent: str | None
    arguments: str | None


# ============================================================================
# Type Aliases for Common Patterns
# ============================================================================


# Protocol for any streaming event (structural typing)
@runtime_checkable
class StreamingEvent(Protocol):
    """Protocol for any streaming event from SDK."""

    type: str


# Union type for all possible run items
AnyRunItem = MessageOutputItem | ToolCallItem | ToolCallOutputItem | ReasoningItem | HandoffCallItem | HandoffOutputItem

# Type for event handlers
EventHandler = Any  # Will be replaced with proper Protocol in future


# ============================================================================
# Session Item Types (for TokenAwareSQLiteSession)
# ============================================================================


class SessionConversationItem(TypedDict, total=False):
    """Type for conversation items stored in session."""

    role: Literal["user", "assistant", "system", "tool", "unknown"]
    content: str | list[Any] | dict[str, Any] | None
    type: str | None
    name: str | None
    arguments: str | None
    output: Any


# Export all types
__all__ = [
    "AgentUpdatedStreamEvent",
    "AnyRunItem",
    "ContentItem",
    "EventHandler",
    "HandoffCallItem",
    "HandoffOutputItem",
    "MessageOutputItem",
    "RawHandoffItem",
    "RawMessageItem",
    "RawToolCallItem",
    "ReasoningItem",
    "RunItem",
    "RunItemStreamEvent",
    "SessionConversationItem",
    "StreamingEvent",
    "ToolCallItem",
    "ToolCallOutputItem",
]
