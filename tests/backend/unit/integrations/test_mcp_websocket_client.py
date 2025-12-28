"""Tests for WebSocket MCP Client.

Tests the WebSocket transport client for containerized MCP servers.
"""

from __future__ import annotations

import asyncio
import contextlib
import json

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from integrations.mcp_websocket_client import WebSocketMCPClient
from models.mcp_models import MCPResult, MCPTool


class TestWebSocketMCPClientInit:
    """Tests for WebSocketMCPClient initialization."""

    def test_client_initialization(self) -> None:
        """Test client initializes with correct attributes."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        assert client.ws_url == "ws://localhost:8081/ws"
        assert client.server_name == "Test Server"
        assert client.name == "Test Server"  # SDK compatibility
        assert client.use_structured_content is True
        assert client._ws is None
        assert client._msg_id == 0
        assert client._initialized is False
        assert client._pending_requests == {}
        assert client._listen_task is None


class TestWebSocketMCPClientConnection:
    """Tests for connection lifecycle methods."""

    @pytest.mark.asyncio
    async def test_connect_success(self) -> None:
        """Test successful connection and initialization."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()
        mock_ws.close = AsyncMock()

        # Simulate server responses
        async def mock_iter() -> AsyncGenerator[str, None]:
            # Initial handshake response
            yield json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"serverInfo": {"name": "test"}}})
            # Keep alive until cancelled
            while True:
                await asyncio.sleep(1)

        mock_ws.__aiter__ = lambda self: mock_iter()

        with patch("websockets.connect", AsyncMock(return_value=mock_ws)):
            result = await client.__aenter__()

            assert result is client
            assert client._initialized is True
            assert client._ws is mock_ws
            assert client._listen_task is not None

        # Cleanup
        await client.__aexit__(None, None, None)

    @pytest.mark.asyncio
    async def test_connect_failure(self) -> None:
        """Test connection failure cleanup."""
        client = WebSocketMCPClient(ws_url="ws://localhost:9999/ws", server_name="Failing Server")

        with patch("websockets.connect", AsyncMock(side_effect=Exception("Connection refused"))):
            with pytest.raises(Exception, match="Connection refused"):
                await client.__aenter__()

            assert client._initialized is False
            assert client._ws is None

    @pytest.mark.asyncio
    async def test_cleanup(self) -> None:
        """Test cleanup cancels tasks and closes connection."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        mock_ws = AsyncMock()
        mock_ws.close = AsyncMock()
        client._ws = mock_ws
        client._initialized = True

        # Create a mock listen task
        client._listen_task = asyncio.create_task(asyncio.sleep(10))

        # Add pending request
        future: asyncio.Future[dict[str, Any]] = asyncio.Future()
        client._pending_requests[1] = future

        await client._cleanup()

        assert client._initialized is False
        assert client._listen_task is None
        assert len(client._pending_requests) == 0
        mock_ws.close.assert_called_once()


class TestWebSocketMCPClientMessaging:
    """Tests for MCP messaging methods."""

    def test_next_id(self) -> None:
        """Test message ID generation."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        assert client._next_id() == 1
        assert client._next_id() == 2
        assert client._next_id() == 3

    @pytest.mark.asyncio
    async def test_send_request_not_connected(self) -> None:
        """Test sending request without connection raises error."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        with pytest.raises(RuntimeError, match="WebSocket not connected"):
            await client._send_request("test", {}, timeout=5.0)

    @pytest.mark.asyncio
    async def test_send_request_timeout(self) -> None:
        """Test request timeout handling."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()
        client._ws = mock_ws

        # Don't resolve the future - let it timeout
        with pytest.raises(RuntimeError, match="timed out"):
            await client._send_request("test", {}, timeout=0.1)

        # Pending request should be cleaned up
        assert len(client._pending_requests) == 0


