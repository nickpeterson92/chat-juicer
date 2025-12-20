"""
Event handler package for Chat Juicer Agent/Runner streaming.

This package provides modular event handlers organized by domain:
- base: Core types (CallTracker, protocols)
- raw_events: Token-level streaming handlers
- run_item_events: High-level SDK item handlers
- agent_events: Multi-agent transition handlers
- registry: Unified handler building

Usage:
    from integrations.event_handlers import CallTracker, build_event_handlers

    tracker = CallTracker()
    handlers = build_event_handlers(tracker)
"""

# Re-export individual handlers for testing and advanced usage
from .agent_events import handle_agent_updated
from .base import CallTracker, ResponseEventData
from .raw_events import (
    IGNORED_EVENTS,
    RAW_EVENT_TYPE_HANDLERS,
    THROTTLED_EVENTS,
    handle_content_part_added_event,
    handle_content_part_done_event,
    handle_function_arguments_delta_event,
    handle_function_arguments_done_event,
    handle_output_item_added,
    handle_output_item_done,
    handle_reasoning_summary_delta_event,
    handle_reasoning_text_delta_event,
    handle_refusal_delta_event,
    handle_text_delta_event,
)
from .registry import build_event_handlers
from .run_item_events import (
    handle_handoff_call,
    handle_handoff_output,
    handle_message_output,
    handle_reasoning,
    handle_tool_call,
    handle_tool_output,
)

__all__ = [
    "IGNORED_EVENTS",
    "RAW_EVENT_TYPE_HANDLERS",
    "THROTTLED_EVENTS",
    "CallTracker",
    "ResponseEventData",
    "build_event_handlers",
    "handle_agent_updated",
    "handle_content_part_added_event",
    "handle_content_part_done_event",
    "handle_function_arguments_delta_event",
    "handle_function_arguments_done_event",
    "handle_handoff_call",
    "handle_handoff_output",
    "handle_message_output",
    "handle_output_item_added",
    "handle_output_item_done",
    "handle_reasoning",
    "handle_reasoning_summary_delta_event",
    "handle_reasoning_text_delta_event",
    "handle_refusal_delta_event",
    "handle_text_delta_event",
    "handle_tool_call",
    "handle_tool_output",
]
