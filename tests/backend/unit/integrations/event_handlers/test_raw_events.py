"""Tests for raw response event handlers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from integrations.event_handlers.raw_events import (
    create_raw_response_handler,
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


class TestTextDeltaHandler:
    """Tests for text delta event handler."""

    def test_with_delta(self) -> None:
        """Test handling text delta event."""
        data = SimpleNamespace(delta="Hello")
        result = handle_text_delta_event(data)

        assert result is not None
        assert "Hello" in result

    def test_without_delta(self) -> None:
        """Test returns None when no delta."""
        data = SimpleNamespace()
        result = handle_text_delta_event(data)

        assert result is None


class TestFunctionArgumentsHandlers:
    """Tests for function argument handlers."""

    def test_delta_with_valid_data(self) -> None:
        """Test function arguments delta with valid data."""
        data = SimpleNamespace(call_id="call_123", delta='{"arg": "val"}', output_index=0)
        result = handle_function_arguments_delta_event(data)

        assert result is not None
        assert "call_123" in result

    def test_delta_without_call_id(self) -> None:
        """Test returns None without call_id."""
        data = SimpleNamespace(delta='{"arg": "val"}')
        result = handle_function_arguments_delta_event(data)

        assert result is None

    def test_delta_without_delta(self) -> None:
        """Test returns None without delta."""
        data = SimpleNamespace(call_id="call_123")
        result = handle_function_arguments_delta_event(data)

        assert result is None

    def test_done_with_valid_data(self) -> None:
        """Test function arguments done with valid data."""
        data = SimpleNamespace(call_id="call_456", output_index=0)
        result = handle_function_arguments_done_event(data)

        assert result is not None
        assert "call_456" in result

    def test_done_without_call_id(self) -> None:
        """Test returns None without call_id."""
        data = SimpleNamespace()
        result = handle_function_arguments_done_event(data)

        assert result is None


class TestReasoningHandlers:
    """Tests for reasoning event handlers."""

    def test_text_delta_with_data(self) -> None:
        """Test reasoning text delta handler."""
        data = SimpleNamespace(delta="thinking...", reasoning_index=0, output_index=0)
        result = handle_reasoning_text_delta_event(data)

        assert result is not None
        assert "thinking" in result

    def test_text_delta_without_delta(self) -> None:
        """Test returns None without delta."""
        data = SimpleNamespace()
        result = handle_reasoning_text_delta_event(data)

        assert result is None

    def test_summary_delta_with_data(self) -> None:
        """Test reasoning summary delta handler."""
        data = SimpleNamespace(delta="summarizing...", output_index=0)
        result = handle_reasoning_summary_delta_event(data)

        assert result is not None
        assert "summarizing" in result

    def test_summary_delta_without_delta(self) -> None:
        """Test returns None without delta."""
        data = SimpleNamespace()
        result = handle_reasoning_summary_delta_event(data)

        assert result is None


class TestRefusalHandler:
    """Tests for refusal delta handler."""

    def test_with_delta(self) -> None:
        """Test refusal delta with data."""
        data = SimpleNamespace(delta="I cannot help with that", content_index=0, output_index=0)
        result = handle_refusal_delta_event(data)

        assert result is not None
        assert "cannot" in result

    def test_without_delta(self) -> None:
        """Test returns None without delta."""
        data = SimpleNamespace()
        result = handle_refusal_delta_event(data)

        assert result is None


class TestContentPartHandlers:
    """Tests for content part handlers."""

    def test_added_with_index(self) -> None:
        """Test content part added with content_index."""
        data = SimpleNamespace(content_index=0, output_index=0, part_type="text")
        result = handle_content_part_added_event(data)

        assert result is not None
        assert "content_part_added" in result

    def test_added_without_index(self) -> None:
        """Test returns None without content_index."""
        data = SimpleNamespace()
        result = handle_content_part_added_event(data)

        assert result is None

    def test_done_with_index(self) -> None:
        """Test content part done with content_index."""
        data = SimpleNamespace(content_index=1, output_index=0, part_type="text")
        result = handle_content_part_done_event(data)

        assert result is not None
        assert "content_part_done" in result

    def test_done_without_index(self) -> None:
        """Test returns None without content_index."""
        data = SimpleNamespace()
        result = handle_content_part_done_event(data)

        assert result is None


class TestOutputItemHandlers:
    """Tests for output item handlers."""

    def test_added_function_call(self) -> None:
        """Test output item added for function call."""
        tracker = MagicMock()
        item = SimpleNamespace(type="function_call", name="search", call_id="call_789")
        data = SimpleNamespace(item=item)

        result = handle_output_item_added(data, tracker)

        assert result is not None
        assert "search" in result
        tracker.add_call.assert_called_once()

    def test_added_non_function(self) -> None:
        """Test returns None for non-function output item."""
        tracker = MagicMock()
        item = SimpleNamespace(type="text", content="hello")
        data = SimpleNamespace(item=item)

        result = handle_output_item_added(data, tracker)

        assert result is None
        tracker.add_call.assert_not_called()

    def test_done_function_call(self) -> None:
        """Test output item done for function call."""
        item = SimpleNamespace(type="function_call", name="fetch", call_id="call_999", arguments='{"url":"test"}')
        data = SimpleNamespace(item=item)

        result = handle_output_item_done(data)

        assert result is not None
        assert "fetch" in result

    def test_done_non_function(self) -> None:
        """Test returns None for non-function output item done."""
        item = SimpleNamespace(type="text")
        data = SimpleNamespace(item=item)

        result = handle_output_item_done(data)

        assert result is None


class TestRawResponseHandler:
    """Tests for the main raw response handler."""

    def test_handler_creation(self) -> None:
        """Test handler factory creates callable."""
        tracker = MagicMock()
        handler = create_raw_response_handler(tracker)

        assert callable(handler)

    def test_invalid_event_type(self) -> None:
        """Test returns None for non-raw-response event."""
        tracker = MagicMock()
        handler = create_raw_response_handler(tracker)
        event = SimpleNamespace(type="other_event", data=None)

        result = handler(event)

        assert result is None

    def test_missing_data(self) -> None:
        """Test returns None when event has no data."""
        tracker = MagicMock()
        handler = create_raw_response_handler(tracker)
        event = SimpleNamespace(type="raw_response_event")

        result = handler(event)

        assert result is None
