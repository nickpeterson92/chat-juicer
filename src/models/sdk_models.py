"""
Type definitions for SDK events and streaming items.

Provides runtime-checkable Protocols for better type safety
when handling Agent/Runner SDK events.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol, runtime_checkable

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
    new_agent: Any  # Agent from external SDK (opaque object)


# ============================================================================
# Run Item Protocols (Handle dynamic SDK objects)
# ============================================================================


@runtime_checkable
class RunItem(Protocol):
    """Protocol for all run items from SDK."""

    type: str
    raw_item: object | None
    output: object | None


# Narrow protocols for common raw item shapes used at runtime
@runtime_checkable
class ContentLike(Protocol):
    """Protocol for content items that expose optional text."""

    text: str | None


@runtime_checkable
class RawMessageLike(Protocol):
    """Protocol for raw message objects with content list."""

    content: list[ContentLike] | None


@runtime_checkable
class RawToolCallLike(Protocol):
    """Protocol for raw tool call details used by handlers."""

    name: str
    arguments: str
    call_id: str | None
    id: str | None


@runtime_checkable
class RawHandoffLike(Protocol):
    """Protocol for raw handoff objects (multi-agent)."""

    target: str | None
    source: str | None
    arguments: str | None


# ============================================================================
# Type Aliases for Common Patterns
# ============================================================================


# Protocol for any streaming event (structural typing)
@runtime_checkable
class StreamingEvent(Protocol):
    """Protocol for any streaming event from SDK."""

    type: str


# Type for event handlers (callables handling streaming events)
@runtime_checkable
class EventHandler(Protocol):
    """Protocol for functions that handle a streaming event.

    Handlers receive a `StreamingEvent` and return an optional string
    (e.g., an IPC message) or `None` when no output is produced.
    """

    def __call__(self, event: StreamingEvent) -> str | None:  # pragma: no cover - structural typing only
        ...


# Export all types
__all__ = [
    "AgentUpdatedStreamEvent",
    "ContentLike",
    "EventHandler",
    "RawHandoffLike",
    "RawMessageLike",
    "RawToolCallLike",
    "RunItem",
    "RunItemStreamEvent",
    "StreamingEvent",
]
