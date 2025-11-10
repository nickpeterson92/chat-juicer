"""Tests for MCP registry module.

Tests MCP server initialization and management.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from integrations.mcp_registry import filter_mcp_servers, initialize_all_mcp_servers


class TestInitializeAllMCPServers:
    """Tests for initialize_all_mcp_servers function."""

    @pytest.mark.asyncio
    @patch("integrations.mcp_registry.MCPServerStdio")
    async def test_initialize_all_mcp_servers(self, mock_mcp_server_class: Mock) -> None:
        """Test initializing all MCP servers."""
        # Mock server initialization
        mock_server = Mock()
        mock_server.__aenter__ = AsyncMock(return_value=mock_server)
        mock_server.__aexit__ = AsyncMock()
        mock_mcp_server_class.return_value = mock_server

        servers = await initialize_all_mcp_servers()

        assert isinstance(servers, dict)
        # Should have servers based on MCP_SERVER_CONFIGS
        assert len(servers) >= 0

    @pytest.mark.asyncio
    @patch("integrations.mcp_registry.MCPServerStdio")
    async def test_initialize_mcp_servers_error_handling(self, mock_mcp_server_class: Mock) -> None:
        """Test MCP server initialization with errors."""
        # Mock server initialization failure
        mock_mcp_server_class.side_effect = Exception("Server init failed")

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
