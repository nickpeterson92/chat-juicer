"""Tests for application runtime module.

Tests runtime operations and event loop handling.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.runtime import (
    ensure_session_exists,
    handle_electron_ipc,
    handle_file_upload,
    handle_streaming_error,
    process_messages,
    refresh_session_agent,
    send_session_created_event,
    update_session_metadata,
)


class TestEnsureSessionExists:
    """Tests for ensure_session_exists function."""

    @pytest.mark.asyncio
    async def test_ensure_session_when_exists(self) -> None:
        """Test ensure_session_exists when session already exists."""
        from app.state import SessionContext

        mock_session = Mock()
        mock_session.session_id = "chat_existing"
        mock_agent = Mock()

        # Create SessionContext
        mock_context = SessionContext(
            session=mock_session,
            agent=mock_agent,
            stream_task=None,
            interrupt_requested=False,
        )

        mock_app_state = Mock()
        mock_app_state.active_sessions = {"chat_existing": mock_context}
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_existing"

        session_ctx, is_new = await ensure_session_exists(mock_app_state, session_id="chat_existing")

        assert session_ctx == mock_context
        assert is_new is False

    @pytest.mark.asyncio
    @patch("app.runtime.create_session_aware_tools")
    @patch("app.runtime.filter_mcp_servers")
    @patch("core.agent.create_agent")  # Imported inside function
    @patch("app.runtime.TokenAwareSQLiteSession")
    @patch("app.runtime.connect_session")
    async def test_ensure_session_creates_new(
        self,
        mock_connect: Mock,
        mock_session_class: Mock,
        mock_create_agent: Mock,
        mock_filter_mcp: Mock,
        mock_create_tools: Mock,
    ) -> None:
        """Test ensure_session_exists creates new session when none exists."""
        from app.state import SessionContext

        mock_app_state = Mock()
        mock_app_state.active_sessions = {}
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = None
        mock_app_state.deployment = "gpt-4o"
        mock_app_state.full_history_store = Mock()
        mock_app_state.mcp_servers = {}

        mock_session_meta = Mock()
        mock_session_meta.session_id = "chat_new123"
        mock_session_meta.mcp_config = []
        mock_app_state.session_manager.create_session.return_value = mock_session_meta

        mock_create_tools.return_value = []
        mock_filter_mcp.return_value = []
        mock_agent = Mock()
        mock_create_agent.return_value = mock_agent
        mock_session_instance = Mock()
        mock_session_instance.session_id = "chat_new123"
        mock_session_instance.get_items = AsyncMock(return_value=[])
        mock_session_instance.total_tokens = 0
        mock_session_instance._calculate_total_tokens.return_value = 0
        mock_session_class.return_value = mock_session_instance

        session_ctx, is_new = await ensure_session_exists(mock_app_state)

        # Should return SessionContext, not TokenAwareSQLiteSession
        assert isinstance(session_ctx, SessionContext)
        assert session_ctx.session == mock_session_instance
        assert session_ctx.agent == mock_agent
        assert is_new is True
        mock_connect.assert_called_once()


class TestProcessMessages:
    """Tests for process_messages function."""

    @pytest.mark.asyncio
    @patch("app.runtime.refresh_session_agent")
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    async def test_process_messages_calls_refresh(
        self,
        mock_ipc: Mock,
        mock_runner: Mock,
        mock_refresh: Mock,
    ) -> None:
        """Ensure process_messages refreshes agent before streaming."""
        from app.state import SessionContext

        mock_app_state = Mock()
        mock_app_state.full_history_store = None

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.should_summarize = AsyncMock(return_value=False)
        mock_session.get_items = AsyncMock(return_value=[])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 0
        mock_session.total_tokens = 0
        mock_session.trigger_tokens = 10000

        mock_context = SessionContext(
            session=mock_session,
            agent=mock_session.agent,
            stream_task=None,
            interrupt_requested=False,
        )

        async def mock_stream() -> AsyncGenerator[Any, None]:
            return
            yield

        mock_result = Mock()
        mock_result.stream_events = mock_stream
        mock_runner.run_streamed.return_value = mock_result

        await process_messages(mock_app_state, mock_context, ["Test input"])

        mock_refresh.assert_called_once_with(mock_app_state, mock_context)
        mock_ipc.send_assistant_start.assert_called_once()
        mock_ipc.send_assistant_end.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    async def test_process_messages_success(self, mock_ipc: Mock, mock_runner: Mock) -> None:
        """Test processing user messages successfully."""
        from app.state import SessionContext

        mock_app_state = Mock()
        mock_app_state.full_history_store = None

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.should_summarize = AsyncMock(return_value=False)
        mock_session.get_items = AsyncMock(return_value=[])
        mock_session.calculate_items_tokens.return_value = 100
        mock_session.accumulated_tool_tokens = 0
        mock_session.total_tokens = 0
        mock_session.trigger_tokens = 10000

        # Create SessionContext
        mock_context = SessionContext(
            session=mock_session,
            agent=mock_session.agent,
            stream_task=None,
            interrupt_requested=False,
        )

        # Create an async generator for stream_events
        async def mock_stream() -> AsyncGenerator[Any, None]:
            return
            yield  # Make this an async generator (unreachable yield)

        mock_result = Mock()
        mock_result.stream_events = mock_stream
        mock_runner.run_streamed.return_value = mock_result

        await process_messages(mock_app_state, mock_context, ["Test input"])

        mock_ipc.send_assistant_start.assert_called_once()
        mock_ipc.send_assistant_end.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.runtime.Runner")
    @patch("app.runtime.IPCManager")
    @patch("app.runtime.handle_streaming_error")
    async def test_process_messages_error(self, mock_handle_error: Mock, mock_ipc: Mock, mock_runner: Mock) -> None:
        """Test processing user messages with error."""
        from app.state import SessionContext

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)
        mock_app_state.full_history_store = None

        mock_session = Mock()
        mock_session.agent = Mock()
        mock_session.session_id = "chat_test"
        mock_session.accumulated_tool_tokens = 0
        mock_session.get_items = AsyncMock(return_value=[])

        # Create SessionContext
        mock_context = SessionContext(
            session=mock_session,
            agent=mock_session.agent,
            stream_task=None,
            interrupt_requested=False,
        )

        # Make Runner.run_streamed raise an exception
        mock_runner.run_streamed.side_effect = Exception("Test error")

        await process_messages(mock_app_state, mock_context, ["Test input"])

        mock_handle_error.assert_called_once()


class TestRefreshSessionAgent:
    """Tests for refresh_session_agent function."""

    @pytest.mark.asyncio
    async def test_refresh_session_agent_updates_references(self) -> None:
        """Ensure agent is rebuilt with files and both references updated."""
        from app.state import SessionContext

        mock_app_state = Mock()
        mock_app_state.deployment = "gpt-4o"
        mock_app_state.mcp_servers = {}

        session_id = "chat_refresh"
        mock_session = Mock()
        mock_session.session_id = session_id
        mock_session.agent = Mock()

        mock_session_ctx = SessionContext(
            session=mock_session,
            agent=mock_session.agent,
            stream_task=None,
            interrupt_requested=False,
        )

        mock_session_meta = Mock()
        mock_session_meta.session_id = session_id
        mock_session_meta.mcp_config = []

        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = mock_session_meta

        new_agent = Mock()

        with (
            patch("app.runtime.create_session_aware_tools", return_value=[]),
            patch("app.runtime.filter_mcp_servers", return_value=[]),
            patch("app.runtime.get_session_files", return_value=["file.txt"]),
            patch("core.agent.create_agent", return_value=new_agent),
        ):
            await refresh_session_agent(mock_app_state, mock_session_ctx)

        assert mock_session_ctx.agent is new_agent
        assert mock_session.agent is new_agent

    @pytest.mark.asyncio
    async def test_refresh_session_agent_handles_file_errors(self) -> None:
        """Falls back gracefully when file listing fails."""
        from app.state import SessionContext

        mock_app_state = Mock()
        mock_app_state.deployment = "gpt-4o"
        mock_app_state.mcp_servers = {}

        session_id = "chat_refresh"
        mock_session = Mock()
        mock_session.session_id = session_id
        mock_session.agent = Mock()

        mock_session_ctx = SessionContext(
            session=mock_session,
            agent=mock_session.agent,
            stream_task=None,
            interrupt_requested=False,
        )

        mock_session_meta = Mock()
        mock_session_meta.session_id = session_id
        mock_session_meta.mcp_config = []

        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = mock_session_meta

        new_agent = Mock()

        with (
            patch("app.runtime.create_session_aware_tools", return_value=[]),
            patch("app.runtime.filter_mcp_servers", return_value=[]),
            patch("app.runtime.get_session_files", side_effect=RuntimeError("boom")),
            patch("core.agent.create_agent", return_value=new_agent),
        ):
            await refresh_session_agent(mock_app_state, mock_session_ctx)

        assert mock_session_ctx.agent is new_agent


class TestHandleElectronIPC:
    """Tests for handle_electron_ipc function."""

    @pytest.mark.asyncio
    async def test_handle_electron_ipc(self) -> None:
        """Test handling Electron IPC events."""
        mock_event = Mock()
        mock_event.type = "test_event"
        mock_tracker = Mock()

        with patch("app.runtime.build_event_handlers") as mock_build:
            mock_handlers = {"test_event": Mock(return_value="__JSON__test__JSON__")}
            mock_build.return_value = mock_handlers

            result = await handle_electron_ipc(mock_event, mock_tracker)

            assert result == "__JSON__test__JSON__"

    @pytest.mark.asyncio
    async def test_handle_electron_ipc_no_handler(self) -> None:
        """Test handling event with no handler."""
        mock_event = Mock()
        mock_event.type = "unknown_event"
        mock_tracker = Mock()

        with patch("app.runtime.build_event_handlers") as mock_build:
            mock_build.return_value = {}

            result = await handle_electron_ipc(mock_event, mock_tracker)

            assert result is None


class TestHandleStreamingError:
    """Tests for handle_streaming_error function."""

    @patch("app.runtime.IPCManager")
    def test_handle_rate_limit_error(self, mock_ipc: Mock) -> None:
        """Test handling rate limit error.

        Note: send_assistant_end is handled by the caller's finally block,
        so we only verify the error message is sent.
        """
        from openai import RateLimitError

        error = RateLimitError("Rate limit exceeded", response=Mock(), body=None)
        handle_streaming_error(error)

        mock_ipc.send.assert_called()

    @patch("app.runtime.IPCManager")
    def test_handle_connection_error(self, mock_ipc: Mock) -> None:
        """Test handling connection error.

        Note: send_assistant_end is handled by the caller's finally block.
        """
        from openai import APIConnectionError

        error = APIConnectionError(request=Mock())
        handle_streaming_error(error)

        mock_ipc.send.assert_called()

    @patch("app.runtime.IPCManager")
    def test_handle_generic_error(self, mock_ipc: Mock) -> None:
        """Test handling generic error.

        Note: send_assistant_end is handled by the caller's finally block.
        """
        error = Exception("Generic error")
        handle_streaming_error(error)

        mock_ipc.send.assert_called()


class TestHandleFileUpload:
    """Tests for handle_file_upload function."""

    @pytest.mark.asyncio
    @patch("app.runtime.ensure_session_exists")
    @patch("app.runtime.save_uploaded_file")
    @patch("app.runtime.IPCManager")
    async def test_handle_file_upload_success(
        self,
        mock_ipc: Mock,
        mock_save_file: Mock,
        mock_ensure_session: AsyncMock,
    ) -> None:
        """Test handling file upload successfully."""
        mock_session = Mock()
        mock_ensure_session.return_value = (mock_session, False)

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_test123"

        mock_save_file.return_value = {
            "success": True,
            "file_path": "/test/file.txt",
            "size": 1024,
            "message": "Saved",
        }

        upload_data = {"filename": "test.txt", "content": list(b"base64data")}  # bytes array to mirror frontend

        result = await handle_file_upload(mock_app_state, upload_data)

        assert result["success"] is True
        mock_save_file.assert_called_once()


class TestUpdateSessionMetadata:
    """Tests for update_session_metadata function."""

    @pytest.mark.asyncio
    async def test_update_session_metadata(self) -> None:
        """Test updating session metadata."""
        mock_session = Mock()
        mock_session.session_id = "chat_test"
        mock_session.accumulated_tool_tokens = 50
        mock_session.get_items = AsyncMock(
            return_value=[
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
            ]
        )

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=True)

        await update_session_metadata(mock_app_state, mock_session)

        mock_app_state.session_manager.update_session.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_session_metadata_with_title_generation(self) -> None:
        """Test updating metadata triggers title generation."""
        mock_session = Mock()
        mock_session.session_id = "chat_test"
        mock_session.accumulated_tool_tokens = 0

        # Create items with enough user messages to trigger naming
        items = []
        for i in range(3):  # SESSION_NAMING_TRIGGER_MESSAGES = 3
            items.append({"role": "user", "content": f"Message {i}"})
            items.append({"role": "assistant", "content": f"Response {i}"})

        mock_session.get_items = AsyncMock(return_value=items)

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(is_named=False)
        mock_app_state.session_manager.generate_session_title = AsyncMock()

        await update_session_metadata(mock_app_state, mock_session)

        # Title generation should be triggered in background
        mock_app_state.session_manager.update_session.assert_called_once()


class TestSendSessionCreatedEvent:
    """Tests for send_session_created_event function."""

    @patch("app.runtime.IPCManager")
    def test_send_session_created_event(self, mock_ipc: Mock) -> None:
        """Test sending session created event with full metadata."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()

        # Mock session with model_dump() method
        mock_session = Mock()
        mock_session.model_dump.return_value = {
            "session_id": "chat_new",
            "title": "New Session",
            "model": "gpt-5",
            "reasoning_effort": "medium",
            "mcp_config": None,
        }
        mock_app_state.session_manager.get_session.return_value = mock_session

        send_session_created_event(mock_app_state, "chat_new")

        mock_ipc.send.assert_called_once()
        call_args = mock_ipc.send.call_args[0][0]

        assert call_args["type"] == "session_created"
        # Session metadata is nested under "session" key
        assert "session" in call_args
        session_data = call_args["session"]
        assert session_data["session_id"] == "chat_new"
        assert session_data["title"] == "New Session"
        assert session_data["model"] == "gpt-5"
        assert session_data["reasoning_effort"] == "medium"

    @patch("app.runtime.IPCManager")
    def test_send_session_created_event_no_session(self, mock_ipc: Mock) -> None:
        """Test sending event when session doesn't exist."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = None

        send_session_created_event(mock_app_state, "chat_nonexistent")

        # Should not send if session not found
        mock_ipc.send.assert_not_called()
