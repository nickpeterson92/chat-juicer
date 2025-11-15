"""
Event handler utilities for Chat Juicer Agent/Runner streaming.
Handles all streaming event types from OpenAI Agent/Runner pattern.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol, cast

from core.constants import (
    AGENT_UPDATED_STREAM_EVENT,
    HANDOFF_CALL_ITEM,
    HANDOFF_OUTPUT_ITEM,
    MSG_TYPE_AGENT_UPDATED,
    MSG_TYPE_ASSISTANT_DELTA,
    MSG_TYPE_CONTENT_PART_ADDED,
    MSG_TYPE_FUNCTION_ARGUMENTS_DELTA,
    MSG_TYPE_FUNCTION_ARGUMENTS_DONE,
    MSG_TYPE_FUNCTION_COMPLETED,
    MSG_TYPE_FUNCTION_DETECTED,
    MSG_TYPE_HANDOFF_COMPLETED,
    MSG_TYPE_HANDOFF_STARTED,
    MSG_TYPE_REASONING_DELTA,
    MSG_TYPE_REASONING_SUMMARY_DELTA,
    MSG_TYPE_REFUSAL_DELTA,
    RAW_RESPONSE_EVENT,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
)
from models.event_models import (
    AgentUpdateMessage,
    AssistantMessage,
    ContentPartMessage,
    FunctionArgumentsDeltaMessage,
    FunctionArgumentsDoneMessage,
    HandoffMessage,
    ReasoningDeltaMessage,
    ReasoningSummaryDeltaMessage,
    RefusalDeltaMessage,
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
    StreamEvent,
)
from utils.json_utils import json_compact as _json_builder
from utils.logger import logger


# Protocol for type safety
class ResponseEventData(Protocol):
    """Protocol for SDK event data with common attributes."""

    type: str
    delta: str | None


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
                msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=text)
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
        type=MSG_TYPE_FUNCTION_DETECTED,
        name=tool_name,
        arguments=arguments,
        call_id=call_id if call_id else None,
    )
    return cast(str, _json_builder(tool_msg.model_dump(exclude_none=True)))


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
                msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=f"[Thinking] {text}")
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
    else:
        logger.info("Tool output received but no tracked call_id in queue")

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
        name=tool_name,
        result=output_str,
        call_id=call_id if call_id else None,
        success=success,
    )

    logger.info(f"Function completed: {tool_name} (call_id: {call_id or 'none'}, success: {success})")
    return cast(str, _json_builder(result_msg.model_dump(exclude_none=True)))


def handle_handoff_call(item: RunItem) -> str | None:
    """Handle handoff call items (multi-agent requests)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = raw.target or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    msg = HandoffMessage(type=MSG_TYPE_HANDOFF_STARTED, target_agent=target_agent)
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

    msg = HandoffMessage(type=MSG_TYPE_HANDOFF_COMPLETED, source_agent=source_agent, result=output_str)
    return msg.to_json()  # type: ignore[no-any-return]


def handle_text_delta_event(data: Any) -> str | None:
    """Handle text content delta events."""
    delta = getattr(data, "delta", None)
    if not delta:
        return None

    msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=delta)
    return msg.to_json()  # type: ignore[no-any-return]


def handle_function_arguments_delta_event(data: Any) -> str | None:
    """Handle function call arguments streaming."""
    call_id = getattr(data, "call_id", None)
    delta = getattr(data, "delta", None)

    if not call_id or not delta:
        return None

    msg = FunctionArgumentsDeltaMessage(
        type=MSG_TYPE_FUNCTION_ARGUMENTS_DELTA,
        call_id=call_id,
        delta=delta,
        output_index=getattr(data, "output_index", None),
    )
    return msg.to_json()  # type: ignore[no-any-return]


def handle_function_arguments_done_event(data: Any) -> str | None:
    """Handle function call arguments completion."""
    call_id = getattr(data, "call_id", None)
    if not call_id:
        return None

    msg = FunctionArgumentsDoneMessage(
        type=MSG_TYPE_FUNCTION_ARGUMENTS_DONE,
        call_id=call_id,
        output_index=getattr(data, "output_index", None),
    )
    return msg.to_json()  # type: ignore[no-any-return]


def handle_reasoning_text_delta_event(data: Any) -> str | None:
    """Handle reasoning text streaming (backend only, no frontend display)."""
    delta = getattr(data, "delta", None)
    if not delta:
        return None

    msg = ReasoningDeltaMessage(
        type=MSG_TYPE_REASONING_DELTA,
        delta=delta,
        reasoning_index=getattr(data, "reasoning_index", None),
        output_index=getattr(data, "output_index", None),
    )
    return msg.to_json()  # type: ignore[no-any-return]


def handle_reasoning_summary_delta_event(data: Any) -> str | None:
    """Handle reasoning summary streaming (backend only)."""
    delta = getattr(data, "delta", None)
    if not delta:
        return None

    msg = ReasoningSummaryDeltaMessage(
        type=MSG_TYPE_REASONING_SUMMARY_DELTA,
        delta=delta,
        output_index=getattr(data, "output_index", None),
    )
    return msg.to_json()  # type: ignore[no-any-return]


def handle_refusal_delta_event(data: Any) -> str | None:
    """Handle model refusal streaming."""
    delta = getattr(data, "delta", None)
    if not delta:
        return None

    msg = RefusalDeltaMessage(
        type=MSG_TYPE_REFUSAL_DELTA,
        delta=delta,
        content_index=getattr(data, "content_index", None),
        output_index=getattr(data, "output_index", None),
    )
    return msg.to_json()  # type: ignore[no-any-return]


