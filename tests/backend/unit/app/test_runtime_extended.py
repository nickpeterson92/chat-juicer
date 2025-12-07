"""Extended tests for runtime module to increase coverage.

This module covers missing branches and edge cases not covered in test_runtime.py.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.runtime import (
    handle_file_upload,
    handle_session_command_wrapper,
    handle_streaming_error,
    process_user_input,
    save_tool_call_to_history,
)


class TestHandleStreamingErrorExtended:
    """Extended tests for handle_streaming_error function."""

    @patch("app.runtime.IPCManager")
    def test_handle_api_status_error(self, mock_ipc: Mock) -> None:
        """Test handling API status error."""
        from openai import APIStatusError

        # Create a mock response with proper status_code
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.headers = {}

        error = APIStatusError(
            message="Server error",
            response=mock_response,
            body=None,
        )
        handle_streaming_error(error)

        # Should call IPCManager.send with error message
        mock_ipc.send.assert_called_once()
        call_args = mock_ipc.send.call_args[0][0]
        assert call_args["type"] == "error"
        assert "500" in call_args["message"]

        # Should close the stream
        mock_ipc.send_assistant_end.assert_called_once()


class TestProcessUserInputExtended:
    """Extended tests for process_user_input function."""

    @pytest.mark.asyncio
    @patch("app.runtime.IPCManager")
    @patch("app.runtime.handle_streaming_error")
    async def test_process_user_input_persistence_error(
        self,
        mock_handle_error: Mock,
        mock_ipc: Mock,
    ) -> None:
        """Test processing user input with persistence error."""
        from core.session import PersistenceError

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.accumulated_tool_tokens = 0
        mock_session.get_items = AsyncMock(return_value=[])

        # Raise persistence error during run
        mock_session.run_with_auto_summary = AsyncMock(side_effect=PersistenceError("Layer 2 write failed"))

        await process_user_input(mock_app_state, mock_session, "Test input")

        # Should send error message to UI (exactly one call for persistence error)
        assert mock_ipc.send.call_count == 1  # Only the error message
        error_call = mock_ipc.send.call_args[0][0]
        assert error_call["type"] == "error"
        assert "persist" in error_call["message"].lower()

        # Should send assistant_end
        mock_ipc.send_assistant_end.assert_called_once()

        # Should NOT call generic error handler for persistence errors
        mock_handle_error.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.runtime.IPCManager")
    async def test_process_user_input_with_response_text(self, mock_ipc: Mock) -> None:
        """Test processing user input with response text logging."""
        mock_app_state = Mock()
        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.should_summarize = AsyncMock(return_value=False)
        mock_session.accumulated_tool_tokens = 50
        mock_session.trigger_tokens = 10000
        mock_session.total_tokens = 0

        # Mock items for token calculation
        mock_items = [
            {"role": "user", "content": "Test"},
            {"role": "assistant", "content": "Response"},
        ]
        mock_session.get_items = AsyncMock(return_value=mock_items)
        mock_session.calculate_items_tokens.return_value = 100

        # Create event with response text
        mock_event = Mock()
        mock_event.type = "run_item_stream_event"
        mock_event.item = Mock()
        mock_event.item.type = "message_output"
        mock_event.item.raw_item = Mock()

        # Create content with text
        mock_content = Mock()
        mock_content.text = "This is the assistant response"
        mock_event.item.raw_item.content = [mock_content]

        # Create an async generator that yields events
        async def mock_stream() -> AsyncGenerator[Any, None]:
            yield mock_event

        mock_result = Mock()
        mock_result.stream_events = mock_stream
        mock_session.run_with_auto_summary = AsyncMock(return_value=mock_result)

        with patch("app.runtime.handle_electron_ipc") as mock_handle_ipc:
            mock_handle_ipc.return_value = None

            await process_user_input(mock_app_state, mock_session, "Test input")

        # Should process the message and log response
        mock_ipc.send_assistant_start.assert_called_once()
        mock_ipc.send_assistant_end.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.runtime.IPCManager")
    async def test_process_user_input_triggers_summarization(self, mock_ipc: Mock) -> None:
        """Test that post-run summarization is triggered when needed."""
        mock_app_state = Mock()
        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.accumulated_tool_tokens = 100
        mock_session.trigger_tokens = 10000
        mock_session.total_tokens = 9500  # Will be over threshold after tool tokens

        # Mock should_summarize to return True
        mock_session.should_summarize = AsyncMock(return_value=True)
        mock_session.summarize_with_agent = AsyncMock()

        mock_items = [{"role": "user", "content": "Test"}]
        mock_session.get_items = AsyncMock(return_value=mock_items)
        mock_session.calculate_items_tokens.return_value = 9500

        # Create empty stream
        async def mock_stream() -> AsyncGenerator[Any, None]:
            return
            yield  # Make this an async generator (unreachable)

        mock_result = Mock()
        mock_result.stream_events = mock_stream
        mock_session.run_with_auto_summary = AsyncMock(return_value=mock_result)

        await process_user_input(mock_app_state, mock_session, "Test input")

        # Should trigger summarization
        mock_session.should_summarize.assert_called_once()
        mock_session.summarize_with_agent.assert_called_once()


class TestHandleSessionCommandWrapper:
    """Tests for handle_session_command_wrapper function."""

    @pytest.mark.asyncio
    @patch("app.runtime.handle_session_command")
    async def test_handle_session_command_wrapper(self, mock_handle_command: AsyncMock) -> None:
        """Test session command wrapper delegates to handler."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()

        expected_result = {"success": True, "session_id": "chat_new"}
        mock_handle_command.return_value = expected_result

        result = await handle_session_command_wrapper(
            mock_app_state,
            "create_session",
            {"title": "New Session"},
        )

        assert result == expected_result
        mock_handle_command.assert_called_once_with(
            mock_app_state,
            "create_session",
            {"title": "New Session"},
        )


