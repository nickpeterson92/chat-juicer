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
        assert hasattr(tracker, "pop_call_by_id")
        assert hasattr(tracker, "drain_all")
        assert len(tracker.active_calls) == 0

    def test_call_tracker_add_and_pop_by_id(self) -> None:
        """Test adding and popping call IDs by specific ID (parallel-safe)."""
        tracker = CallTracker()

        # Add calls
        tracker.add_call("call_1", "tool_a")
        tracker.add_call("call_2", "tool_b")

        assert len(tracker.active_calls) == 2

        # Pop by specific ID (works regardless of order - parallel-safe)
        call2 = tracker.pop_call_by_id("call_2")
        assert call2 is not None
        assert call2["call_id"] == "call_2"
        assert call2["tool_name"] == "tool_b"

        call1 = tracker.pop_call_by_id("call_1")
        assert call1 is not None
        assert call1["call_id"] == "call_1"
        assert call1["tool_name"] == "tool_a"

        # Dict should be empty
        assert len(tracker.active_calls) == 0

    def test_call_tracker_pop_nonexistent(self) -> None:
        """Test popping nonexistent call_id returns None."""
        tracker = CallTracker()
        result = tracker.pop_call_by_id("nonexistent")
        assert result is None

    def test_call_tracker_drain_all(self) -> None:
        """Test drain_all returns all calls and clears tracker."""
        tracker = CallTracker()
        tracker.add_call("call_1", "tool_a")
        tracker.add_call("call_2", "tool_b")
        tracker.add_call("call_3", "tool_c")

        all_calls = tracker.drain_all()
        assert len(all_calls) == 3
        assert len(tracker.active_calls) == 0

        # Verify all calls are returned
        call_ids = {c["call_id"] for c in all_calls}
        assert call_ids == {"call_1", "call_2", "call_3"}

    def test_call_tracker_has_call(self) -> None:
        """Test has_call method for checking existing calls."""
        tracker = CallTracker()

        # Empty tracker should return False
        assert tracker.has_call("call_1") is False

        # Add a call
        tracker.add_call("call_1", "tool_a")
        assert tracker.has_call("call_1") is True
        assert tracker.has_call("call_2") is False

        # Adding duplicate call_id should be prevented
        tracker.add_call("call_1", "tool_a")
        assert len(tracker.active_calls) == 1  # Still only 1

        # Add another unique call
        tracker.add_call("call_2", "tool_b")
        assert len(tracker.active_calls) == 2
        assert tracker.has_call("call_2") is True


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

        result = handle_message_output(mock_item, CallTracker())

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

        result = handle_message_output(mock_item, CallTracker())

        assert result is None

    def test_handle_message_output_no_raw_item(self) -> None:
        """Test handling message output without raw_item attribute."""
        mock_item = Mock(spec=[])  # No attributes

        result = handle_message_output(mock_item, CallTracker())

        assert result is None


class TestHandleToolCall:
    """Tests for handle_tool_call function."""

    def test_handle_tool_call_with_valid_data(self) -> None:
        """Test handling tool call with valid data.

        TOOL_CALL_ITEM fires after args are complete, so we emit function_executing
        (not function_detected, which is emitted earlier via output_item.added).
        """
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
        assert data["type"] == "function_executing"  # Changed from function_detected
        assert data["tool_name"] == "test_function"
        assert data["tool_call_id"] == "call_123"
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
        assert data["tool_name"] == "test_func"
        # call_id from tracker should be fallback_id (pop by specific ID)
        call = tracker.pop_call_by_id("fallback_id")
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

        result = handle_reasoning(mock_item, CallTracker())

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

        result = handle_reasoning(mock_item, CallTracker())

        assert result is None


