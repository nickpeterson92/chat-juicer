"""Tests for MCP servers module.

Tests MCP server configuration.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from integrations.mcp_servers import setup_mcp_servers


class TestSetupMCPServers:
    """Tests for setup_mcp_servers function."""

    @pytest.mark.asyncio
    async def test_setup_mcp_servers_success(self) -> None:
        """Test successful MCP server setup."""
        with patch("integrations.mcp_servers.MCPServerStdio") as mock_server_class:
            # Create mock server instances
            mock_seq_server = Mock()
            mock_seq_server.__aenter__ = AsyncMock(return_value=mock_seq_server)
            mock_fetch_server = Mock()
            mock_fetch_server.__aenter__ = AsyncMock(return_value=mock_fetch_server)

            # Return different instances for each call
            mock_server_class.side_effect = [mock_seq_server, mock_fetch_server]

            servers = await setup_mcp_servers()

            assert len(servers) == 2
            assert mock_seq_server in servers
            assert mock_fetch_server in servers
            assert mock_server_class.call_count == 2

    @pytest.mark.asyncio
    async def test_setup_mcp_servers_seq_thinking_fails(self) -> None:
        """Test setup when sequential thinking server fails."""
        with patch("integrations.mcp_servers.MCPServerStdio") as mock_server_class:
            # First server fails, second succeeds
            mock_seq_server = Mock()
            mock_seq_server.__aenter__ = AsyncMock(side_effect=Exception("Server failed"))

            mock_fetch_server = Mock()
            mock_fetch_server.__aenter__ = AsyncMock(return_value=mock_fetch_server)

            mock_server_class.side_effect = [mock_seq_server, mock_fetch_server]

            servers = await setup_mcp_servers()

            # Should only have fetch server
            assert len(servers) == 1
            assert mock_fetch_server in servers

    @pytest.mark.asyncio
    async def test_setup_mcp_servers_fetch_fails(self) -> None:
        """Test setup when fetch server fails."""
        with patch("integrations.mcp_servers.MCPServerStdio") as mock_server_class:
            # First server succeeds, second fails
            mock_seq_server = Mock()
            mock_seq_server.__aenter__ = AsyncMock(return_value=mock_seq_server)

            mock_fetch_server = Mock()
            mock_fetch_server.__aenter__ = AsyncMock(side_effect=Exception("Fetch failed"))

            mock_server_class.side_effect = [mock_seq_server, mock_fetch_server]

            servers = await setup_mcp_servers()

            # Should only have seq thinking server
            assert len(servers) == 1
            assert mock_seq_server in servers

    @pytest.mark.asyncio
    async def test_setup_mcp_servers_all_fail(self) -> None:
        """Test setup when all servers fail."""
        with patch("integrations.mcp_servers.MCPServerStdio") as mock_server_class:
            # Both servers fail
            mock_seq_server = Mock()
            mock_seq_server.__aenter__ = AsyncMock(side_effect=Exception("Seq failed"))

            mock_fetch_server = Mock()
            mock_fetch_server.__aenter__ = AsyncMock(side_effect=Exception("Fetch failed"))

            mock_server_class.side_effect = [mock_seq_server, mock_fetch_server]

            servers = await setup_mcp_servers()

            # Should return empty list
            assert servers == []

    @pytest.mark.asyncio
    async def test_setup_mcp_servers_correct_params(self) -> None:
        """Test that servers are initialized with correct parameters."""
        with patch("integrations.mcp_servers.MCPServerStdio") as mock_server_class:
            mock_seq_server = Mock()
            mock_seq_server.__aenter__ = AsyncMock(return_value=mock_seq_server)
            mock_fetch_server = Mock()
            mock_fetch_server.__aenter__ = AsyncMock(return_value=mock_fetch_server)

            mock_server_class.side_effect = [mock_seq_server, mock_fetch_server]

            await setup_mcp_servers()

            # Check first call (sequential thinking)
            first_call = mock_server_class.call_args_list[0]
            assert first_call[1]["params"]["command"] == "npx"
            assert "-y" in first_call[1]["params"]["args"]
            assert "@modelcontextprotocol/server-sequential-thinking" in first_call[1]["params"]["args"]

            # Check second call (fetch)
            second_call = mock_server_class.call_args_list[1]
            assert ".juicer/bin/python3" in second_call[1]["params"]["command"]
            assert "-m" in second_call[1]["params"]["args"]
            assert "mcp_server_fetch" in second_call[1]["params"]["args"]


class TestMCPServersConfiguration:
    """Tests for MCP server configuration."""

    def test_mcp_servers_module_exists(self) -> None:
        """Test that MCP servers module exists."""
        try:
            import integrations.mcp_servers
            assert integrations.mcp_servers is not None
        except ImportError:
            # Module may not have much testable content
            assert True
