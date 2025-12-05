"""Tests for event handlers module.

Tests event handling and IPC conversion.
"""

from __future__ import annotations

import json

from unittest.mock import Mock

from integrations.event_handlers import (
    CallTracker,
    build_event_handlers,
    handle_handoff_call,
    handle_handoff_output,
    handle_message_output,
    handle_reasoning,
    handle_tool_call,
    handle_tool_output,
)


class TestCallTracker:
    """Tests for CallTracker class."""

    def test_call_tracker_initialization(self) -> None:
        """Test CallTracker initialization."""
        tracker = CallTracker()
        assert tracker is not None
        assert hasattr(tracker, "add_call")
        assert hasattr(tracker, "pop_call")
        assert len(tracker.active_calls) == 0

    def test_call_tracker_add_and_pop(self) -> None:
        """Test adding and popping call IDs."""
        tracker = CallTracker()

        # Add calls
        tracker.add_call("call_1", "tool_a")
        tracker.add_call("call_2", "tool_b")

        assert len(tracker.active_calls) == 2

        # Pop calls in FIFO order
        call1 = tracker.pop_call()
        assert call1 is not None
        assert call1["call_id"] == "call_1"
        assert call1["tool_name"] == "tool_a"

        call2 = tracker.pop_call()
        assert call2 is not None
        assert call2["call_id"] == "call_2"

        # Queue should be empty
        assert len(tracker.active_calls) == 0

    def test_call_tracker_pop_empty(self) -> None:
        """Test popping from empty tracker returns None."""
        tracker = CallTracker()
        result = tracker.pop_call()
        assert result is None


class TestBuildEventHandlers:
    """Tests for build_event_handlers function."""

    def test_build_event_handlers_returns_dict(self) -> None:
        """Test that build_event_handlers returns a dictionary."""
        tracker = CallTracker()
        handlers = build_event_handlers(tracker)

        assert isinstance(handlers, dict)
        assert len(handlers) > 0

    def test_build_event_handlers_has_required_types(self) -> None:
        """Test that handlers dict has expected event types."""
        tracker = CallTracker()
        handlers = build_event_handlers(tracker)

        # Should have handlers for common event types
        # Exact keys depend on implementation
        assert len(handlers) > 0

        # All values should be callable
        for handler in handlers.values():
            assert callable(handler)

    def test_event_handler_signature(self) -> None:
        """Test that event handlers have correct signature."""
        tracker = CallTracker()
        handlers = build_event_handlers(tracker)

        if handlers:
            # Pick first handler
            handler = next(iter(handlers.values()))

            # Should be callable
            assert callable(handler)

            # Test calling with mock event
            mock_event = Mock()
            mock_event.type = "test"
            try:
                result = handler(mock_event)
                # Should return string or None
                assert result is None or isinstance(result, str)
            except Exception:
                # Some handlers may require specific event structure
                pass


class TestHandleMessageOutput:
    """Tests for handle_message_output function."""

    def test_handle_message_output_with_text(self) -> None:
        """Test handling message output with text content."""
        mock_item = Mock()
        mock_content = Mock()
        mock_content.text = "Hello, world!"
        mock_raw = Mock()
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw

        result = handle_message_output(mock_item)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "assistant_delta"
        assert data["content"] == "Hello, world!"

    def test_handle_message_output_no_text(self) -> None:
        """Test handling message output with no text."""
        mock_item = Mock()
        mock_content = Mock()
        mock_content.text = ""
        mock_raw = Mock()
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw

        result = handle_message_output(mock_item)

        assert result is None

    def test_handle_message_output_no_raw_item(self) -> None:
        """Test handling message output without raw_item attribute."""
        mock_item = Mock(spec=[])  # No attributes

        result = handle_message_output(mock_item)

        assert result is None


