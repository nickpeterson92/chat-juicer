"""
SDK-level automatic token tracking for all tool calls.
Provides universal token tracking that works with any tools, MCP servers, and future agents.
"""

from __future__ import annotations

import json

from functools import wraps
from typing import TYPE_CHECKING, Any

from constants import (
    HANDOFF_OUTPUT_ITEM,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    TOKEN_SOURCE_HANDOFF,
    TOKEN_SOURCE_REASONING,
    TOKEN_SOURCE_TOOL_CALL,
    TOKEN_SOURCE_TOOL_ERROR,
    TOKEN_SOURCE_TOOL_OUTPUT,
    TOKEN_SOURCE_UNKNOWN,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
)
from logger import logger
from utils import estimate_tokens

# Optional SDK import at module level to satisfy linter; handled if missing
try:
    from agents import Runner
except ImportError:
    Runner = None  # type: ignore[misc,assignment]

if TYPE_CHECKING:
    from session import TokenAwareSQLiteSession


class SDKTokenTracker:
    """Global SDK-level token tracker that automatically tracks ALL tool tokens.

    This elegant solution intercepts at the streaming event level to catch:
    - Native function tools
    - MCP server tools
    - Future tools and agents
    - Multi-agent handoffs
    """

    def __init__(self) -> None:
        self.session: TokenAwareSQLiteSession | None = None
        self.enabled: bool = True
        self._total_tracked: int = 0  # For debugging/logging

    def set_session(self, session: TokenAwareSQLiteSession) -> None:
        """Connect a session for automatic token updates."""
        self.session = session
        self._total_tracked = 0
        logger.info("SDK token tracker connected to session")

    def clear_session(self) -> None:
        """Disconnect the session."""
        if self._total_tracked > 0:
            logger.info(f"SDK token tracker disconnecting. Total tracked: {self._total_tracked} tokens")
        self.session = None
        self._total_tracked = 0

    def track_content(self, content: Any, source: str = TOKEN_SOURCE_UNKNOWN) -> int:
        """Track tokens for any content and auto-update session.

        Args:
            content: The content to track tokens for
            source: Description of where the content came from

        Returns:
            Number of tokens tracked
        """
        if not self.enabled or not self.session:
            return 0

        # Convert to string for token counting
        if content is None or content == "":
            return 0

        content_str = json.dumps(content) if isinstance(content, (dict, list)) else str(content)

        # Count tokens
        result = estimate_tokens(content_str)
        tokens = result.get("exact_tokens", 0)

        if tokens > 0:
            # Auto-update session
            self.session.update_with_tool_tokens(tokens)
            self._total_tracked += tokens
            logger.debug(f"SDK auto-tracked {tokens} tokens from {source} (total: {self._total_tracked})")

        return tokens


# Global instance - singleton pattern
_sdk_tracker = SDKTokenTracker()


def get_tracker() -> SDKTokenTracker:
    """Get the global SDK token tracker instance."""
    return _sdk_tracker


def track_streaming_event(event: Any) -> Any:
    """Decorator/wrapper that automatically tracks tokens in streaming events.

    This is the key innovation - we intercept ALL events at the streaming level,
    extract tool-related tokens, and track them automatically.
    """
    tracker = get_tracker()

    if not tracker.enabled or not tracker.session:
        return event

    # Check if this is a run_item_stream_event with tool data
    if hasattr(event, "type") and event.type == RUN_ITEM_STREAM_EVENT and hasattr(event, "item") and event.item:
        item = event.item
        item_type = getattr(item, "type", "")

        # Track tool call arguments
        if item_type == TOOL_CALL_ITEM:
            if hasattr(item, "raw_item"):
                raw = item.raw_item
                # Track the arguments being sent to the tool
                arguments = getattr(raw, "arguments", None)
                if arguments:
                    tracker.track_content(arguments, f"{TOKEN_SOURCE_TOOL_CALL}:{getattr(raw, 'name', 'unknown')}")

        # Track tool call outputs
        elif item_type == TOOL_CALL_OUTPUT_ITEM:
            if hasattr(item, "output"):
                # Track the output from the tool
                tracker.track_content(item.output, TOKEN_SOURCE_TOOL_OUTPUT)
            # Also check for errors
            if hasattr(item, "raw_item") and isinstance(item.raw_item, dict):
                error = item.raw_item.get("error")
                if error:
                    tracker.track_content(error, TOKEN_SOURCE_TOOL_ERROR)

        # Track reasoning (Sequential Thinking)
        elif item_type == REASONING_ITEM:
            if hasattr(item, "raw_item"):
                raw = item.raw_item
                content = getattr(raw, "content", [])
                if content:
                    for content_item in content:
                        text = getattr(content_item, "text", None)
                        if text:
                            tracker.track_content(text, TOKEN_SOURCE_REASONING)

        # Track multi-agent handoffs
        elif item_type == HANDOFF_OUTPUT_ITEM and hasattr(item, "output"):
            tracker.track_content(item.output, TOKEN_SOURCE_HANDOFF)

    return event


def create_tracking_stream_wrapper(original_stream_events: Any) -> Any:
    """Create a wrapper for stream_events that auto-tracks tokens.

    This is the elegant solution - we wrap the stream at the source,
    so ALL events flow through our tracker automatically.
    """

    # Always create a wrapper without self since stream_events is a bound method
    async def wrapped_stream_events() -> Any:
        """Wrapped stream_events that tracks tool tokens automatically."""
        async for event in original_stream_events():
            # Track tokens in the event
            track_streaming_event(event)
            # Yield the original event unchanged
            yield event

    return wrapped_stream_events


def patch_sdk_for_auto_tracking() -> bool:
    """Monkey patch the SDK to enable automatic token tracking.

    This is the single point of integration - we patch the streaming
    mechanism to automatically track all tool tokens.
    """
    try:
        # Ensure Runner is available for patching
        if Runner is None:
            logger.warning("SDK Runner not available; skipping token tracking patch")
            return False

        # Check if we can patch RunResultStreaming
        if hasattr(Runner, "run_streamed"):
            # Get the original method
            original_run_streamed = Runner.run_streamed

            @wraps(original_run_streamed)
            def patched_run_streamed(*args: Any, **kwargs: Any) -> Any:
                """Patched run_streamed that adds token tracking to the result."""
                result = original_run_streamed(*args, **kwargs)

                # Patch the stream_events method of the result
                if hasattr(result, "stream_events"):
                    original_stream = result.stream_events
                    result.stream_events = create_tracking_stream_wrapper(original_stream)

                return result

            # Apply the patch
            Runner.run_streamed = patched_run_streamed
            logger.info("SDK patched for automatic token tracking at Runner.run_streamed level")
            return True

    except Exception as e:
        logger.error(f"Failed to patch SDK for token tracking: {e}")

    return False


def connect_session(session: TokenAwareSQLiteSession) -> None:
    """Connect a session to the SDK token tracker.

    Call this after creating a session to enable automatic token tracking.
    """
    get_tracker().set_session(session)


def disconnect_session() -> None:
    """Disconnect the current session from token tracking."""
    get_tracker().clear_session()
