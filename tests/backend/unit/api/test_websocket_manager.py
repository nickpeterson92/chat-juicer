"""Tests for WebSocket manager.

Tests WebSocket connection management, message broadcasting, and session isolation.
This replaces the legacy IPC tests with FastAPI WebSocket patterns.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock

import pytest

from api.websocket.manager import WebSocketManager


class TestWebSocketManagerConnection:
    """Tests for WebSocket connection lifecycle."""

    @pytest.mark.asyncio
    async def test_connect_new_session(self) -> None:
        """Test connecting a WebSocket to a new session."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        session_id = "chat_test123"

        await manager.connect(mock_ws, session_id)

        mock_ws.accept.assert_called_once()
        assert session_id in manager.connections
        assert mock_ws in manager.connections[session_id]

    @pytest.mark.asyncio
    async def test_connect_existing_session(self) -> None:
        """Test connecting multiple WebSockets to the same session."""
        manager = WebSocketManager()
        mock_ws1 = Mock()
        mock_ws1.accept = AsyncMock()
        mock_ws2 = Mock()
        mock_ws2.accept = AsyncMock()
        session_id = "chat_test123"

        await manager.connect(mock_ws1, session_id)
        await manager.connect(mock_ws2, session_id)

        assert session_id in manager.connections
        assert mock_ws1 in manager.connections[session_id]
        assert mock_ws2 in manager.connections[session_id]
        assert len(manager.connections[session_id]) == 2

    @pytest.mark.asyncio
    async def test_disconnect_websocket(self) -> None:
        """Test disconnecting a WebSocket from a session."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        session_id = "chat_test123"

        await manager.connect(mock_ws, session_id)
        await manager.disconnect(mock_ws, session_id)

        assert session_id not in manager.connections

    @pytest.mark.asyncio
    async def test_disconnect_one_of_multiple(self) -> None:
        """Test disconnecting one WebSocket when multiple are connected."""
        manager = WebSocketManager()
        mock_ws1 = Mock()
        mock_ws1.accept = AsyncMock()
        mock_ws2 = Mock()
        mock_ws2.accept = AsyncMock()
        session_id = "chat_test123"

        await manager.connect(mock_ws1, session_id)
        await manager.connect(mock_ws2, session_id)
        await manager.disconnect(mock_ws1, session_id)

        assert session_id in manager.connections
        assert mock_ws1 not in manager.connections[session_id]
        assert mock_ws2 in manager.connections[session_id]
        assert len(manager.connections[session_id]) == 1


class TestWebSocketManagerSend:
    """Tests for WebSocket message sending."""

    @pytest.mark.asyncio
    async def test_send_message_to_session(self) -> None:
        """Test sending a message to all connections in a session."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"
        message = {"type": "test", "data": "value"}

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, message)

        mock_ws.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_send_message_to_multiple_connections(self) -> None:
        """Test broadcasting a message to multiple connections."""
        manager = WebSocketManager()
        mock_ws1 = Mock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.send_json = AsyncMock()
        mock_ws2 = Mock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.send_json = AsyncMock()
        session_id = "chat_test123"
        message = {"type": "broadcast", "content": "Hello"}

        await manager.connect(mock_ws1, session_id)
        await manager.connect(mock_ws2, session_id)
        await manager.send(session_id, message)

        mock_ws1.send_json.assert_called_once_with(message)
        mock_ws2.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_send_to_nonexistent_session(self) -> None:
        """Test sending to a session with no connections (should not error)."""
        manager = WebSocketManager()
        session_id = "chat_nonexistent"
        message = {"type": "test", "data": "value"}

        # Should not raise an exception
        await manager.send(session_id, message)

        # No connections should exist
        assert session_id not in manager.connections

    @pytest.mark.asyncio
    async def test_send_handles_disconnection_error(self) -> None:
        """Test that send handles WebSocket disconnection errors gracefully."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock(side_effect=Exception("Connection lost"))
        session_id = "chat_test123"
        message = {"type": "test", "data": "value"}

        await manager.connect(mock_ws, session_id)

        # Should not raise exception, should handle error internally
        await manager.send(session_id, message)

        # WebSocket should be automatically disconnected
        assert session_id not in manager.connections


class TestWebSocketManagerMessageTypes:
    """Tests for different message types matching legacy IPC patterns."""

    @pytest.mark.asyncio
    async def test_send_assistant_start(self) -> None:
        """Test sending assistant start message."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, {"type": "assistant_start"})

        mock_ws.send_json.assert_called_once_with({"type": "assistant_start"})

    @pytest.mark.asyncio
    async def test_send_assistant_end(self) -> None:
        """Test sending assistant end message."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, {"type": "assistant_end"})

        mock_ws.send_json.assert_called_once_with({"type": "assistant_end"})

    @pytest.mark.asyncio
    async def test_send_error_message(self) -> None:
        """Test sending error message."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"
        error_message = {"type": "error", "message": "Something went wrong", "code": "rate_limit"}

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, error_message)

        mock_ws.send_json.assert_called_once_with(error_message)

    @pytest.mark.asyncio
    async def test_send_session_response(self) -> None:
        """Test sending session response message."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"
        response = {"type": "session_response", "data": {"success": True, "session_id": session_id}}

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, response)

        mock_ws.send_json.assert_called_once_with(response)

    @pytest.mark.asyncio
    async def test_send_upload_response(self) -> None:
        """Test sending file upload response."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"
        response = {
            "type": "upload_response",
            "data": {"success": True, "file_path": "/test/file.txt", "size": 1024},
        }

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, response)

        mock_ws.send_json.assert_called_once_with(response)


class TestWebSocketManagerIsolation:
    """Tests for session isolation and concurrent access."""

    @pytest.mark.asyncio
    async def test_session_isolation(self) -> None:
        """Test that messages are isolated to specific sessions."""
        manager = WebSocketManager()
        mock_ws1 = Mock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.send_json = AsyncMock()
        mock_ws2 = Mock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.send_json = AsyncMock()
        session_id1 = "chat_session1"
        session_id2 = "chat_session2"
        message1 = {"type": "test", "data": "session1"}
        message2 = {"type": "test", "data": "session2"}

        await manager.connect(mock_ws1, session_id1)
        await manager.connect(mock_ws2, session_id2)

        await manager.send(session_id1, message1)
        await manager.send(session_id2, message2)

        # Each WebSocket should only receive its session's message
        mock_ws1.send_json.assert_called_once_with(message1)
        mock_ws2.send_json.assert_called_once_with(message2)

    @pytest.mark.asyncio
    async def test_unicode_in_messages(self) -> None:
        """Test handling unicode in messages."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"
        message = {"text": "Hello 世界 مرحبا"}

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, message)

        mock_ws.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_large_data_payload(self) -> None:
        """Test sending large data payload."""
        manager = WebSocketManager()
        mock_ws = Mock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        session_id = "chat_test123"
        large_message = {"data": "x" * 10000}

        await manager.connect(mock_ws, session_id)
        await manager.send(session_id, large_message)

        mock_ws.send_json.assert_called_once_with(large_message)
