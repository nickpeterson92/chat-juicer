"""
Agent event handlers for multi-agent orchestration.

Handles AGENT_UPDATED_STREAM_EVENT events from the Agent/Runner framework
when agents are switched during multi-agent conversations.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import cast

from core.constants import (
    AGENT_UPDATED_STREAM_EVENT,
    MSG_TYPE_AGENT_UPDATED,
)
from models.event_models import AgentUpdateMessage
from models.sdk_models import (
    AgentUpdatedStreamEvent,
    StreamEvent,
)


def handle_agent_updated(event: StreamEvent) -> str | None:
    """Handle agent updated events (multi-agent transitions).

    Fires when the active agent changes during a multi-agent conversation,
    allowing the UI to display which agent is currently responding.
    """
    if getattr(event, "type", None) != AGENT_UPDATED_STREAM_EVENT:
        return None

    aue = cast(AgentUpdatedStreamEvent, event)
    msg = AgentUpdateMessage(type=MSG_TYPE_AGENT_UPDATED, name=aue.new_agent.name)
    return msg.to_json()  # type: ignore[no-any-return]


def create_agent_updated_handler() -> Callable[[StreamEvent], str | None]:
    """Create an agent updated event handler.

    Returns a handler function that processes agent transition events.
    This is a simple wrapper for consistency with other handler creators.
    """
    return handle_agent_updated