class TestHandleFileUploadExtended:
    """Extended tests for handle_file_upload function."""

    @pytest.mark.asyncio
    @patch("app.runtime.ensure_session_exists")
    @patch("app.runtime.save_uploaded_file")
    @patch("app.runtime.IPCManager")
    async def test_handle_file_upload_new_session(
        self,
        mock_ipc: Mock,
        mock_save_file: Mock,
        mock_ensure_session: AsyncMock,
    ) -> None:
        """Test handling file upload creates new session and sends event."""
        mock_session = Mock()
        mock_ensure_session.return_value = (mock_session, True)  # is_new = True

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_new123"

        # Mock session metadata
        mock_session_meta = Mock()
        mock_session_meta.session_id = "chat_new123"
        mock_session_meta.title = "New Session"
        mock_session_meta.model_dump.return_value = {
            "session_id": "chat_new123",
            "title": "New Session",
        }
        mock_app_state.session_manager.get_session.return_value = mock_session_meta

        mock_save_file.return_value = {
            "success": True,
            "file_path": "/test/file.txt",
            "size": 1024,
            "message": "Saved",
        }

        upload_data = {"filename": "test.txt", "content": list(b"base64data")}  # bytes array to mirror frontend

        result = await handle_file_upload(mock_app_state, upload_data)

        assert result["success"] is True

        # Should send session_created event for new session
        session_created_calls = [
            call for call in mock_ipc.send.call_args_list if call[0][0].get("type") == "session_created"
        ]
        assert len(session_created_calls) == 1

    @pytest.mark.asyncio
    @patch("app.runtime.ensure_session_exists")
    @patch("app.runtime.save_uploaded_file")
    async def test_handle_file_upload_existing_session(
        self,
        mock_save_file: Mock,
        mock_ensure_session: AsyncMock,
    ) -> None:
        """Test handling file upload with existing session doesn't send event."""
        mock_session = Mock()
        mock_ensure_session.return_value = (mock_session, False)  # is_new = False

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_existing"

        mock_save_file.return_value = {
            "success": True,
            "file_path": "/test/file.txt",
            "size": 1024,
            "message": "Saved",
        }

        upload_data = {"filename": "test.txt", "content": list(b"base64data")}  # bytes array to mirror frontend

        with patch("app.runtime.IPCManager") as mock_ipc:
            result = await handle_file_upload(mock_app_state, upload_data)

            assert result["success"] is True

            # Should NOT send session_created for existing session
            assert mock_ipc.send.call_count == 0


