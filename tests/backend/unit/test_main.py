from __future__ import annotations

import asyncio

from collections.abc import Callable
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock

import main
import pytest

from app.state import SessionContext


class _DummyLoop:
    """Minimal event loop shim to stub run_in_executor during tests."""

    def __init__(self, reader: Callable[[], Any]) -> None:
        self._reader = reader

    async def run_in_executor(self, _executor: Any, func: Callable[..., Any]) -> Any:
        # Mimic asyncio.run_in_executor by invoking the provided function.
        # The provided func is main.read_message, which we patch to pop from a queue.
        return func()


def _build_reader(queue: list[Any]) -> Callable[[], Any]:
    """Create a read_message stub that pops from a queue."""

    def _read() -> Any:
        if not queue:
            raise EOFError()
        next_item = queue.pop(0)
        if isinstance(next_item, Exception):
            raise next_item
        return next_item

    return _read


@pytest.mark.asyncio
async def test_main_handles_core_message_types(monkeypatch: pytest.MonkeyPatch) -> None:
    """Main loop should process protocol, session, upload, message, and unknown types then exit."""
    outputs: list[dict[str, Any]] = []
    messages: list[Any] = [
        {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "test"},
        {"type": "session", "command": "list", "params": {}, "request_id": "req-1"},
        {"type": "file_upload", "filename": "demo.txt", "content": [], "encoding": "array", "request_id": "upload-1"},
        {"type": "message", "messages": [{"content": "Hello"}], "session_id": "chat_main"},
        {"type": "interrupt", "session_id": "chat_main"},
        {"type": "unknown"},
        EOFError(),
    ]

    # Patch read_message and event loop executor
    reader = _build_reader(messages)
    monkeypatch.setattr(main, "read_message", reader)
    monkeypatch.setattr(main.asyncio, "get_event_loop", lambda: _DummyLoop(reader))

    # Capture outgoing messages
    def capture(payload: dict[str, Any]) -> None:
        outputs.append(payload)

    monkeypatch.setattr(main, "write_message", capture)

    # Lightweight app_state stub
    app_state = SimpleNamespace(
        pending_read_task=None,
        active_sessions={},
        mcp_servers={},
        _current_session_id=None,
    )
    monkeypatch.setattr(main, "initialize_application", AsyncMock(return_value=app_state))

    # Patch dependencies to no-op
    monkeypatch.setattr(main, "handle_session_command_wrapper", AsyncMock(return_value={"ok": True}))
    monkeypatch.setattr(main, "handle_file_upload", AsyncMock(return_value={"success": True}))
    session_ctx = SessionContext(
        session=SimpleNamespace(session_id="chat_main"),
        agent=Mock(),
        stream_task=None,
        interrupt_requested=False,
    )
    monkeypatch.setattr(main, "ensure_session_exists", AsyncMock(return_value=(session_ctx, False)))
    monkeypatch.setattr(main, "process_messages", AsyncMock(return_value=None))
    monkeypatch.setattr(main, "get_active_stream_count", Mock(return_value=0))
    monkeypatch.setattr(main, "disconnect_session", Mock())
    shutdown_mock = AsyncMock()
    monkeypatch.setattr("tools.code_interpreter.shutdown_sandbox_pool", shutdown_mock)

    await main.main()

    # Validate that each branch emitted an expected response
    types = [msg["type"] for msg in outputs]
    assert "protocol_negotiation_response" in types
    assert "session_response" in types
    assert "upload_response" in types
    # Unknown message should produce an error response
    assert any(msg for msg in outputs if msg["type"] == "error")
    shutdown_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_main_interrupts_active_session(monkeypatch: pytest.MonkeyPatch) -> None:
    """Interrupt messages should cancel an active session stream and exit cleanly."""
    outputs: list[dict[str, Any]] = []
    messages: list[Any] = [
        {"type": "interrupt", "session_id": "chat_interrupt"},
        EOFError(),
    ]

    reader = _build_reader(messages)
    monkeypatch.setattr(main, "read_message", reader)
    monkeypatch.setattr(main.asyncio, "get_event_loop", lambda: _DummyLoop(reader))

    def capture(payload: dict[str, Any]) -> None:
        outputs.append(payload)

    monkeypatch.setattr(main, "write_message", capture)

    # Active session with a running task
    running_task = asyncio.create_task(asyncio.sleep(1))
    session_ctx = SessionContext(
        session=SimpleNamespace(session_id="chat_interrupt"),
        agent=Mock(),
        stream_task=running_task,
        interrupt_requested=False,
    )

    app_state = SimpleNamespace(
        pending_read_task=None,
        active_sessions={"chat_interrupt": session_ctx},
        mcp_servers={},
        _current_session_id=None,
    )

    monkeypatch.setattr(main, "initialize_application", AsyncMock(return_value=app_state))
    monkeypatch.setattr(main, "disconnect_session", Mock())
    shutdown_mock = AsyncMock()
    monkeypatch.setattr("tools.code_interpreter.shutdown_sandbox_pool", shutdown_mock)

    await main.main()

    assert running_task.cancelled()
    shutdown_mock.assert_awaited_once()
    # No errors should be emitted
    assert not any(msg for msg in outputs if msg.get("type") == "error")
