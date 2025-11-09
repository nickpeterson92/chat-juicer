"""Tests for SDK token tracker module.

Tests automatic token tracking integration.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import Mock, patch

import pytest

from integrations.sdk_token_tracker import (
    SDKTokenTracker,
    connect_session,
    create_tracking_stream_wrapper,
    disconnect_session,
    get_tracker,
    patch_sdk_for_auto_tracking,
    track_streaming_event,
)


class TestSDKTokenTracker:
    """Tests for SDKTokenTracker class."""

    def test_init(self) -> None:
        """Test tracker initialization."""
        tracker = SDKTokenTracker()
        assert tracker.session is None
        assert tracker.enabled is True
        assert tracker._total_tracked == 0

    def test_set_session(self) -> None:
        """Test setting session."""
        tracker = SDKTokenTracker()
        mock_session = Mock()
        mock_session.session_id = "test123"

        tracker.set_session(mock_session)

        assert tracker.session is mock_session
        assert tracker._total_tracked == 0

    def test_clear_session(self) -> None:
        """Test clearing session."""
        tracker = SDKTokenTracker()
        mock_session = Mock()
        tracker.set_session(mock_session)
        tracker._total_tracked = 100

        tracker.clear_session()

        assert tracker.session is None
        assert tracker._total_tracked == 0

    def test_track_content_no_session(self) -> None:
        """Test tracking content with no session."""
        tracker = SDKTokenTracker()

        result = tracker.track_content("test content", "test_source")

        assert result == 0

    def test_track_content_disabled(self) -> None:
        """Test tracking content when disabled."""
        tracker = SDKTokenTracker()
        tracker.enabled = False
        mock_session = Mock()
        tracker.set_session(mock_session)

        result = tracker.track_content("test content", "test_source")

        assert result == 0

    def test_track_content_empty(self) -> None:
        """Test tracking empty content."""
        tracker = SDKTokenTracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        result_none = tracker.track_content(None, "test_source")
        result_empty = tracker.track_content("", "test_source")

        assert result_none == 0
        assert result_empty == 0

    def test_track_content_string(self) -> None:
        """Test tracking string content."""
        tracker = SDKTokenTracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 50}

            result = tracker.track_content("test content", "test_source")

            assert result == 50
            mock_session.update_with_tool_tokens.assert_called_once_with(50)
            assert tracker._total_tracked == 50

    def test_track_content_dict(self) -> None:
        """Test tracking dict content."""
        tracker = SDKTokenTracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count, \
             patch("integrations.sdk_token_tracker.json_safe") as mock_json:
            mock_count.return_value = {"exact_tokens": 30}
            mock_json.return_value = '{"key": "value"}'

            result = tracker.track_content({"key": "value"}, "test_source")

            assert result == 30
            mock_json.assert_called_once()


class TestGetTracker:
    """Tests for get_tracker function."""

    def test_get_tracker_returns_singleton(self) -> None:
        """Test that get_tracker returns the same instance."""
        tracker1 = get_tracker()
        tracker2 = get_tracker()

        assert tracker1 is tracker2


class TestTrackStreamingEvent:
    """Tests for track_streaming_event function."""

    def test_track_event_no_session(self) -> None:
        """Test tracking event with no session."""
        event = Mock()
        tracker = get_tracker()
        tracker.clear_session()

        result = track_streaming_event(event)

        assert result is event

    def test_track_event_tool_call(self) -> None:
        """Test tracking tool call event."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        # Mock event with tool call item
        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "tool_call"
        mock_raw = Mock()
        mock_raw.name = "test_tool"
        mock_raw.arguments = '{"arg": "value"}'
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 10}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_tool_output(self) -> None:
        """Test tracking tool output event."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "tool_call_output"
        mock_item.output = "tool output"
        mock_item.raw_item = {}
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 20}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_tool_error(self) -> None:
        """Test tracking tool error event."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "tool_call_output"
        mock_item.output = "error"
        mock_item.raw_item = {"error": "Tool failed"}
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 5}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_reasoning(self) -> None:
        """Test tracking reasoning event."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "reasoning"
        mock_raw = Mock()
        mock_content = Mock()
        mock_content.text = "reasoning text"
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 15}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_handoff(self) -> None:
        """Test tracking handoff event."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "handoff_output"
        mock_item.output = "handoff data"
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 25}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_tool_call_with_arguments_attr(self) -> None:
        """Test tracking tool call with arguments as attribute (not RawToolCallLike)."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "tool_call"
        mock_raw = Mock()
        mock_raw.name = "test_tool"
        mock_raw.arguments = '{"test": "data"}'
        # Make isinstance(raw, RawToolCallLike) return False
        # by not having the expected attributes
        delattr(mock_raw, "__class__")
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 10}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_reasoning_empty_content(self) -> None:
        """Test tracking reasoning event with empty content."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "reasoning"
        mock_raw = Mock()
        mock_raw.content = []  # Empty content list
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        result = track_streaming_event(mock_event)

        assert result is mock_event
        # Should not call track_content due to empty content

    def test_track_event_reasoning_none_content(self) -> None:
        """Test tracking reasoning event with None content."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "reasoning"
        mock_raw = Mock()
        mock_raw.content = None  # None content
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        result = track_streaming_event(mock_event)

        assert result is mock_event

    def test_track_event_reasoning_with_text_attr(self) -> None:
        """Test tracking reasoning with text attribute (not ContentLike)."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "reasoning"
        mock_raw = Mock()
        mock_content = Mock()
        # Make isinstance(content_item, ContentLike) return False
        mock_content.text = "reasoning text"
        delattr(mock_content, "__class__")
        mock_raw.content = [mock_content]
        mock_item.raw_item = mock_raw
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 15}

            result = track_streaming_event(mock_event)

            assert result is mock_event

    def test_track_event_tool_output_no_error(self) -> None:
        """Test tracking tool output without error field."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "tool_call_output"
        mock_item.output = "success output"
        mock_item.raw_item = {}  # No error field
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 10}

            result = track_streaming_event(mock_event)

            assert result is mock_event
            # Only output should be tracked, no error

    def test_track_event_tool_output_with_raw_item_not_dict(self) -> None:
        """Test tracking tool output when raw_item is not a dict."""
        tracker = get_tracker()
        mock_session = Mock()
        tracker.set_session(mock_session)

        mock_event = Mock()
        mock_item = Mock()
        mock_item.type = "tool_call_output"
        mock_item.output = "output"
        mock_item.raw_item = "not a dict"  # Not a dict
        mock_event.item = mock_item

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 10}

            result = track_streaming_event(mock_event)

            assert result is mock_event


class TestCreateTrackingStreamWrapper:
    """Tests for create_tracking_stream_wrapper function."""

    @pytest.mark.asyncio
    async def test_create_wrapper(self) -> None:
        """Test creating tracking stream wrapper."""

        async def mock_stream():
            yield Mock()
            yield Mock()

        wrapped = create_tracking_stream_wrapper(mock_stream)

        # Should be callable
        assert callable(wrapped)

        # Should yield events
        events = []
        async for event in wrapped():
            events.append(event)

        assert len(events) == 2


class TestPatchSDKForAutoTracking:
    """Tests for patch_sdk_for_auto_tracking function."""

    @patch("integrations.sdk_token_tracker.Runner")
    def test_patch_sdk_success(self, mock_runner: Mock) -> None:
        """Test patching SDK for auto tracking."""
        # Mock Runner with run_streamed method
        mock_runner.run_streamed = Mock()

        result = patch_sdk_for_auto_tracking()

        # Should return True if Runner available and patching succeeded
        assert result is True

    def test_patch_sdk_no_runner(self) -> None:
        """Test patching SDK when Runner not available."""
        with patch("integrations.sdk_token_tracker.Runner", None):
            result = patch_sdk_for_auto_tracking()

            # Should return False if Runner not available
            assert result is False

    @patch("integrations.sdk_token_tracker.Runner")
    def test_patch_sdk_exception(self, mock_runner: Mock) -> None:
        """Test patching SDK with exception."""
        # Mock Runner without run_streamed to cause AttributeError
        del mock_runner.run_streamed

        result = patch_sdk_for_auto_tracking()

        assert result is False

    @patch("integrations.sdk_token_tracker.logger")
    @patch("integrations.sdk_token_tracker.Runner")
    def test_patch_sdk_exception_logged(self, mock_runner: Mock, mock_logger: Mock) -> None:
        """Test patching SDK logs exception."""
        # Make hasattr raise an exception (simulate unexpected error)
        def raise_exception(*args: Any) -> bool:
            raise RuntimeError("Unexpected error during patching")

        # Override hasattr for Runner to trigger exception path
        with patch("builtins.hasattr", side_effect=raise_exception):
            result = patch_sdk_for_auto_tracking()

            assert result is False
            mock_logger.error.assert_called_once()
            assert "Failed to patch SDK" in mock_logger.error.call_args[0][0]


class TestConnectSession:
    """Tests for connect_session function."""

    def test_connect_session(self) -> None:
        """Test connecting session to tracker."""
        mock_session = Mock()
        mock_session.session_id = "chat_test123"
        mock_session.update_with_tool_tokens = Mock()

        # Should not raise
        connect_session(mock_session)

        # Verify session was set
        tracker = get_tracker()
        assert tracker.session is mock_session


class TestDisconnectSession:
    """Tests for disconnect_session function."""

    def test_disconnect_session(self) -> None:
        """Test disconnecting session from tracker."""
        # First connect a session
        mock_session = Mock()
        connect_session(mock_session)

        # Then disconnect
        disconnect_session()

        # Verify session was cleared
        tracker = get_tracker()
        assert tracker.session is None

    def test_disconnect_session_multiple_times(self) -> None:
        """Test disconnecting multiple times."""
        disconnect_session()
        disconnect_session()
        # Should handle multiple calls gracefully
        tracker = get_tracker()
        assert tracker.session is None
