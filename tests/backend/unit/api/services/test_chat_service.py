import json

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, Mock
from uuid import uuid4

import pytest

from api.services.chat_service import ChatService
from api.websocket.manager import WebSocketManager
from api.websocket.task_manager import CancellationToken
from core.constants import MSG_TYPE_FUNCTION_COMPLETED, MSG_TYPE_FUNCTION_EXECUTING
from integrations.mcp_pool import MCPServerPool


@pytest.fixture
def mock_ws_manager() -> Mock:
    manager = Mock(spec=WebSocketManager)
    manager.send = AsyncMock()
    return manager


@pytest.fixture
def mock_file_service() -> Mock:
    service = Mock()
    service.init_session_workspace = Mock()
    service.list_files = AsyncMock(return_value=[])
    return service


@pytest.fixture
def mock_mcp_pool() -> Mock:
    pool = Mock(spec=MCPServerPool)
    pool.get_pool_stats = Mock(return_value={"total": 1, "available": 1})
    pool.acquire_servers = MagicMock()
    # Context manager mock
    cm = AsyncMock()
    cm.__aenter__.return_value = []
    cm.__aexit__.return_value = None
    pool.acquire_servers.return_value = cm
    return pool


@pytest.fixture
def mock_db_pool() -> Mock:
    pool = Mock()
    pool.acquire = MagicMock()
    # Context manager for connection
    conn = AsyncMock()
    cm = AsyncMock()
    cm.__aenter__.return_value = conn
    cm.__aexit__.return_value = None
    pool.acquire.return_value = cm
    return pool


@pytest.fixture
def chat_service(
    mock_db_pool: Mock, mock_ws_manager: Mock, mock_file_service: Mock, mock_mcp_pool: Mock
) -> ChatService:
    return ChatService(
        pool=mock_db_pool,
        ws_manager=mock_ws_manager,
        file_service=mock_file_service,
        mcp_pool=mock_mcp_pool,
    )


@pytest.fixture
def mock_session_file_context() -> AsyncMock:
    """Mock the session_file_context manager."""
    cm = AsyncMock()
    cm.__aenter__.return_value = None
    cm.__aexit__.return_value = None
    return cm


