"""
Unified event handler registry for Agent/Runner streaming.

This module provides the main entry point for building event handlers,
coordinating all handler types (raw events, run items, agent events)
into a single registry for the streaming event processor.
"""

from __future__ import annotations

from core.constants import (
    AGENT_UPDATED_STREAM_EVENT,
    RAW_RESPONSE_EVENT,
    RUN_ITEM_STREAM_EVENT,
)
from models.sdk_models import EventHandler

from .agent_events import create_agent_updated_handler
from .base import CallTracker
from .raw_events import create_raw_response_handler
from .run_item_events import create_run_item_handler


def build_event_handlers(tracker: CallTracker) -> dict[str, EventHandler]:
    """Build a complete registry of event handlers keyed by event type.

    Creates handlers for all streaming event categories:
    - RAW_RESPONSE_EVENT: Token-level streaming (text deltas, function args)
    - RUN_ITEM_STREAM_EVENT: High-level SDK items (tool calls, outputs)
    - AGENT_UPDATED_STREAM_EVENT: Agent transitions (multi-agent)

    Args:
        tracker: CallTracker instance for matching tool calls with outputs

    Returns:
        Dictionary mapping event type strings to handler functions
    """
    return {
        RAW_RESPONSE_EVENT: create_raw_response_handler(tracker),
        RUN_ITEM_STREAM_EVENT: create_run_item_handler(tracker),
        AGENT_UPDATED_STREAM_EVENT: create_agent_updated_handler(),
    }


__all__ = [
    "CallTracker",
    "build_event_handlers",
]
