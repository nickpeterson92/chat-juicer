"""Unit tests for WebSocket error handling utilities."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from fastapi import WebSocket

from api.websocket.errors import (
    WebSocketErrorHandler,
    WSCloseCode,
    _exception_to_error_code,
    _is_recoverable,
    close_with_error,
    send_ws_error,
    validate_ws_message,
)
from models.error_models import ErrorCode


@pytest.fixture
def mock_websocket() -> MagicMock:
    ws = MagicMock(spec=WebSocket)
    ws.send_json = AsyncMock()
    ws.close = AsyncMock()
    return ws


@pytest.mark.asyncio
async def test_send_ws_error_success(mock_websocket: MagicMock) -> None:
    await send_ws_error(
        mock_websocket,
        code=ErrorCode.INTERNAL_ERROR,
        message="Something went wrong",
        session_id="sess_123",
        recoverable=True,
    )

    mock_websocket.send_json.assert_called_once()
    call_args = mock_websocket.send_json.call_args[0][0]
    assert call_args["code"] == ErrorCode.INTERNAL_ERROR
    assert call_args["message"] == "Something went wrong"


@pytest.mark.asyncio
async def test_send_ws_error_connection_closed(mock_websocket: MagicMock) -> None:
    mock_websocket.send_json.side_effect = RuntimeError("WebSocket disconnected")

    # Should not raise, just log warning
    await send_ws_error(
        mock_websocket,
        code=ErrorCode.INTERNAL_ERROR,
        message="Error",
    )


@pytest.mark.asyncio
async def test_close_with_error(mock_websocket: MagicMock) -> None:
    await close_with_error(
        mock_websocket,
        code=ErrorCode.SESSION_NOT_FOUND,
        message="Session not found",
        session_id="sess_123",
    )

    mock_websocket.send_json.assert_called_once()
    mock_websocket.close.assert_called_once()
    # Check close code
    close_call = mock_websocket.close.call_args
    assert close_call.kwargs["code"] == WSCloseCode.SESSION_NOT_FOUND


@pytest.mark.asyncio
async def test_validate_ws_message_valid(mock_websocket: MagicMock) -> None:
    data = {"type": "message", "content": "Hello"}
    result = await validate_ws_message(mock_websocket, data, ["type", "content"])
    assert result is True
    mock_websocket.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_validate_ws_message_missing_fields(mock_websocket: MagicMock) -> None:
    data = {"type": "message"}
    result = await validate_ws_message(mock_websocket, data, ["type", "content"], session_id="sess_123")
    assert result is False
    mock_websocket.send_json.assert_called_once()


def test_exception_to_error_code_value_error() -> None:
    assert _exception_to_error_code(ValueError("bad")) == ErrorCode.VALIDATION_ERROR


def test_exception_to_error_code_timeout() -> None:
    assert _exception_to_error_code(TimeoutError()) == ErrorCode.WS_TIMEOUT


def test_exception_to_error_code_unknown() -> None:
    assert _exception_to_error_code(Exception("generic")) == ErrorCode.INTERNAL_ERROR


def test_is_recoverable_auth_error() -> None:
    assert _is_recoverable(ErrorCode.AUTH_REQUIRED) is False
    assert _is_recoverable(ErrorCode.AUTH_INVALID_TOKEN) is False


def test_is_recoverable_validation_error() -> None:
    assert _is_recoverable(ErrorCode.VALIDATION_ERROR) is True


@pytest.mark.asyncio
async def test_websocket_error_handler_single_error(mock_websocket: MagicMock) -> None:
    handler = WebSocketErrorHandler(mock_websocket, session_id="sess_123", max_errors=3)

    result = await handler.handle_error(ValueError("test"))

    assert result is True  # Recoverable
    mock_websocket.send_json.assert_called_once()


@pytest.mark.asyncio
async def test_websocket_error_handler_max_errors(mock_websocket: MagicMock) -> None:
    handler = WebSocketErrorHandler(mock_websocket, session_id="sess_123", max_errors=2)

    # First error
    await handler.handle_error(ValueError("e1"))
    # Second error - should trigger close
    result = await handler.handle_error(ValueError("e2"))

    assert result is False  # Should close
    mock_websocket.close.assert_called_once()


def test_websocket_error_handler_reset(mock_websocket: MagicMock) -> None:
    handler = WebSocketErrorHandler(mock_websocket, session_id="sess_123")
    handler._error_count = 5
    handler._first_error_time = 12345.0

    handler.reset_error_count()

    assert handler._error_count == 0
    assert handler._first_error_time is None
