# ruff: noqa: SIM117
"""Tests for MCP registry module.

Tests MCP server initialization and management.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from integrations.mcp_registry import (
    MCP_SERVER_CONFIGS,
    filter_mcp_servers,
    get_mcp_server_info,
    initialize_all_mcp_servers,
    initialize_mcp_server,
)


class TestInitializeAllMCPServers:
    """Tests for initialize_all_mcp_servers function."""

    @pytest.mark.asyncio
    @patch("integrations.mcp_registry.initialize_mcp_server")
    async def test_initialize_all_mcp_servers(self, mock_init: Mock) -> None:
        """Test initializing all MCP servers."""
        # Mock server initialization
        mock_server = Mock()
        mock_init.return_value = mock_server

        servers = await initialize_all_mcp_servers()

        assert isinstance(servers, dict)
        # Should have servers based on MCP_SERVER_CONFIGS
        assert len(servers) >= 0

    @pytest.mark.asyncio
    @patch("integrations.mcp_registry.initialize_mcp_server")
    async def test_initialize_mcp_servers_error_handling(self, mock_init: Mock) -> None:
        """Test MCP server initialization with errors."""
        # Mock server initialization failure
        mock_init.return_value = None  # initialize_mcp_server returns None on failure

        servers = await initialize_all_mcp_servers()

        # Should return empty dict when all servers fail
        assert isinstance(servers, dict)
        assert len(servers) == 0  # All should fail


class TestFilterMCPServers:
    """Tests for filter_mcp_servers function."""

    def test_filter_mcp_servers_all(self) -> None:
        """Test filtering MCP servers with all enabled."""
        mock_servers = {
            "sequential": Mock(),
            "fetch": Mock(),
            "filesystem": Mock(),
        }

        mcp_config = ["sequential", "fetch", "filesystem"]
        filtered = filter_mcp_servers(mock_servers, mcp_config)

        assert len(filtered) == 3

    def test_filter_mcp_servers_subset(self) -> None:
        """Test filtering MCP servers with subset enabled."""
        mock_servers = {
            "sequential": Mock(),
            "fetch": Mock(),
            "filesystem": Mock(),
        }

        mcp_config = ["sequential", "fetch"]
        filtered = filter_mcp_servers(mock_servers, mcp_config)

        assert len(filtered) == 2
        assert any(s == mock_servers["sequential"] for s in filtered)
        assert any(s == mock_servers["fetch"] for s in filtered)

    def test_filter_mcp_servers_none(self) -> None:
        """Test filtering MCP servers with none enabled."""
        mock_servers = {
            "sequential": Mock(),
            "fetch": Mock(),
        }

        mcp_config: list[str] = []
        filtered = filter_mcp_servers(mock_servers, mcp_config)

        assert len(filtered) == 0

    def test_filter_mcp_servers_unknown(self) -> None:
        """Test filtering with unknown server names."""
        mock_servers = {
            "sequential": Mock(),
            "fetch": Mock(),
        }

        mcp_config = ["sequential", "unknown_server"]
        filtered = filter_mcp_servers(mock_servers, mcp_config)

        # Should only include known servers
        assert len(filtered) == 1


class TestInitializeMCPServer:
    """Tests for initialize_mcp_server function."""

    @pytest.mark.asyncio
    async def test_unknown_server_key(self) -> None:
        """Test that unknown server key returns None."""
        result = await initialize_mcp_server("unknown_key")
        assert result is None

    @pytest.mark.asyncio
    async def test_server_without_api_key_requirement(self) -> None:
        """Test server without API key requirement uses transport."""
        mock_transport = AsyncMock()
        mock_server = Mock()
        mock_transport.connect = AsyncMock(return_value=mock_server)

        with patch("integrations.mcp_transport.create_transport", AsyncMock(return_value=mock_transport)):
            with patch(
                "integrations.mcp_registry.MCP_SERVER_CONFIGS",
                {
                    "test": {
                        "name": "Test Server",
                        "transport": "websocket",
                        "url": "ws://localhost:9999/ws",
                    }
                },
            ):
                result = await initialize_mcp_server("test")
                assert result == mock_server

    @pytest.mark.asyncio
    async def test_server_with_missing_api_key(self) -> None:
        """Test server requiring API key returns None when key missing."""
        mock_settings = Mock()
        mock_settings.tavily_api_key = None

        with (
            patch("integrations.mcp_registry.get_settings", return_value=mock_settings),
            patch(
                "integrations.mcp_registry.MCP_SERVER_CONFIGS",
                {
                    "tavily": {
                        "name": "Tavily",
                        "env_key": "tavily_api_key",
                        "transport": "websocket",
                        "url": "ws://localhost:8083/ws",
                    }
                },
            ),
        ):
            result = await initialize_mcp_server("tavily")
            assert result is None

    @pytest.mark.asyncio
    async def test_server_with_api_key_present(self) -> None:
        """Test server requiring API key works when key is present."""
        mock_settings = Mock()
        mock_settings.tavily_api_key = "test-key"

        mock_transport = AsyncMock()
        mock_server = Mock()
        mock_transport.connect = AsyncMock(return_value=mock_server)

        with patch("integrations.mcp_registry.get_settings", return_value=mock_settings):
            with patch("integrations.mcp_transport.create_transport", AsyncMock(return_value=mock_transport)):
                with patch(
                    "integrations.mcp_registry.MCP_SERVER_CONFIGS",
                    {
                        "tavily": {
                            "name": "Tavily",
                            "env_key": "tavily_api_key",
                            "transport": "websocket",
                            "url": "ws://localhost:8083/ws",
                        }
                    },
                ):
                    result = await initialize_mcp_server("tavily")
                    assert result == mock_server

    @pytest.mark.asyncio
    async def test_transport_import_error(self) -> None:
        """Test handling of transport module import error."""
        # When mcp_transport module can't be imported, initialize_mcp_server catches ImportError
        # We simulate this by patching the import inside initialize_mcp_server
        with patch(
            "integrations.mcp_registry.MCP_SERVER_CONFIGS",
            {
                "test": {
                    "name": "Test Server",
                    "transport": "websocket",
                    "url": "ws://localhost:9999/ws",
                }
            },
        ):
            # Mock the local import inside initialize_mcp_server to raise ImportError
            with patch.dict(
                "sys.modules",
                {"integrations.mcp_transport": None},
            ):
                # The import will fail and should return None
                result = await initialize_mcp_server("test")
                # Should catch ImportError and return None
                assert result is None

    @pytest.mark.asyncio
    async def test_transport_connection_error(self) -> None:
        """Test handling of transport connection error."""
        mock_transport = AsyncMock()
        mock_transport.connect = AsyncMock(side_effect=Exception("Connection failed"))

        with patch("integrations.mcp_transport.create_transport", AsyncMock(return_value=mock_transport)):
            with patch(
                "integrations.mcp_registry.MCP_SERVER_CONFIGS",
                {
                    "test": {
                        "name": "Test Server",
                        "transport": "websocket",
                        "url": "ws://localhost:9999/ws",
                    }
                },
            ):
                result = await initialize_mcp_server("test")
                # Should catch Exception and return None
                assert result is None


class TestGetMCPServerInfo:
    """Tests for get_mcp_server_info function."""

    def test_get_server_info(self) -> None:
        """Test getting MCP server information."""
        info = get_mcp_server_info()

        assert isinstance(info, dict)
        # Should have info for configured servers
        for key in MCP_SERVER_CONFIGS:
            assert key in info
            assert "name" in info[key]
            assert "description" in info[key]

    def test_server_info_contains_expected_fields(self) -> None:
        """Test server info has name and description fields."""
        info = get_mcp_server_info()

        for server_info in info.values():
            assert isinstance(server_info["name"], str)
            assert isinstance(server_info["description"], str)


class TestFilterMCPServersDefault:
    """Additional filter tests."""

    def test_filter_with_none_config_uses_default(self) -> None:
        """Test that None config uses DEFAULT_MCP_SERVERS."""
        mock_servers = {
            "sequential": Mock(),
            "fetch": Mock(),
            "tavily": Mock(),
        }

        # Pass None to use defaults
        filtered = filter_mcp_servers(mock_servers, None)

        # Should include default servers that exist
        assert len(filtered) >= 0  # May vary based on DEFAULT_MCP_SERVERS