def handle_content_part_added_event(data: Any) -> str | None:
    """Handle new content part started."""
    content_index = getattr(data, "content_index", None)
    if content_index is None:
        return None

    msg = ContentPartMessage(
        type=MSG_TYPE_CONTENT_PART_ADDED,
        content_index=content_index,
        output_index=getattr(data, "output_index", 0),
        part_type=getattr(data, "part_type", "text"),
    )
    return msg.to_json()  # type: ignore[no-any-return]


def handle_content_part_done_event(data: Any) -> str | None:
    """Handle content part completion."""
    content_index = getattr(data, "content_index", None)
    if content_index is None:
        return None

    msg = ContentPartMessage(
        type="content_part_done",
        content_index=content_index,
        output_index=getattr(data, "output_index", 0),
        part_type=getattr(data, "part_type", "text"),
    )
    return msg.to_json()  # type: ignore[no-any-return]


# Handler registry mapping event types to handler functions
RAW_EVENT_TYPE_HANDLERS: dict[str, Callable[[Any], str | None]] = {
    "response.output_text.delta": handle_text_delta_event,  # SDK emits output_text, not text
    "response.function_call_arguments.delta": handle_function_arguments_delta_event,
    "response.function_call_arguments.done": handle_function_arguments_done_event,
    "response.reasoning.text.delta": handle_reasoning_text_delta_event,
    "response.reasoning_summary.text.delta": handle_reasoning_summary_delta_event,
    "response.refusal.delta": handle_refusal_delta_event,
    "response.content_part.added": handle_content_part_added_event,
    "response.content_part.done": handle_content_part_done_event,
}

# Event logging throttle - log every Nth occurrence to reduce noise
_event_counts: dict[str, int] = {}
_LOG_EVERY_N_EVENTS = 100  # Log handled events every 50 occurrences

# High-frequency events that should be throttled (one per token)
_THROTTLED_EVENTS = {
    "response.output_text.delta",  # Token-by-token text streaming (very noisy)
}

# All other events logged immediately (rare, important for debugging):
# - response.content_part.added/done (content boundaries)
# - response.refusal.delta (model refusals)
# - response.reasoning.text.delta (reasoning streaming)
# - response.reasoning_summary.text.delta (reasoning summaries)
# - response.function_call_arguments.delta/done (if SDK ever supports it)


def build_event_handlers(tracker: CallTracker) -> dict[str, EventHandler]:
    """Create a registry of event handlers keyed by event type.

    Uses closures to capture `tracker` while conforming to EventHandler.
    """

    def handle_raw_response_event(event: StreamEvent) -> str | None:
        """Handle raw LLM response events with preserved granularity.

        Uses strategy pattern with handler registry for clean extensibility.
        Each event type is dispatched to a specific handler function.
        """
        try:
            # Guard clauses for invalid events
            if getattr(event, "type", None) != RAW_RESPONSE_EVENT or not (data := getattr(event, "data", None)):
                return None

            event_type = getattr(data, "type", None)
            if not event_type:
                logger.warning("Event missing type attribute", extra={"event": event})
                return None

            # Look up and call the appropriate handler from registry
            handler = RAW_EVENT_TYPE_HANDLERS.get(event_type)
            if handler:
                result = handler(data)
                if result:
                    # Selective throttling: only throttle high-frequency events
                    if event_type in _THROTTLED_EVENTS:
                        _event_counts[event_type] = _event_counts.get(event_type, 0) + 1
                        if _event_counts[event_type] % _LOG_EVERY_N_EVENTS == 0:
                            logger.info(f"Handled {_event_counts[event_type]} {event_type} events")
                    else:
                        # Log all non-throttled events immediately (rare, important)
                        logger.info(f"Handled event: {event_type}")
                return result

            # Always log unknown event types (important for debugging)
            logger.info(f"Unknown event type: {event_type}")

            # Fallback: Unknown event types with delta become generic assistant_delta
            if delta := getattr(data, "delta", None):
                logger.debug(f"Unknown event type with delta: {event_type}")
                return AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=delta).to_json()  # type: ignore[no-any-return]

        except Exception as e:
            logger.error(f"Error handling raw response event: {e}", exc_info=True)

        return None  # Graceful degradation (single exit point)

    def handle_run_item_event(event: StreamEvent) -> str | None:
        # Guard by event type, then cast for attribute access
        if getattr(event, "type", None) != RUN_ITEM_STREAM_EVENT:
            return None
        rie = cast(RunItemStreamEvent, event)
        item: RunItem = rie.item

        item_handlers: dict[str, Callable[[], str | None]] = {
            # MESSAGE_OUTPUT_ITEM: lambda: handle_message_output(item),  # Disabled: use raw_response_event for token-by-token
            TOOL_CALL_ITEM: lambda: handle_tool_call(item, tracker),
            REASONING_ITEM: lambda: handle_reasoning(item),
            TOOL_CALL_OUTPUT_ITEM: lambda: handle_tool_output(item, tracker),
            HANDOFF_CALL_ITEM: lambda: handle_handoff_call(item),
            HANDOFF_OUTPUT_ITEM: lambda: handle_handoff_output(item),
        }

        ih = item_handlers.get(item.type)
        return ih() if ih else None

    def handle_agent_updated_event(event: StreamEvent) -> str | None:
        if getattr(event, "type", None) != AGENT_UPDATED_STREAM_EVENT:
            return None
        aue = cast(AgentUpdatedStreamEvent, event)
        msg = AgentUpdateMessage(type=MSG_TYPE_AGENT_UPDATED, name=aue.new_agent.name)
        return msg.to_json()  # type: ignore[no-any-return]

    return {
        RAW_RESPONSE_EVENT: handle_raw_response_event,
        RUN_ITEM_STREAM_EVENT: handle_run_item_event,
        AGENT_UPDATED_STREAM_EVENT: handle_agent_updated_event,
    }