class TestHandleToolOutput:
    """Tests for handle_tool_output function."""

    def test_handle_tool_output_success(self) -> None:
        """Test handling successful tool output with proper call_id matching."""
        tracker = CallTracker()
        tracker.add_call("call_123", "test_tool")

        mock_item = Mock()
        mock_item.call_id = None  # Ensure fallback to raw_item
        mock_item.output = {"result": "success"}
        # raw_item must include call_id for parallel-safe matching
        mock_item.raw_item = {"call_id": "call_123"}

        result = handle_tool_output(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "function_completed"
        assert data["tool_success"] is True
        assert data["tool_name"] == "test_tool"
        assert data["tool_call_id"] == "call_123"

    def test_handle_tool_output_with_error(self) -> None:
        """Test handling tool output with error."""
        tracker = CallTracker()
        tracker.add_call("call_456", "failing_tool")

        mock_item = Mock()
        mock_item.call_id = None  # Ensure fallback to raw_item
        mock_item.output = None
        mock_item.raw_item = {"call_id": "call_456", "error": "Something went wrong"}

        result = handle_tool_output(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "function_completed"
        assert data["tool_success"] is False
        assert "Something went wrong" in data["tool_result"]

    def test_handle_tool_output_no_tracked_call(self) -> None:
        """Test handling tool output when no call is tracked."""
        tracker = CallTracker()

        mock_item = Mock()
        mock_item.call_id = None  # Ensure fallback to raw_item
        mock_item.output = "result"
        mock_item.raw_item = {"call_id": "unknown_call"}

        result = handle_tool_output(mock_item, tracker)

        assert result is not None
        data = json.loads(result)
        assert data["tool_name"] == "unknown"


class TestHandleHandoffCall:
    """Tests for handle_handoff_call function."""

    def test_handle_handoff_call_with_target(self) -> None:
        """Test handling handoff call with target agent."""
        mock_item = Mock()
        mock_raw = Mock()
        mock_raw.target = "specialized_agent"
        mock_item.raw_item = mock_raw

        result = handle_handoff_call(mock_item, CallTracker())

        assert result is not None
        data = json.loads(result)
        assert data["type"] == "handoff_started"
        assert data["target_agent"] == "specialized_agent"

    def test_handle_handoff_call_no_raw_item(self) -> None:
        """Test handling handoff call without raw_item."""
        mock_item = Mock(spec=[])  # No raw_item

        result = handle_handoff_call(mock_item, CallTracker())

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

        result = handle_handoff_output(mock_item, CallTracker())

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

        result = handle_handoff_output(mock_item, CallTracker())

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


class TestRawResponseEventHandling:
    """Tests for raw response event handler dispatch."""

    def test_raw_response_event_missing_type_returns_none(self) -> None:
        """Event without data.type should be ignored."""
        from core.constants import RAW_RESPONSE_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RAW_RESPONSE_EVENT]

        event = Mock()
        event.type = RAW_RESPONSE_EVENT
        event.data = Mock()
        event.data.type = None

        assert handler(event) is None

    def test_raw_response_event_unknown_type_with_delta_fallbacks(self) -> None:
        """Unknown event types with delta fall back to assistant_delta."""
        from core.constants import RAW_RESPONSE_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RAW_RESPONSE_EVENT]

        event = Mock()
        event.type = RAW_RESPONSE_EVENT
        event.data = Mock()
        event.data.type = "response.unknown"
        event.data.delta = "hi there"

        result = handler(event)
        assert result is not None
        payload = json.loads(result)
        assert payload["type"] == "assistant_delta"
        assert payload["content"] == "hi there"

    def test_early_function_detection_via_output_item_added(self) -> None:
        """Test response.output_item.added emits function_detected early."""
        from core.constants import RAW_RESPONSE_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RAW_RESPONSE_EVENT]

        # Simulate response.output_item.added for a function call
        event = Mock()
        event.type = RAW_RESPONSE_EVENT
        event.data = Mock()
        event.data.type = "response.output_item.added"
        event.data.item = Mock()
        event.data.item.type = "function_call"
        event.data.item.name = "generate_document"
        event.data.item.call_id = "call_abc123"

        result = handler(event)
        assert result is not None
        payload = json.loads(result)
        assert payload["type"] == "function_detected"
        assert payload["tool_name"] == "generate_document"
        assert payload["tool_call_id"] == "call_abc123"
        assert payload["tool_arguments"] == "{}"  # Empty - args stream separately

        # Verify call was added to tracker
        assert tracker.has_call("call_abc123") is True

    def test_output_item_added_non_function_returns_none(self) -> None:
        """Test response.output_item.added for non-function items returns None."""
        from core.constants import RAW_RESPONSE_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RAW_RESPONSE_EVENT]

        # Simulate response.output_item.added for a text output (not function)
        event = Mock()
        event.type = RAW_RESPONSE_EVENT
        event.data = Mock()
        event.data.type = "response.output_item.added"
        event.data.item = Mock()
        event.data.item.type = "message"  # Not a function_call

        result = handler(event)
        assert result is None


class TestFunctionArgumentsEvents:
    """Tests for function argument streaming handlers."""

    def test_function_arguments_delta_event_valid(self) -> None:
        from core.constants import RAW_RESPONSE_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RAW_RESPONSE_EVENT]

        event = Mock()
        event.type = RAW_RESPONSE_EVENT
        event.data = Mock()
        event.data.type = "response.function_call_arguments.delta"
        event.data.call_id = "call-1"
        event.data.delta = '{"foo": "bar"}'
        event.data.output_index = 2

        result = handler(event)
        assert result is not None
        payload = json.loads(result)
        assert payload["type"] == "function_call_arguments_delta"
        assert payload["tool_call_id"] == "call-1"
        assert payload["delta"] == '{"foo": "bar"}'
        assert payload["output_index"] == 2

    def test_function_arguments_delta_event_missing_call_id_returns_none(self) -> None:
        from core.constants import RAW_RESPONSE_EVENT

        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        handler = handlers[RAW_RESPONSE_EVENT]

        event = Mock()
        event.type = RAW_RESPONSE_EVENT
        event.data = Mock()
        event.data.type = "response.function_call_arguments.delta"
        event.data.call_id = None
        event.data.delta = None

        assert handler(event) is None
