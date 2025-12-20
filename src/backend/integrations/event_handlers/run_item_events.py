"""
Run item event handlers for high-level SDK abstractions.

Handles RUN_ITEM_STREAM_EVENT events from the Agent/Runner framework:
- Message output (assistant responses)
- Tool calls (function invocations)
- Tool outputs (function results)
- Reasoning items (Sequential Thinking)
- Handoff events (multi-agent)
"""

from __future__ import annotations

from collections.abc import Callable
from typing import cast

from core.constants import (
    HANDOFF_CALL_ITEM,
    HANDOFF_OUTPUT_ITEM,
    MSG_TYPE_ASSISTANT_DELTA,
    MSG_TYPE_FUNCTION_COMPLETED,
    MSG_TYPE_FUNCTION_EXECUTING,
    MSG_TYPE_HANDOFF_COMPLETED,
    MSG_TYPE_HANDOFF_STARTED,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
)
from models.event_models import (
    AssistantMessage,
    HandoffMessage,
    ToolCallNotification,
    ToolResultNotification,
)
from models.sdk_models import (
    ContentLike,
    RawHandoffLike,
    RawMessageLike,
    RawToolCallLike,
    RunItem,
    RunItemStreamEvent,
    StreamEvent,
)
from utils.json_utils import json_compact as _json_builder
from utils.logger import logger

from .base import CallTracker

# -----------------------------------------------------------------------------
# Item Handlers
# All handlers have unified signature: (item, tracker) -> str | None
# Handlers that don't need tracker use _tracker to indicate unused.
# -----------------------------------------------------------------------------


def handle_message_output(item: RunItem, _tracker: CallTracker) -> str | None:
    """Handle message output items (assistant responses)."""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=text)
                return msg.to_json()  # type: ignore[no-any-return]
    return None


def handle_tool_call(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call items (function invocations) with validation.

    This fires when TOOL_CALL_ITEM event occurs - args are complete and tool
    is about to execute. We emit function_executing (not function_detected)
    because early detection via output_item.added already emitted function_detected.
    """
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

        # Track active calls for matching with outputs (no-op if already tracked via early detection)
        tracker.add_call(call_id, tool_name)

    # Emit function_executing - tool is about to run
    # (function_detected was already emitted via output_item.added early detection)
    tool_msg = ToolCallNotification(
        type=MSG_TYPE_FUNCTION_EXECUTING,
        tool_name=tool_name,
        tool_arguments=arguments,
        tool_call_id=call_id if call_id else None,
    )
    logger.info(f"Function executing: {tool_name} (call_id: {call_id or 'none'})")
    return cast(str, _json_builder(tool_msg.model_dump(exclude_none=True)))


def handle_reasoning(item: RunItem, _tracker: CallTracker) -> str | None:
    """Handle reasoning items (Sequential Thinking output)."""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=f"[Thinking] {text}")
                return msg.to_json()  # type: ignore[no-any-return]
    return None


def handle_tool_output(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call output items (function results) with proper call_id matching.

    Extracts call_id from the output item itself for parallel-safe matching,
    rather than assuming FIFO order which breaks when tools complete out-of-order.
    """
    call_id = ""
    success = True
    tool_name = "unknown"

    # Extract call_id - check item directly first, then raw_item, with fallback to id
    # SDK ToolCallOutputItem should have call_id directly on the item
    call_id = getattr(item, "call_id", "") or ""

    # Fallback to raw_item if not found on item
    if not call_id and hasattr(item, "raw_item"):
        raw = item.raw_item
        if isinstance(raw, dict):
            call_id = raw.get("call_id", "") or raw.get("id", "") or ""
        else:
            call_id = getattr(raw, "call_id", "") or getattr(raw, "id", "") or ""

    # Match by call_id (works for both sequential and parallel tool execution)
    if call_id:
        call_info = tracker.pop_call_by_id(call_id)
        if call_info:
            tool_name = call_info["tool_name"]
        else:
            logger.warning(f"Tool output for untracked call_id: {call_id}")
    else:
        logger.warning("Tool output missing call_id - cannot match to tool call")

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
        type=MSG_TYPE_FUNCTION_COMPLETED,
        tool_name=tool_name,
        tool_result=output_str,
        tool_call_id=call_id if call_id else None,
        tool_success=success,
    )

    logger.info(f"Function completed: {tool_name} (call_id: {call_id or 'none'}, success: {success})")
    return cast(str, _json_builder(result_msg.model_dump(exclude_none=True)))


def handle_handoff_call(item: RunItem, _tracker: CallTracker) -> str | None:
    """Handle handoff call items (multi-agent requests)."""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = raw.target or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    msg = HandoffMessage(type=MSG_TYPE_HANDOFF_STARTED, target_agent=target_agent)
    return msg.to_json()  # type: ignore[no-any-return]


def handle_handoff_output(item: RunItem, _tracker: CallTracker) -> str | None:
    """Handle handoff output items (multi-agent results)."""
    source_agent = "unknown"

    if hasattr(item, "raw_item"):
        raw = item.raw_item
        source_agent = raw.source or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "source", "unknown")

    # Get output
    output = getattr(item, "output", "")
    output_str = str(output) if output else ""

    msg = HandoffMessage(type=MSG_TYPE_HANDOFF_COMPLETED, source_agent=source_agent, result=output_str)
    return msg.to_json()  # type: ignore[no-any-return]


# -----------------------------------------------------------------------------
# Static Dispatch Map
# Built once at module load, no per-event allocation.
# -----------------------------------------------------------------------------

# Type alias for handler signature
ItemHandler = Callable[[RunItem, CallTracker], str | None]

# Static dispatch map - looked up once per event, no dict rebuilding
ITEM_HANDLER_DISPATCH: dict[str, ItemHandler] = {
    # MESSAGE_OUTPUT_ITEM: handle_message_output,  # Disabled: use raw_response_event for token-by-token
    TOOL_CALL_ITEM: handle_tool_call,
    REASONING_ITEM: handle_reasoning,
    TOOL_CALL_OUTPUT_ITEM: handle_tool_output,
    HANDOFF_CALL_ITEM: handle_handoff_call,
    HANDOFF_OUTPUT_ITEM: handle_handoff_output,
}


# -----------------------------------------------------------------------------
# Main Run Item Handler
# -----------------------------------------------------------------------------


def create_run_item_handler(tracker: CallTracker) -> Callable[[StreamEvent], str | None]:
    """Create a run item event handler with tracker closure.

    Returns a handler function that processes high-level SDK run item events.
    Uses static dispatch map - no per-event dict allocation.
    """

    def handle_run_item_event(event: StreamEvent) -> str | None:
        """Handle run item stream events from Agent/Runner framework."""
        # Guard by event type, then cast for attribute access
        if getattr(event, "type", None) != RUN_ITEM_STREAM_EVENT:
            return None

        rie = cast(RunItemStreamEvent, event)
        item: RunItem = rie.item

        # Static lookup - O(1) dict access, no allocation
        handler = ITEM_HANDLER_DISPATCH.get(item.type)
        return handler(item, tracker) if handler else None

    return handle_run_item_event