class TestWebSocketMCPClientTools:
    """Tests for tool listing and calling."""

    @pytest.mark.asyncio
    async def test_list_tools_not_initialized(self) -> None:
        """Test list_tools raises error when not initialized."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        with pytest.raises(RuntimeError, match="Client not initialized"):
            await client.list_tools()

    @pytest.mark.asyncio
    async def test_list_tools_success(self) -> None:
        """Test successful tool listing."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")
        client._initialized = True

        mock_response = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "tools": [
                    {"name": "tool1", "description": "First tool", "inputSchema": {}},
                    {"name": "tool2", "description": "Second tool", "inputSchema": {"type": "object"}},
                ]
            },
        }

        with patch.object(client, "_send_request", AsyncMock(return_value=mock_response)):
            tools = await client.list_tools()

            assert len(tools) == 2
            assert all(isinstance(t, MCPTool) for t in tools)
            assert tools[0].name == "tool1"
            assert tools[1].name == "tool2"

    @pytest.mark.asyncio
    async def test_call_tool_not_initialized(self) -> None:
        """Test call_tool raises error when not initialized."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        with pytest.raises(RuntimeError, match="Client not initialized"):
            await client.call_tool("test_tool", {})

    @pytest.mark.asyncio
    async def test_call_tool_success(self) -> None:
        """Test successful tool call."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")
        client._initialized = True

        mock_response = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"content": [{"type": "text", "text": "Hello, World!"}], "isError": False},
        }

        with patch.object(client, "_send_request", AsyncMock(return_value=mock_response)):
            result = await client.call_tool("greet", {"name": "World"})

            assert isinstance(result, MCPResult)
            assert result.isError is False
            assert len(result.content) == 1


class TestWebSocketMCPClientListenLoop:
    """Tests for the background listener loop."""

    @pytest.mark.asyncio
    async def test_listen_loop_handles_response(self) -> None:
        """Test listener loop dispatches responses to pending requests."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        # Create a future for the pending request
        future: asyncio.Future[dict[str, Any]] = asyncio.Future()
        client._pending_requests[1] = future

        # Mock WebSocket that yields a response
        async def mock_messages() -> AsyncGenerator[str, None]:
            yield json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"data": "test"}})

        mock_ws = MagicMock()
        mock_ws.__aiter__ = lambda self: mock_messages()
        client._ws = mock_ws

        # Run listen loop in background
        listen_task = asyncio.create_task(client._listen_loop())

        # Wait for response to be dispatched
        result = await asyncio.wait_for(future, timeout=1.0)

        assert result == {"jsonrpc": "2.0", "id": 1, "result": {"data": "test"}}

        # Cleanup - task may already be done if generator exhausted
        listen_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listen_task

    @pytest.mark.asyncio
    async def test_listen_loop_handles_error_response(self) -> None:
        """Test listener loop handles error responses."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        # Create a future for the pending request
        future: asyncio.Future[dict[str, Any]] = asyncio.Future()
        client._pending_requests[1] = future

        # Mock WebSocket that yields an error response
        async def mock_messages() -> AsyncGenerator[str, None]:
            yield json.dumps({"jsonrpc": "2.0", "id": 1, "error": {"code": -32600, "message": "Invalid Request"}})

        mock_ws = MagicMock()
        mock_ws.__aiter__ = lambda self: mock_messages()
        client._ws = mock_ws

        # Run listen loop in background
        listen_task = asyncio.create_task(client._listen_loop())

        # Wait for error to be dispatched
        with pytest.raises(RuntimeError, match="MCP error"):
            await asyncio.wait_for(future, timeout=1.0)

        # Cleanup - task may already be done if generator exhausted
        listen_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listen_task

    @pytest.mark.asyncio
    async def test_listen_loop_handles_invalid_json(self) -> None:
        """Test listener loop handles invalid JSON gracefully."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        # Mock WebSocket that yields invalid JSON
        async def mock_messages() -> AsyncGenerator[str, None]:
            yield "not valid json"
            yield json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}})

        mock_ws = MagicMock()
        mock_ws.__aiter__ = lambda self: mock_messages()
        client._ws = mock_ws

        future: asyncio.Future[dict[str, Any]] = asyncio.Future()
        client._pending_requests[1] = future

        listen_task = asyncio.create_task(client._listen_loop())

        # Should still receive valid message
        result = await asyncio.wait_for(future, timeout=1.0)
        assert result == {"jsonrpc": "2.0", "id": 1, "result": {}}

        # Cleanup - task may already be done if generator exhausted
        listen_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listen_task

    @pytest.mark.asyncio
    async def test_listen_loop_no_websocket(self) -> None:
        """Test listen loop returns immediately if no WebSocket."""
        client = WebSocketMCPClient(ws_url="ws://localhost:8081/ws", server_name="Test Server")
        client._ws = None

        # Should complete immediately without error
        await client._listen_loop()