class TestSaveToolCallToHistory:
    """Tests for save_tool_call_to_history function."""

    def test_save_function_executing_with_arguments(self) -> None:
        """Test saving function_executing event (with complete arguments) to Layer 2.

        This verifies the fix for args being lost on session reload.
        function_executing is saved instead of function_detected because:
        - function_detected has empty args "{}" (early detection)
        - function_executing has complete args (when tool is about to run)
        """
        import json

        mock_full_history = Mock()
        mock_app_state = Mock()
        mock_app_state.full_history_store = mock_full_history

        mock_session = Mock()
        mock_session.session_id = "chat_test123"

        # IPC message with function_executing type (complete arguments)
        ipc_msg = json.dumps(
            {
                "type": "function_executing",
                "name": "generate_document",
                "call_id": "call_abc123",
                "arguments": '{"template": "report.md", "output_path": "/docs/report.md"}',
            }
        )

        save_tool_call_to_history(mock_app_state, mock_session, ipc_msg)

        # Should save with complete arguments
        mock_full_history.save_message.assert_called_once()
        saved_msg = mock_full_history.save_message.call_args[0][1]

        assert saved_msg["role"] == "tool_call"
        assert saved_msg["name"] == "generate_document"
        assert saved_msg["call_id"] == "call_abc123"
        assert saved_msg["arguments"] == '{"template": "report.md", "output_path": "/docs/report.md"}'
        assert saved_msg["status"] == "detected"  # For frontend merge compatibility

    def test_save_function_completed_with_result(self) -> None:
        """Test saving function_completed event to Layer 2."""
        import json

        mock_full_history = Mock()
        mock_app_state = Mock()
        mock_app_state.full_history_store = mock_full_history

        mock_session = Mock()
        mock_session.session_id = "chat_test123"

        # IPC message with function_completed type
        ipc_msg = json.dumps(
            {
                "type": "function_completed",
                "name": "generate_document",
                "call_id": "call_abc123",
                "result": "Document generated successfully at /docs/report.md",
                "success": True,
            }
        )

        save_tool_call_to_history(mock_app_state, mock_session, ipc_msg)

        # Should save with result
        mock_full_history.save_message.assert_called_once()
        saved_msg = mock_full_history.save_message.call_args[0][1]

        assert saved_msg["role"] == "tool_call"
        assert saved_msg["name"] == "generate_document"
        assert saved_msg["call_id"] == "call_abc123"
        assert saved_msg["result"] == "Document generated successfully at /docs/report.md"
        assert saved_msg["status"] == "completed"
        assert saved_msg["success"] is True

    def test_ignores_function_detected(self) -> None:
        """Test that function_detected (early detection with empty args) is ignored.

        function_detected has empty args "{}" so we don't save it.
        We wait for function_executing which has complete args.
        """
        import json

        mock_full_history = Mock()
        mock_app_state = Mock()
        mock_app_state.full_history_store = mock_full_history

        mock_session = Mock()
        mock_session.session_id = "chat_test123"

        # IPC message with function_detected type (empty args)
        ipc_msg = json.dumps(
            {
                "type": "function_detected",
                "name": "generate_document",
                "call_id": "call_abc123",
                "arguments": "{}",  # Empty from early detection
            }
        )

        save_tool_call_to_history(mock_app_state, mock_session, ipc_msg)

        # Should NOT save function_detected
        mock_full_history.save_message.assert_not_called()

    def test_no_full_history_store(self) -> None:
        """Test graceful handling when full_history_store is None."""
        import json

        mock_app_state = Mock()
        mock_app_state.full_history_store = None

        mock_session = Mock()
        mock_session.session_id = "chat_test123"

        ipc_msg = json.dumps(
            {
                "type": "function_executing",
                "name": "test_tool",
                "call_id": "call_123",
                "arguments": "{}",
            }
        )

        # Should not raise, just return early
        save_tool_call_to_history(mock_app_state, mock_session, ipc_msg)
