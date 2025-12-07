"""Tests for stream interrupt feature in runtime.py.

Tests the cancellation state tracking logic, deferred cancellation during tool execution,
and conditional persistence based on tools_completed flag.
"""

from __future__ import annotations

import asyncio

from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.runtime import process_messages


class MockEvent:
    """Mock streaming event for testing."""

    def __init__(self, event_type: str, item_type: str | None = None, item_name: str | None = None) -> None:
        self.type = event_type
        if item_type:
            self.item = Mock()
            self.item.type = item_type
            self.item.name = item_name


async def mock_stream_with_events(events: list[MockEvent]) -> Any:
    """Generate mock streaming events."""
    for event in events:
        yield event


class TestStreamInterrupt:
    """Tests for stream interrupt feature."""

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    async def test_cancel_during_token_streaming(self, mock_ipc: Mock, mock_runner: Mock) -> None:
        """Test cancellation during token streaming causes immediate stop."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.interrupt_requested = True  # Set by main.py before cancel

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 0
        mock_session.total_tokens = 0

        # Simulate cancellation during streaming
        async def mock_stream_with_cancel() -> Any:
            yield MockEvent("raw_response_event")
            yield MockEvent("raw_response_event")
            raise asyncio.CancelledError("User cancelled")

        mock_result = Mock()
        mock_result.stream_events = mock_stream_with_cancel
        mock_runner.run_streamed.return_value = mock_result

        # Expect CancelledError to be re-raised
        with pytest.raises(asyncio.CancelledError):
            await process_messages(mock_app_state, mock_session, ["Test input"])

        # Note: When interrupt_requested is True, process_messages skips assistant_end
        # main.py handles sending it to avoid duplicates
        mock_ipc.send_assistant_end.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    @patch("app.runtime.handle_electron_ipc")
    async def test_cancel_during_tool_execution_deferred(
        self, mock_handle_ipc: AsyncMock, mock_ipc: Mock, mock_runner: Mock
    ) -> None:
        """Test cancellation during tool execution is deferred until tool completes."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 50
        mock_session.total_tokens = 0

        # Mock IPC handler to return None (no IPC messages)
        mock_handle_ipc.return_value = None

        # Simulate tool execution then cancellation
        async def mock_stream_with_tool_cancel() -> Any:
            # Tool starts
            yield MockEvent("run_item_stream_event", "tool_call_item", "test_tool")
            # Tool completes (cancel should be deferred until here)
            yield MockEvent("run_item_stream_event", "tool_call_output_item")
            # Cancellation is raised AFTER tool completes
            raise asyncio.CancelledError("User cancelled")

        mock_result = Mock()
        mock_result.stream_events = mock_stream_with_tool_cancel
        mock_runner.run_streamed.return_value = mock_result

        # Expect CancelledError to be re-raised
        with pytest.raises(asyncio.CancelledError):
            await process_messages(mock_app_state, mock_session, ["Test input"])

        # Note: stream_interrupted is sent by main.py, not process_messages
        # Verify session metadata was updated (tools completed)
        mock_app_state.session_manager.update_session.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    @patch("app.runtime.handle_electron_ipc")
    async def test_cancel_with_tools_completed_persists(
        self, mock_handle_ipc: AsyncMock, mock_ipc: Mock, mock_runner: Mock
    ) -> None:
        """Test that session is persisted when tools completed before cancel."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[{"role": "user", "content": "Test"}])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 25
        mock_session.total_tokens = 0

        mock_handle_ipc.return_value = None

        # Simulate tool completion then cancel
        async def mock_stream_with_completed_tools() -> Any:
            yield MockEvent("run_item_stream_event", "tool_call_item", "read_file")
            yield MockEvent("run_item_stream_event", "tool_call_output_item")
            # Tool completed, now cancel
            raise asyncio.CancelledError("User cancelled")

        mock_result = Mock()
        mock_result.stream_events = mock_stream_with_completed_tools
        mock_runner.run_streamed.return_value = mock_result

        with pytest.raises(asyncio.CancelledError):
            await process_messages(mock_app_state, mock_session, ["Test"])

        # Verify persistence occurred (tools_completed = True)
        mock_app_state.session_manager.update_session.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    async def test_cancel_without_tools_skips_persistence(self, mock_ipc: Mock, mock_runner: Mock) -> None:
        """Test that session is not persisted when cancelled with no tools."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.session_manager = Mock()

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 0
        mock_session.total_tokens = 0

        # Simulate cancel during token streaming (no tools)
        async def mock_stream_no_tools() -> Any:
            yield MockEvent("raw_response_event")
            raise asyncio.CancelledError("User cancelled")

        mock_result = Mock()
        mock_result.stream_events = mock_stream_no_tools
        mock_runner.run_streamed.return_value = mock_result

        with pytest.raises(asyncio.CancelledError):
            await process_messages(mock_app_state, mock_session, ["Test"])

        # Persistence should be skipped (cancel_requested=True, tools_completed=False)
        mock_app_state.session_manager.update_session.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    async def test_cancel_after_completion_noop(self, mock_ipc: Mock, mock_runner: Mock) -> None:
        """Test that cancel after stream completion is a no-op."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[{"role": "user", "content": "Test"}])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 0
        mock_session.total_tokens = 0
        mock_session.trigger_tokens = 10000  # Add trigger_tokens for division
        mock_session.should_summarize = AsyncMock(return_value=False)

        # Normal completion without cancel
        async def mock_stream_complete() -> Any:
            yield MockEvent("run_item_stream_event", "message_output_item")

        mock_result = Mock()
        mock_result.stream_events = mock_stream_complete
        mock_runner.run_streamed.return_value = mock_result

        # Should complete normally
        await process_messages(mock_app_state, mock_session, ["Test"])

        # Verify no stream_interrupted was sent
        calls = [call[0][0] for call in mock_ipc.send.call_args_list if call[0]]
        assert not any(msg.get("type") == "stream_interrupted" for msg in calls if isinstance(msg, dict))

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    @patch("app.runtime.handle_electron_ipc")
    async def test_cancel_flag_propagates_to_break(
        self, mock_handle_ipc: AsyncMock, mock_ipc: Mock, mock_runner: Mock
    ) -> None:
        """Test that cancel_requested flag causes loop to break at safe points."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.interrupt_requested = True  # Set by main.py before cancel

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 0
        mock_session.total_tokens = 0

        mock_handle_ipc.return_value = None

        # Simulate cancel flag being set, then check for immediate break
        async def mock_stream_with_flag() -> Any:
            # Cancel happens here
            raise asyncio.CancelledError("User cancelled")
            yield  # type: ignore[unreachable]  # Required to make this an async generator

        mock_result = Mock()
        mock_result.stream_events = lambda: mock_stream_with_flag()  # Return generator when called
        mock_runner.run_streamed.return_value = mock_result

        with pytest.raises(asyncio.CancelledError):
            await process_messages(mock_app_state, mock_session, ["Test"])

        # When interrupt_requested is True, process_messages skips assistant_end
        # main.py handles sending it to avoid duplicates
        mock_ipc.send_assistant_end.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    @patch("app.runtime.handle_electron_ipc")
    async def test_multiple_tools_with_cancel_between(
        self, mock_handle_ipc: AsyncMock, mock_ipc: Mock, mock_runner: Mock
    ) -> None:
        """Test cancellation between multiple tools persists completed tools."""
        mock_app_state = Mock()
        mock_app_state.full_history_store = None
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.get_items = AsyncMock(return_value=[{"role": "user", "content": "Test"}])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 75
        mock_session.total_tokens = 0

        mock_handle_ipc.return_value = None

        # Simulate multiple tools, cancel between them
        async def mock_stream_multi_tool() -> Any:
            # First tool
            yield MockEvent("run_item_stream_event", "tool_call_item", "read_file")
            yield MockEvent("run_item_stream_event", "tool_call_output_item")
            # Between tools - cancel here
            raise asyncio.CancelledError("User cancelled")
            # Second tool would have started but doesn't
            yield MockEvent("run_item_stream_event", "tool_call_item", "write_file")  # type: ignore[unreachable]

        mock_result = Mock()
        mock_result.stream_events = mock_stream_multi_tool
        mock_runner.run_streamed.return_value = mock_result

        with pytest.raises(asyncio.CancelledError):
            await process_messages(mock_app_state, mock_session, ["Test"])

        # Verify first tool's results were persisted
        mock_app_state.session_manager.update_session.assert_called_once()
