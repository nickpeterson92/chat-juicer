"""Extended tests for SDK token tracker to increase coverage.

Covers streaming event tracking and error paths.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import Mock, PropertyMock, patch

import pytest

from integrations.sdk_token_tracker import (
    connect_session,
    create_tracking_stream_wrapper,
    disconnect_session,
    get_tracker,
    patch_sdk_for_auto_tracking,
    track_streaming_event,
)


class TestTrackStreamingEvent:
    """Tests for track_streaming_event function."""

    def test_track_streaming_event_no_session(self) -> None:
        """Test track_streaming_event with no active session."""
        tracker = get_tracker()
        tracker.session = None

        mock_event = Mock()
        mock_event.type = "run_item_stream_event"

        # Should not raise error, just skip tracking
        result = track_streaming_event(mock_event)
        assert result == mock_event

    def test_track_streaming_event_tracker_disabled(self) -> None:
        """Test track_streaming_event when tracker is disabled."""
        tracker = get_tracker()
        tracker.enabled = False

        mock_event = Mock()
        mock_event.type = "run_item_stream_event"

        result = track_streaming_event(mock_event)
        assert result == mock_event

        # Re-enable for other tests
        tracker.enabled = True

    def test_track_streaming_event_tool_call_with_arguments(self) -> None:
        """Test tracking tool call arguments."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        # Create event with tool call
        from integrations.sdk_token_tracker import TOOL_CALL_ITEM

        mock_event = Mock()
        mock_event.item = Mock()
        mock_event.item.type = TOOL_CALL_ITEM
        mock_event.item.raw_item = Mock()
        mock_event.item.raw_item.name = "read_file"
        mock_event.item.raw_item.arguments = '{"file_path": "test.txt"}'

        # Patch isinstance to treat our mock as RunItemStreamEvent
        with (
            patch(
                "integrations.sdk_token_tracker.isinstance",
                side_effect=lambda obj, cls: True if obj is mock_event else isinstance(obj, cls),
            ),
            patch("integrations.sdk_token_tracker.count_tokens") as mock_count,
        ):
            mock_count.return_value = {"exact_tokens": 10}

            result = track_streaming_event(mock_event)

            # Should track tokens
            mock_session.update_with_tool_tokens.assert_called_once_with(10)
            assert result == mock_event

    def test_track_streaming_event_tool_output(self) -> None:
        """Test tracking tool call output."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        from integrations.sdk_token_tracker import TOOL_CALL_OUTPUT_ITEM

        mock_event = Mock()
        mock_event.item = Mock()
        mock_event.item.type = TOOL_CALL_OUTPUT_ITEM
        mock_event.item.output = "File content: " + ("x" * 1000)

        # Patch isinstance to treat our mock as RunItemStreamEvent
        with (
            patch(
                "integrations.sdk_token_tracker.isinstance",
                side_effect=lambda obj, cls: True if obj is mock_event else isinstance(obj, cls),
            ),
            patch("integrations.sdk_token_tracker.count_tokens") as mock_count,
        ):
            mock_count.return_value = {"exact_tokens": 250}

            result = track_streaming_event(mock_event)

            mock_session.update_with_tool_tokens.assert_called_once_with(250)
            assert result == mock_event

    def test_track_streaming_event_tool_error(self) -> None:
        """Test tracking tool call error."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        from integrations.sdk_token_tracker import TOOL_CALL_OUTPUT_ITEM

        mock_event = Mock()
        mock_event.item = Mock()
        mock_event.item.type = TOOL_CALL_OUTPUT_ITEM
        mock_event.item.output = None
        mock_event.item.raw_item = {"error": "File not found"}

        # Patch isinstance to treat our mock as RunItemStreamEvent
        with (
            patch(
                "integrations.sdk_token_tracker.isinstance",
                side_effect=lambda obj, cls: True if obj is mock_event else isinstance(obj, cls),
            ),
            patch("integrations.sdk_token_tracker.count_tokens") as mock_count,
        ):
            mock_count.return_value = {"exact_tokens": 5}

            result = track_streaming_event(mock_event)

            mock_session.update_with_tool_tokens.assert_called_once()
            assert result == mock_event

    def test_track_streaming_event_reasoning_item(self) -> None:
        """Test tracking reasoning tokens."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        from integrations.sdk_token_tracker import REASONING_ITEM

        mock_content = Mock()
        mock_content.text = "This is reasoning content"

        mock_event = Mock()
        mock_event.item = Mock()
        mock_event.item.type = REASONING_ITEM
        mock_event.item.raw_item = Mock()
        mock_event.item.raw_item.content = [mock_content]

        # Patch isinstance to treat our mock as RunItemStreamEvent
        with (
            patch(
                "integrations.sdk_token_tracker.isinstance",
                side_effect=lambda obj, cls: True if obj is mock_event else isinstance(obj, cls),
            ),
            patch("integrations.sdk_token_tracker.count_tokens") as mock_count,
        ):
            mock_count.return_value = {"exact_tokens": 20}

            result = track_streaming_event(mock_event)

            mock_session.update_with_tool_tokens.assert_called_once()
            assert result == mock_event

    def test_track_streaming_event_handoff_output(self) -> None:
        """Test tracking handoff tokens."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        from integrations.sdk_token_tracker import HANDOFF_OUTPUT_ITEM

        mock_event = Mock()
        mock_event.item = Mock()
        mock_event.item.type = HANDOFF_OUTPUT_ITEM
        mock_event.item.output = "Handoff to agent X"

        # Patch isinstance to treat our mock as RunItemStreamEvent
        with (
            patch(
                "integrations.sdk_token_tracker.isinstance",
                side_effect=lambda obj, cls: True if obj is mock_event else isinstance(obj, cls),
            ),
            patch("integrations.sdk_token_tracker.count_tokens") as mock_count,
        ):
            mock_count.return_value = {"exact_tokens": 15}

            result = track_streaming_event(mock_event)

            mock_session.update_with_tool_tokens.assert_called_once()
            assert result == mock_event

    def test_track_streaming_event_empty_content(self) -> None:
        """Test tracking with empty content."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        from integrations.sdk_token_tracker import TOOL_CALL_OUTPUT_ITEM

        mock_event = Mock()
        mock_event.item = Mock()
        mock_event.item.type = TOOL_CALL_OUTPUT_ITEM
        mock_event.item.output = ""

        result = track_streaming_event(mock_event)

        # Should not call update for empty content
        mock_session.update_with_tool_tokens.assert_not_called()
        assert result == mock_event

    def test_track_streaming_event_non_run_item(self) -> None:
        """Test tracking event that's not a RunItemStreamEvent."""
        mock_session = Mock()
        tracker = get_tracker()
        tracker.set_session(mock_session)

        # Event without proper structure
        mock_event = {"type": "some_other_event"}

        result = track_streaming_event(mock_event)

        # Should return event unchanged
        assert result == mock_event


