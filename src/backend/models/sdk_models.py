"""
Type definitions for SDK events and streaming items.

Provides runtime-checkable Protocols for better type safety
when handling Agent/Runner SDK events.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from agents import (
    AgentUpdatedStreamEvent,
    RunItem,
    RunItemStreamEvent,
    StreamEvent,
)

# ============================================================================
# SDK Types - Imported Directly from agents SDK
# ============================================================================
# RunItemStreamEvent, AgentUpdatedStreamEvent, RunItem, StreamEvent
# are now imported from the SDK instead of defined as custom Protocols.
# This provides exact type compatibility and eliminates maintenance overhead.


# ============================================================================
# Custom Structural Protocols for SDK Internal Objects
# ============================================================================
# The following Protocols provide duck typing for internal SDK object structures
# that are not exported by the SDK. These are necessary for safe attribute access
# on raw_item and content objects.
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
# Event Handler Protocol
# ============================================================================
@runtime_checkable
class EventHandler(Protocol):
    """Protocol for functions that handle a streaming event.

    Handlers receive a `StreamingEvent` and return an optional string
    (e.g., an IPC message) or `None` when no output is produced.
    """

    def __call__(self, event: StreamEvent) -> str | None:  # pragma: no cover - structural typing only
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
    "StreamEvent",
]