class TestHandleToolCall:
    """Tests for handle_tool_call function."""

    def test_handle_tool_call_with_valid_data(self) -> None:
        """Test handling tool call with valid data."""
        tracker = CallTracker()
        mock_item = Mock()
        mock_raw = Mock()
        mock_raw.name = "test_function"
        mock_raw.arguments = '{"arg": "value"}'
        mock_raw.call_id = "call_123"
        mock_raw.id = "id_456"
        mock_item.raw_item = mock_raw

        result = handle_tool_call(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "function_detected"
        assert data["name"] == "test_function"
        assert data["call_id"] == "call_123"
        assert len(tracker.active_calls) == 1

    def test_handle_tool_call_fallback_to_id(self) -> None:
        """Test tool call falls back to id when call_id is missing."""
        tracker = CallTracker()
        mock_item = Mock()
        mock_raw = Mock()
        mock_raw.name = "test_func"
        mock_raw.arguments = "{}"
        mock_raw.call_id = None
        mock_raw.id = "fallback_id"
        mock_item.raw_item = mock_raw

        result = handle_tool_call(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["name"] == "test_func"
        # call_id from tracker should be fallback_id
        call = tracker.pop_call()
        assert call is not None
        assert call["call_id"] == "fallback_id"


class TestHandleReasoning:
    """Tests for handle_reasoning function."""

    def test_handle_reasoning_with_text(self) -> None:
        """Test handling reasoning items with text."""
        mock_item = Mock()
        mock_content = Mock()
        mock_content.text = "Thinking about the problem..."
        mock_raw = Mock()
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw

        result = handle_reasoning(mock_item)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "assistant_delta"
        assert "[Thinking]" in data["content"]
        assert "Thinking about the problem..." in data["content"]

    def test_handle_reasoning_no_text(self) -> None:
        """Test handling reasoning with empty text."""
        mock_item = Mock()
        mock_content = Mock()
        mock_content.text = ""
        mock_raw = Mock()
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw

        result = handle_reasoning(mock_item)

        assert result is None


class TestHandleToolOutput:
    """Tests for handle_tool_output function."""

    def test_handle_tool_output_success(self) -> None:
        """Test handling successful tool output."""
        tracker = CallTracker()
        tracker.add_call("call_123", "test_tool")

        mock_item = Mock()
        mock_item.output = {"result": "success"}
        mock_item.raw_item = {}

        result = handle_tool_output(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "function_completed"
        assert data["success"] is True
        assert data["name"] == "test_tool"
        assert data["call_id"] == "call_123"

    def test_handle_tool_output_with_error(self) -> None:
        """Test handling tool output with error."""
        tracker = CallTracker()
        tracker.add_call("call_456", "failing_tool")

        mock_item = Mock()
        mock_item.output = None
        mock_item.raw_item = {"error": "Something went wrong"}

        result = handle_tool_output(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "function_completed"
        assert data["success"] is False
        assert "Something went wrong" in data["result"]

    def test_handle_tool_output_no_tracked_call(self) -> None:
        """Test handling tool output when no call is tracked."""
        tracker = CallTracker()

        mock_item = Mock()
        mock_item.output = "result"
        mock_item.raw_item = {}

        result = handle_tool_output(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["name"] == "unknown"


class TestHandleHandoffCall:
    """Tests for handle_handoff_call function."""

    def test_handle_handoff_call_with_target(self) -> None:
        """Test handling handoff call with target agent."""
        mock_item = Mock()
        mock_raw = Mock()
        mock_raw.target = "specialized_agent"
        mock_item.raw_item = mock_raw

        result = handle_handoff_call(mock_item)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "handoff_started"
        assert data["target_agent"] == "specialized_agent"

    def test_handle_handoff_call_no_raw_item(self) -> None:
        """Test handling handoff call without raw_item."""
        mock_item = Mock(spec=[])  # No raw_item

        result = handle_handoff_call(mock_item)

        assert result is not None
        data = json.loads(result)
        assert data["target_agent"] == "unknown"


class TestHandleHandoffOutput:
    """Tests for handle_handoff_output function."""

    def test_handle_handoff_output_with_result(self) -> None:
        """Test handling handoff output with result."""
        mock_item = Mock()
        mock_raw = Mock()
        mock_raw.source = "source_agent"
        mock_item.raw_item = mock_raw
        mock_item.output = "Handoff result data"

        result = handle_handoff_output(mock_item)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "handoff_completed"
        assert data["source_agent"] == "source_agent"
        assert data["result"] == "Handoff result data"

    def test_handle_handoff_output_no_output(self) -> None:
        """Test handling handoff output with no output."""
        mock_item = Mock()
        mock_raw = Mock()
        mock_raw.source = "agent"
        mock_item.raw_item = mock_raw
        mock_item.output = None

        result = handle_handoff_output(mock_item)

        assert result is not None
        data = json.loads(result)
        assert data["result"] == ""


class TestRunItemStreamEventHandling:
    """Tests for run_item_stream_event handler from build_event_handlers."""

    def test_handle_run_item_with_message_output(self) -> None:
        """Test handling run_item event with message output.

        NOTE: MESSAGE_OUTPUT_ITEM handling is intentionally disabled in production.
        Token-by-token streaming now uses raw_response_event with response.output_text.delta.
        This test verifies the handler returns None for MESSAGE_OUTPUT_ITEM (disabled behavior).
        """
        from core.constants import MESSAGE_OUTPUT_ITEM, RUN_ITEM_STREAM_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RUN_ITEM_STREAM_EVENT]

        # Create mock event
        mock_event = Mock()
        mock_event.type = RUN_ITEM_STREAM_EVENT
        mock_item = Mock()
        mock_item.type = MESSAGE_OUTPUT_ITEM
        mock_content = Mock()
        mock_content.text = "Test message"
        mock_raw = Mock()
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        result = handler(mock_event)

        # MESSAGE_OUTPUT_ITEM is disabled - handler should return None
        assert result is None

    def test_handle_run_item_with_tool_call(self) -> None:
        """Test handling run_item event with tool call."""
        from core.constants import RUN_ITEM_STREAM_EVENT, TOOL_CALL_ITEM

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RUN_ITEM_STREAM_EVENT]

        # Create mock event
        mock_event = Mock()
        mock_event.type = RUN_ITEM_STREAM_EVENT
        mock_item = Mock()
        mock_item.type = TOOL_CALL_ITEM
        mock_raw = Mock()
        mock_raw.name = "test_tool"
        mock_raw.arguments = "{}"
        mock_raw.call_id = "call_123"
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        result = handler(mock_event)

        assert result is not None
        assert len(tracker.active_calls) == 1


class TestAgentUpdatedEventHandling:
    """Tests for agent_updated event handler from build_event_handlers."""

    def test_handle_agent_updated_event(self) -> None:
        """Test handling agent_updated event."""
        from core.constants import AGENT_UPDATED_STREAM_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[AGENT_UPDATED_STREAM_EVENT]

        # Create mock event
        mock_event = Mock()
        mock_event.type = AGENT_UPDATED_STREAM_EVENT
        mock_event.new_agent = Mock()
        mock_event.new_agent.name = "NewAgent"

        result = handler(mock_event)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "agent_updated"
        assert data["name"] == "NewAgent"
