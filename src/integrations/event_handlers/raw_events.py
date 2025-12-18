"""
Raw response event handlers for token-level streaming.

Handles events from the OpenAI API's raw response stream:
- Text deltas (response.output_text.delta)
- Function call argument streaming
- Reasoning deltas
- Content part lifecycle
- Refusal streaming
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

from core.constants import (
    MSG_TYPE_ASSISTANT_DELTA,
    MSG_TYPE_CONTENT_PART_ADDED,
    MSG_TYPE_FUNCTION_ARGUMENTS_DELTA,
    MSG_TYPE_FUNCTION_ARGUMENTS_DONE,
    MSG_TYPE_FUNCTION_DETECTED,
    MSG_TYPE_FUNCTION_EXECUTING,
    MSG_TYPE_REASONING_DELTA,
    MSG_TYPE_REASONING_SUMMARY_DELTA,
    MSG_TYPE_REFUSAL_DELTA,
    RAW_RESPONSE_EVENT,
)
from models.event_models import (
    AssistantMessage,
    ContentPartMessage,
    FunctionArgumentsDeltaMessage,
    FunctionArgumentsDoneMessage,
    ReasoningDeltaMessage,
    ReasoningSummaryDeltaMessage,
    RefusalDeltaMessage,
    ToolCallNotification,
)
from models.sdk_models import StreamEvent
from utils.json_utils import json_compact as _json_builder
from utils.logger import logger

from .base import CallTracker

# -----------------------------------------------------------------------------
# Delta Event Handlers
# -----------------------------------------------------------------------------


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
        tool_call_id=call_id,
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
        tool_call_id=call_id,
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


# -----------------------------------------------------------------------------
# Output Item Handlers
# -----------------------------------------------------------------------------


def handle_output_item_added(data: Any, tracker: CallTracker) -> str | None:
    """Handle output_item.added events with early function detection.

    Fires when the model starts generating a function call, before arguments
    are complete. This enables UI to show "calling function..." immediately.
    """
    output_item = getattr(data, "item", None)
    if output_item and getattr(output_item, "type", None) == "function_call":
        tool_name = getattr(output_item, "name", "unknown")
        call_id = getattr(output_item, "call_id", "") or getattr(output_item, "id", "")

        tracker.add_call(call_id, tool_name)

        tool_msg = ToolCallNotification(
            type=MSG_TYPE_FUNCTION_DETECTED,
            tool_name=tool_name,
            tool_arguments="{}",  # Empty - args will stream via delta events
            tool_call_id=call_id if call_id else None,
        )
        logger.info(f"Early function detected: {tool_name} (call_id: {call_id or 'none'})")
        return cast(str, _json_builder(tool_msg.model_dump(exclude_none=True)))
    return None


def handle_output_item_done(data: Any) -> str | None:
    """Handle output_item.done events - safety net for complete function args.

    Fires when function call arguments are fully received. Acts as safety net
    in case streaming deltas were missed.
    """
    output_item = getattr(data, "item", None)
    if output_item and getattr(output_item, "type", None) == "function_call":
        tool_name = getattr(output_item, "name", "unknown")
        call_id = getattr(output_item, "call_id", "") or getattr(output_item, "id", "")
        arguments = getattr(output_item, "arguments", "{}")

        tool_msg = ToolCallNotification(
            type=MSG_TYPE_FUNCTION_EXECUTING,
            tool_name=tool_name,
            tool_arguments=arguments,
            tool_call_id=call_id if call_id else None,
        )
        logger.info(f"Function args complete (safety net): {tool_name} (call_id: {call_id or 'none'})")
        return cast(str, _json_builder(tool_msg.model_dump(exclude_none=True)))
    return None


# -----------------------------------------------------------------------------
# Registry and Configuration
# -----------------------------------------------------------------------------

# Handler registry mapping event types to handler functions
RAW_EVENT_TYPE_HANDLERS: dict[str, Callable[[Any], str | None]] = {
    # Text and content events
    "response.output_text.delta": handle_text_delta_event,
    "response.content_part.added": handle_content_part_added_event,
    "response.content_part.done": handle_content_part_done_event,
    # Function call events
    "response.function_call_arguments.delta": handle_function_arguments_delta_event,
    "response.function_call_arguments.done": handle_function_arguments_done_event,
    # Reasoning events
    "response.reasoning.text.delta": handle_reasoning_text_delta_event,
    "response.reasoning_summary.text.delta": handle_reasoning_summary_delta_event,
    # Refusal events
    "response.refusal.delta": handle_refusal_delta_event,
}

# Event logging throttle - log every Nth occurrence to reduce noise
_event_counts: dict[str, int] = {}
_LOG_EVERY_N_EVENTS = 100

# High-frequency events that should be throttled (one per token)
THROTTLED_EVENTS = frozenset(
    {
        "response.output_text.delta",  # Token-by-token text streaming (very noisy)
    }
)

# Lifecycle events to ignore (no useful data, just noise)
IGNORED_EVENTS = frozenset(
    {
        "response.created",  # Response object created - no actionable data
        "response.in_progress",  # Response generating - redundant with assistant_start
        "response.completed",  # Response finished - usage data redundant with SDK tracking
    }
)


# -----------------------------------------------------------------------------
# Main Raw Event Handler
# -----------------------------------------------------------------------------


def create_raw_response_handler(tracker: CallTracker) -> Callable[[StreamEvent], str | None]:
    """Create a raw response event handler with tracker closure.

    Returns a handler function that processes raw LLM response events using
    the strategy pattern with handler registry for clean extensibility.
    """

    def handle_raw_response_event(event: StreamEvent) -> str | None:
        """Handle raw LLM response events with preserved granularity."""
        try:
            # Guard clauses for invalid events
            if getattr(event, "type", None) != RAW_RESPONSE_EVENT or not (data := getattr(event, "data", None)):
                return None

            event_type = getattr(data, "type", None)
            if not event_type:
                logger.warning("Event missing type attribute", extra={"event": event})
                return None

            result: str | None = None

            # Handle output item events (need tracker)
            if event_type == "response.output_item.added":
                result = handle_output_item_added(data, tracker)
            elif event_type == "response.output_item.done":
                result = handle_output_item_done(data)
            else:
                # Dispatch to stateless handlers
                handler = RAW_EVENT_TYPE_HANDLERS.get(event_type)
                if handler:
                    result = handler(data)
                    if result:
                        # Selective throttling: only throttle high-frequency events
                        if event_type in THROTTLED_EVENTS:
                            _event_counts[event_type] = _event_counts.get(event_type, 0) + 1
                            if _event_counts[event_type] % _LOG_EVERY_N_EVENTS == 0:
                                logger.info(f"Handled {_event_counts[event_type]} {event_type} events")
                        else:
                            # Log all non-throttled events immediately (rare, important)
                            logger.info(f"Handled event: {event_type}")
                elif event_type not in IGNORED_EVENTS:
                    # Log unknown event types (important for debugging)
                    logger.info(f"Unknown event type: {event_type}")
                    if delta := getattr(data, "delta", None):
                        logger.debug(f"Unknown event type with delta: {event_type}")
                        result = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=delta).to_json()

            return result

        except Exception as e:
            logger.error(f"Error handling raw response event: {e}", exc_info=True)
            return None

    return handle_raw_response_event