class TestChatService:
    @pytest.mark.asyncio
    async def test_initialization(self, chat_service: ChatService) -> None:
        assert chat_service.pool is not None
        assert chat_service.ws_manager is not None
        assert chat_service.file_service is not None
        assert chat_service.mcp_pool is not None
        assert chat_service._background_tasks == set()

    @pytest.mark.asyncio
    async def test_process_chat_session_not_found(
        self, chat_service: ChatService, mock_db_pool: Mock, mock_ws_manager: Mock
    ) -> None:
        """Test handling when session does not exist."""
        # Setup DB to return None user
        conn = mock_db_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None

        await chat_service.process_chat(
            session_id="nonexistent",
            messages=[{"role": "user", "content": "hi"}],
        )

        mock_ws_manager.send.assert_called_once()
        args = mock_ws_manager.send.call_args[0]
        assert args[0] == "nonexistent"
        assert args[1]["type"] == "error"
        assert args[1]["message"] == "Session not found"

    @pytest.mark.asyncio
    async def test_process_chat_happy_path(
        self,
        chat_service: ChatService,
        mock_db_pool: Mock,
        mock_ws_manager: Mock,
        mock_file_service: Mock,
        mock_mcp_pool: Mock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test successful chat processing flow."""
        # 1. Setup DB Mock
        session_id = "test-session-123"
        session_uuid = uuid4()
        conn = mock_db_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            "id": session_uuid,
            "model": "gpt-4o",
            "reasoning_effort": "medium",
            "mcp_config": None,  # No MCP config
        }

        # 2. Mock Dependency Functions
        monkeypatch.setattr(
            "api.services.chat_service.create_session_aware_tools",
            Mock(return_value=[]),
        )

        # Mock session_file_context
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = None
        mock_ctx.__aexit__.return_value = None
        monkeypatch.setattr("api.services.chat_service.session_file_context", MagicMock(return_value=mock_ctx))

        mock_settings = Mock()
        mock_settings.api_provider = "openai"
        mock_settings.openai_api_key = "test-key"
        monkeypatch.setattr("api.services.chat_service.get_settings", lambda: mock_settings)
        monkeypatch.setattr("api.services.chat_service.create_openai_client", Mock())
        monkeypatch.setattr("api.services.chat_service.create_agent", Mock())

        # Mock PostgresTokenAwareSession
        # Explicitly set methods as AsyncMock to avoid MagicMock issues in await
        mock_session_cls = MagicMock()
        mock_session_instance = MagicMock()  # Base can be MagicMock
        mock_session_instance.load_token_state_from_db = AsyncMock()
        mock_session_instance.should_summarize = AsyncMock(return_value=False)
        mock_session_instance.add_items = AsyncMock()
        mock_session_instance.update_db_token_count = AsyncMock()
        mock_session_instance.summarize_with_agent = AsyncMock()

        mock_session_cls.return_value = mock_session_instance
        monkeypatch.setattr("api.services.chat_service.PostgresTokenAwareSession", mock_session_cls)

        # 3. Mock Agent Runner Stream
        mock_runner = MagicMock()
        monkeypatch.setattr("api.services.chat_service.Runner", mock_runner)

        async def mock_stream_events() -> AsyncGenerator[Any, None]:
            event1 = Mock()
            event1.type = "response.text.delta"
            yield event1
            event2 = Mock()
            event2.type = "response.done"
            yield event2

        mock_stream = AsyncMock()
        mock_stream.stream_events = mock_stream_events
        mock_stream.is_cancelled = Mock(return_value=False)
        mock_runner.run_streamed.return_value = mock_stream

        # 4. Mock Event Handler System
        mock_handlers = {}
        mock_handler_func = Mock(return_value=json.dumps({"type": "assistant_delta", "content": "Hello world"}))
        mock_handlers["response.text.delta"] = mock_handler_func
        monkeypatch.setattr("api.services.chat_service.build_event_handlers", lambda tracker: mock_handlers)

        # 5. Execute
        await chat_service.process_chat(
            session_id=session_id,
            messages=[{"role": "user", "content": "Hello"}],
        )

        # 6. Verifications
        mock_file_service.init_session_workspace.assert_called_with(session_id)

        assert any(
            c[0][1].get("type") == "assistant_start" for c in mock_ws_manager.send.call_args_list
        ), "assistant_start not sent"

        assert any(
            c[0][1].get("type") == "assistant_delta" and c[0][1].get("content") == "Hello world"
            for c in mock_ws_manager.send.call_args_list
        ), "assistant_delta not sent"

        # Verify DB interactions
        assert conn.execute.call_count >= 2

        # Verify assistant_end
        assert any(
            c[0][1].get("type") == "assistant_end" and c[0][1].get("finish_reason") == "stop"
            for c in mock_ws_manager.send.call_args_list
        ), "assistant_end not sent"

    @pytest.mark.asyncio
    async def test_process_chat_db_connection_error(
        self, chat_service: ChatService, mock_db_pool: Mock, mock_ws_manager: Mock
    ) -> None:
        """Test error handling when DB fails."""
        # Setup DB Mock to raise exception on acquire
        mock_db_pool.acquire.side_effect = Exception("DB Connection Failed")

        # In case of acquire error, process_chat catches it in outer try/except?
        # No, wait. process_chat structure:
        # try:
        #    await self._process_chat_inner(...)
        # finally:
        #    cleanup token
        #
        # _process_chat_inner has NO try/except around the db acquire block.
        # Wait, ChatService does NOT wrap _process_chat_inner in a try/except for errors!
        # It only has a finally block.
        # So exception should propagate!

        # Correction: The original code showed:
        # try:
        #     await self._process_chat_inner(...)
        # finally:
        #     self._cancellation_tokens.pop(session_id, None)

        # _process_chat_inner:
        # async with self.pool.acquire() as conn: ...

        # If pool.acquire() fails, it propagates up.
        # Does `process_chat` have an outer exception handler? NO!
        #
        # Wait, let me check the file content again.
        # `async def process_chat(...)`
        # `    try: await self._process_chat_inner(...) finally: ...`
        #
        # `_process_chat_inner(...)`
        # `    async with self.pool.acquire() ...`
        # `    ...`
        # `    try: ... except Exception as exc: logger.error... await ws_manager.send(...)`
        #
        # The inner try/except is INSIDE `_process_chat_inner`, but seemingly wrapping the chat logic AFTER DB setup?
        # Let's check line 195 of ChatService.
        # Yes, `try:` starts at line 195.
        # The DB acquire is at line 105.

        # So if DB acquire fails, it WILL raise Exception out of process_chat.
        # My previous test claimed it sent an error message. That was WRONG based on code analysis.
        # The WebSocket endpoint `_handle_chat_message` catches exceptions and sends error.
        # But `ChatService.process_chat` itself lets it bubble up if it happens before the inner try-block.

        # So I should expect exception here.
        with pytest.raises(Exception, match="DB Connection Failed"):
            await chat_service.process_chat(
                session_id="test-session",
                messages=[{"role": "user", "content": "Hello"}],
            )

    @pytest.mark.asyncio
    async def test_cancellation_during_stream(
        self,
        chat_service: ChatService,
        mock_db_pool: Mock,
        mock_ws_manager: Mock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test cooperative cancellation via CancellationToken."""
        # 1. Setup
        session_id = "test-session-cancel"
        session_uuid = uuid4()
        conn = mock_db_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            "id": session_uuid,
            "model": "gpt-4o",
            "reasoning_effort": "medium",
            "mcp_config": None,
        }

        # Mock dependencies
        monkeypatch.setattr(
            "api.services.chat_service.create_session_aware_tools",
            Mock(return_value=[]),
        )

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = None
        mock_ctx.__aexit__.return_value = None
        monkeypatch.setattr("api.services.chat_service.session_file_context", MagicMock(return_value=mock_ctx))

        monkeypatch.setattr("api.services.chat_service.get_settings", Mock())
        monkeypatch.setattr("api.services.chat_service.create_openai_client", Mock())
        monkeypatch.setattr("api.services.chat_service.create_agent", Mock())

        mock_session_instance = MagicMock()
        mock_session_instance.load_token_state_from_db = AsyncMock()
        mock_session_instance.add_items = AsyncMock()
        mock_session_instance.update_db_token_count = AsyncMock()

        mock_session_cls = MagicMock(return_value=mock_session_instance)
        monkeypatch.setattr("api.services.chat_service.PostgresTokenAwareSession", mock_session_cls)

        monkeypatch.setattr("api.services.chat_service.build_event_handlers", lambda t: {})

        # 2. Setup Runner with a stream that gets CANCELLED
        mock_runner = MagicMock()
        monkeypatch.setattr("api.services.chat_service.Runner", mock_runner)

        # Create a cancel token
        token = CancellationToken()

        async def mock_stream_events() -> AsyncGenerator[Any, None]:
            # First event OK
            yield Mock(type="start")

            # Now trigger cancellation external to the loop
            await token.cancel(reason="User Interrupt")

            # Yield another event - loop should detect cancellation here
            yield Mock(type="middle")

        mock_stream = AsyncMock()
        mock_stream.stream_events = mock_stream_events
        mock_runner.run_streamed.return_value = mock_stream

        # 3. Execute with token
        await chat_service.process_chat(
            session_id=session_id, messages=[{"role": "user", "content": "hi"}], cancellation_token=token
        )

        # 4. Verify Interrupt Handled
        # Should send assistant_end with finish_reason="interrupted"
        sent_messages = [c[0][1] for c in mock_ws_manager.send.call_args_list]

        assert any(
            msg.get("type") == "assistant_end" and msg.get("finish_reason") == "interrupted" for msg in sent_messages
        )

    @pytest.mark.asyncio
    async def test_tool_persistence(
        self,
        chat_service: ChatService,
        mock_db_pool: Mock,
        mock_ws_manager: Mock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that tool calls are persisted to DB."""
        # 1. Setup minimal mocks to reach stream processing
        session_uuid = uuid4()
        conn = mock_db_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            "id": session_uuid,
            "model": "gpt-4o",
            "reasoning_effort": "medium",
            "mcp_config": None,
        }

        monkeypatch.setattr(
            "api.services.chat_service.create_session_aware_tools",
            Mock(return_value=[]),
        )

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = None
        mock_ctx.__aexit__.return_value = None
        monkeypatch.setattr("api.services.chat_service.session_file_context", MagicMock(return_value=mock_ctx))

        mock_session_instance = MagicMock()
        mock_session_instance.load_token_state_from_db = AsyncMock()
        mock_session_instance.add_items = AsyncMock()
        mock_session_instance.update_db_token_count = AsyncMock()
        mock_session_instance.should_summarize = AsyncMock(return_value=False)

        monkeypatch.setattr(
            "api.services.chat_service.PostgresTokenAwareSession", MagicMock(return_value=mock_session_instance)
        )

        # 2. Setup Runner and Handlers to simulate tool execution
        mock_runner = MagicMock()
        monkeypatch.setattr("api.services.chat_service.Runner", mock_runner)

        # We'll simulate 2 events: EXECUTE (start) and COMPLETED (end)
        mock_stream = AsyncMock()
        mock_stream.is_cancelled = Mock(return_value=False)

        async def mock_events() -> AsyncGenerator[Any, None]:
            yield Mock(type="tool_exec")
            yield Mock(type="tool_done")

        mock_stream.stream_events = mock_events
        mock_runner.run_streamed.return_value = mock_stream

        # Mock handlers to convert these events to JSON IPC messages
        mock_handlers = {}

        # Handler for execution start
        exec_json = json.dumps(
            {
                "type": MSG_TYPE_FUNCTION_EXECUTING,
                "tool_call_id": "call_123",
                "tool_name": "test_tool",
                "tool_arguments": {"arg": "val"},
            }
        )
        mock_handlers["tool_exec"] = Mock(return_value=exec_json)

        # Handler for completion
        done_json = json.dumps(
            {
                "type": MSG_TYPE_FUNCTION_COMPLETED,
                "tool_call_id": "call_123",
                "tool_name": "test_tool",
                "tool_result": "Success",
                "tool_success": True,
            }
        )
        mock_handlers["tool_done"] = Mock(return_value=done_json)

        monkeypatch.setattr("api.services.chat_service.build_event_handlers", lambda t: mock_handlers)

        # 3. Execute
        await chat_service.process_chat(
            session_id="session_tool_test",
            messages=[{"role": "user", "content": "use tool"}],
        )

        # 4. Verify Persistence
        # Check that tool call was inserted into messages table
        # We need to find the specific execute call
        found = False
        for call in conn.execute.call_args_list:
            # Look for arguments containing 'Called test_tool'
            if "Called test_tool" in call.args:
                found = True
                break

        # If args matching is tricky, we can just assert generic insert happened or improve matching
        assert found, "Tool call insert not found in database calls"
        # Actually, let's just inspect calls more loosely or assume strict call happened as in previous code
        conn.execute.assert_called()

    @pytest.mark.asyncio
    async def test_interrupt_method(self, chat_service: ChatService) -> None:
        """Test the interrupt() method calls cancellation token."""
        token = MagicMock(spec=CancellationToken)
        token.cancel = AsyncMock()

        session_id = "test_sess"
        chat_service._cancellation_tokens[session_id] = token

        await chat_service.interrupt(session_id)

        token.cancel.assert_called_with(reason="User interrupt")
        chat_service.ws_manager.send.assert_called_with(
            session_id, {"type": "stream_interrupted", "session_id": session_id}
        )
