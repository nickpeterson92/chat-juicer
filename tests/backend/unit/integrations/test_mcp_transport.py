# ruff: noqa: SIM117
"""Tests for MCP transport abstraction layer.

Tests WebSocket transport implementation.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from integrations.mcp_transport import MCPTransport, WebSocketTransport, create_transport


class TestMCPTransportABC:
    """Tests for abstract base class."""

    def test_mcp_transport_is_abstract(self) -> None:
        """Test that MCPTransport cannot be instantiated directly."""
        with pytest.raises(TypeError, match="abstract"):
            MCPTransport()


class TestWebSocketTransport:
    """Tests for WebSocketTransport class."""

    def test_initialization(self) -> None:
        """Test WebSocket transport initialization."""
        transport = WebSocketTransport(ws_url="ws://localhost:8081/ws", server_name="Test Server")
        assert transport.ws_url == "ws://localhost:8081/ws"
        assert transport.server_name == "Test Server"
        assert transport._client is None

    @pytest.mark.asyncio
    async def test_connect_success(self) -> None:
        """Test successful WebSocket connection."""
        transport = WebSocketTransport(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)

        with patch("integrations.mcp_transport.WebSocketMCPClient", return_value=mock_client):
            result = await transport.connect()
            assert result == mock_client
            assert transport._client == mock_client
            mock_client.__aenter__.assert_called_once()

    @pytest.mark.asyncio
    async def test_connect_failure(self) -> None:
        """Test connection failure raises RuntimeError."""
        transport = WebSocketTransport(ws_url="ws://localhost:9999/ws", server_name="Failing Server")

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(side_effect=Exception("Connection refused"))

        with patch("integrations.mcp_transport.WebSocketMCPClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="Cannot connect to Failing Server"):
                await transport.connect()

    @pytest.mark.asyncio
    async def test_disconnect_with_client(self) -> None:
        """Test disconnecting when client exists."""
        transport = WebSocketTransport(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        mock_client = AsyncMock()
        mock_client.__aexit__ = AsyncMock()
        transport._client = mock_client

        await transport.disconnect()

        mock_client.__aexit__.assert_called_once_with(None, None, None)
        assert transport._client is None

    @pytest.mark.asyncio
    async def test_disconnect_without_client(self) -> None:
        """Test disconnecting when no client exists."""
        transport = WebSocketTransport(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        # Should not raise
        await transport.disconnect()
        assert transport._client is None

    @pytest.mark.asyncio
    async def test_disconnect_with_error(self) -> None:
        """Test disconnect handles errors gracefully."""
        transport = WebSocketTransport(ws_url="ws://localhost:8081/ws", server_name="Test Server")

        mock_client = AsyncMock()
        mock_client.__aexit__ = AsyncMock(side_effect=Exception("Disconnect failed"))
        transport._client = mock_client

        # Should not raise, just log warning
        await transport.disconnect()
        assert transport._client is None


class TestCreateTransport:
    """Tests for create_transport factory function."""

    @pytest.mark.asyncio
    async def test_create_websocket_transport(self) -> None:
        """Test creating WebSocket transport."""
        config = {
            "name": "Test Server",
            "transport": "websocket",
            "url": "ws://localhost:8081/ws",
        }

        transport = await create_transport(config)

        assert isinstance(transport, WebSocketTransport)
        assert transport.ws_url == "ws://localhost:8081/ws"
        assert transport.server_name == "Test Server"

    @pytest.mark.asyncio
    async def test_create_websocket_transport_default(self) -> None:
        """Test creating transport defaults to websocket."""
        config = {
            "name": "Test Server",
            "url": "ws://localhost:8081/ws",
        }

        transport = await create_transport(config)

        assert isinstance(transport, WebSocketTransport)

    @pytest.mark.asyncio
    async def test_create_transport_unknown_mode(self) -> None:
        """Test unknown transport mode raises ValueError."""
        config = {
            "name": "Test Server",
            "transport": "unknown_mode",
            "url": "ws://localhost:8081/ws",
        }

        with pytest.raises(ValueError, match="Unknown transport mode: unknown_mode"):
            await create_transport(config)
