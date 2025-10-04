"""
Event handler utilities for Chat Juicer Agent/Runner streaming.
Handles all streaming event types from OpenAI Agent/Runner pattern.
"""

from __future__ import annotations

import json

from collections import deque
from dataclasses import dataclass, field
from functools import partial
from typing import Callable, cast

from core.constants import (
    AGENT_UPDATED_STREAM_EVENT,
    HANDOFF_CALL_ITEM,
    HANDOFF_OUTPUT_ITEM,
    MESSAGE_OUTPUT_ITEM,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
)
from models.event_models import (
    AgentUpdateMessage,
    AssistantMessage,
    HandoffMessage,
    ToolCallNotification,
    ToolResultNotification,
)
from models.sdk_models import (
    AgentUpdatedStreamEvent,
    ContentLike,
    EventHandler,
    RawHandoffLike,
    RawMessageLike,
    RawToolCallLike,
    RunItem,
    RunItemStreamEvent,
    StreamingEvent,
)

# Pre-create partial JSON builders for common patterns
_json_builder = partial(json.dumps, separators=(",", ":"))  # Compact JSON


@dataclass
class CallTracker:
    """Tracks tool call IDs for matching outputs with their calls."""

    active_calls: deque[dict[str, str]] = field(default_factory=deque)

    def add_call(self, call_id: str, tool_name: str) -> None:
        """Add a new tool call to track."""
        if call_id:
            self.active_calls.append({"call_id": call_id, "tool_name": tool_name})

    def pop_call(self) -> dict[str, str] | None:
        """Get and remove the oldest tracked call."""
        return self.active_calls.popleft() if self.active_calls else None


def handle_message_output(item: RunItem) -> str | None:
    """Handle message output items (assistant responses)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type="assistant_delta", content=text)
                return msg.to_json()  # type: ignore[no-any-return]
    return None


def handle_tool_call(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call items (function invocations) with validation."""
    tool_name = "unknown"
    call_id = ""
    arguments = "{}"

    if hasattr(item, "raw_item"):
        raw = item.raw_item

        if isinstance(raw, RawToolCallLike):
            tool_name = raw.name
            arguments = raw.arguments
            call_id = raw.call_id or (raw.id or "")
        else:
            # Extract tool details
            tool_name = getattr(raw, "name", "unknown")
            arguments = getattr(raw, "arguments", "{}")

            # Get call_id with fallback to id
            call_id = getattr(raw, "call_id", getattr(raw, "id", ""))

        # Track active calls for matching with outputs
        tracker.add_call(call_id, tool_name)

    # Use Pydantic model for validation
    tool_msg = ToolCallNotification(
        type="function_detected",  # Keep existing type for backward compatibility
        name=tool_name,
        arguments=arguments,
        call_id=call_id if call_id else None,
    )
    return _json_builder(tool_msg.model_dump(exclude_none=True))


def handle_reasoning(item: RunItem) -> str | None:
    """Handle reasoning items (Sequential Thinking output)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type="assistant_delta", content=f"[Thinking] {text}")
                return msg.to_json()  # type: ignore[no-any-return]
    return None


def handle_tool_output(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call output items (function results) with validation."""
    call_id = ""
    success = True
    tool_name = "unknown"

    # Match output with a call_id from tracker
    call_info = tracker.pop_call()
    if call_info:
        call_id = call_info["call_id"]
        tool_name = call_info.get("tool_name", "unknown")

    # Get output
    if hasattr(item, "output"):
        output = item.output
        # Convert to string for consistent handling
        output_str = _json_builder(output) if isinstance(output, dict) else str(output)
    else:
        output_str = ""

    # Check for errors
    if hasattr(item, "raw_item") and isinstance(item.raw_item, dict) and item.raw_item.get("error"):
        success = False
        output_str = str(item.raw_item["error"])

    # Use Pydantic model for validation
    result_msg = ToolResultNotification(
        type="function_completed",  # Keep existing type for backward compatibility
        name=tool_name,
        result=output_str,
        call_id=call_id if call_id else None,
        success=success,
    )
    return _json_builder(result_msg.model_dump(exclude_none=True))


def handle_handoff_call(item: RunItem) -> str | None:
    """Handle handoff call items (multi-agent requests)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = raw.target or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    msg = HandoffMessage(type="handoff_started", target_agent=target_agent)
    return msg.to_json()  # type: ignore[no-any-return]


def handle_handoff_output(item: RunItem) -> str | None:
    """Handle handoff output items (multi-agent results)"""
    source_agent = "unknown"

    if hasattr(item, "raw_item"):
        raw = item.raw_item
        source_agent = raw.source or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "source", "unknown")

    # Get output
    output = getattr(item, "output", "")
    output_str = str(output) if output else ""

    msg = HandoffMessage(type="handoff_completed", source_agent=source_agent, result=output_str)
    return msg.to_json()  # type: ignore[no-any-return]


def build_event_handlers(tracker: CallTracker) -> dict[str, EventHandler]:
    """Create a registry of event handlers keyed by event type.

    Uses closures to capture `tracker` while conforming to EventHandler.
    """

    def handle_run_item_event(event: StreamingEvent) -> str | None:
        # Guard by event type, then cast for attribute access
        if getattr(event, "type", None) != RUN_ITEM_STREAM_EVENT:
            return None
        rie = cast(RunItemStreamEvent, event)
        item: RunItem = rie.item

        item_handlers: dict[str, Callable[[], str | None]] = {
            MESSAGE_OUTPUT_ITEM: lambda: handle_message_output(item),
            TOOL_CALL_ITEM: lambda: handle_tool_call(item, tracker),
            REASONING_ITEM: lambda: handle_reasoning(item),
            TOOL_CALL_OUTPUT_ITEM: lambda: handle_tool_output(item, tracker),
            HANDOFF_CALL_ITEM: lambda: handle_handoff_call(item),
            HANDOFF_OUTPUT_ITEM: lambda: handle_handoff_output(item),
        }

        ih = item_handlers.get(item.type)
        return ih() if ih else None

    def handle_agent_updated_event(event: StreamingEvent) -> str | None:
        if getattr(event, "type", None) != AGENT_UPDATED_STREAM_EVENT:
            return None
        aue = cast(AgentUpdatedStreamEvent, event)
        msg = AgentUpdateMessage(type="agent_updated", name=aue.new_agent.name)
        return msg.to_json()  # type: ignore[no-any-return]

    return {
        RUN_ITEM_STREAM_EVENT: handle_run_item_event,
        AGENT_UPDATED_STREAM_EVENT: handle_agent_updated_event,
    }