class TestSessionConnection:
    """Tests for session connection and disconnection."""

    def test_connect_disconnect_session(self) -> None:
        """Test connecting and disconnecting sessions."""
        mock_session = Mock()
        mock_session.session_id = "chat_test"

        tracker = get_tracker()

        # Connect
        connect_session(mock_session)
        assert tracker.session == mock_session
        assert tracker._total_tracked == 0

        # Disconnect
        disconnect_session()
        assert tracker.session is None

    def test_disconnect_session_logs_total_tracked(self) -> None:
        """Test disconnect logs total tracked tokens."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        # Track some tokens
        tracker.track_content("test content", "test_source")

        # Disconnect should log total
        with patch("integrations.sdk_token_tracker.logger") as mock_logger:
            disconnect_session()
            mock_logger.info.assert_called()

    def test_tracker_track_content_none(self) -> None:
        """Test tracking None content."""
        mock_session = Mock()
        tracker = get_tracker()
        tracker.set_session(mock_session)

        tokens = tracker.track_content(None, "test_source")
        assert tokens == 0

    def test_tracker_track_content_dict(self) -> None:
        """Test tracking dict content."""
        mock_session = Mock()
        mock_session.update_with_tool_tokens = Mock()

        tracker = get_tracker()
        tracker.set_session(mock_session)

        with patch("integrations.sdk_token_tracker.count_tokens") as mock_count:
            mock_count.return_value = {"exact_tokens": 50}

            tokens = tracker.track_content({"key": "value"}, "test_source")

            assert tokens == 50
            mock_session.update_with_tool_tokens.assert_called_once_with(50)


class TestCreateTrackingStreamWrapper:
    """Tests for create_tracking_stream_wrapper function."""

    @pytest.mark.asyncio
    async def test_create_tracking_stream_wrapper(self) -> None:
        """Test creating a tracking stream wrapper."""

        # Mock original stream
        async def original_stream() -> AsyncGenerator[Any, None]:
            mock_event = Mock()
            mock_event.type = "test_event"
            yield mock_event

        # Create wrapper
        wrapped = create_tracking_stream_wrapper(original_stream)

        # Consume wrapped stream
        events = [event async for event in wrapped()]

        assert len(events) == 1
        assert events[0].type == "test_event"


class TestPatchSDKForAutoTracking:
    """Tests for patch_sdk_for_auto_tracking function."""

    def test_patch_sdk_for_auto_tracking_success(self) -> None:
        """Test successful SDK patching."""
        mock_runner = Mock()
        mock_runner.run_streamed = Mock()

        with patch("integrations.sdk_token_tracker.Runner", mock_runner):
            result = patch_sdk_for_auto_tracking()

            assert result is True

    def test_patch_sdk_for_auto_tracking_no_runner(self) -> None:
        """Test patching when Runner is None."""
        with patch("integrations.sdk_token_tracker.Runner", None):
            result = patch_sdk_for_auto_tracking()

            assert result is False

    def test_patch_sdk_for_auto_tracking_no_run_streamed(self) -> None:
        """Test patching when run_streamed doesn't exist."""
        mock_runner = Mock(spec=[])  # No run_streamed attribute

        with patch("integrations.sdk_token_tracker.Runner", mock_runner):
            result = patch_sdk_for_auto_tracking()

            assert result is False

    def test_patch_sdk_for_auto_tracking_exception(self) -> None:
        """Test patching handles exceptions gracefully."""
        # Create a mock that raises exception when accessing run_streamed
        mock_runner = Mock()
        # Make hasattr return True but accessing the attribute raises exception
        type(mock_runner).run_streamed = PropertyMock(side_effect=Exception("Error"))

        with patch("integrations.sdk_token_tracker.Runner", mock_runner):
            result = patch_sdk_for_auto_tracking()

            # Should catch exception and return False
            assert result is False
