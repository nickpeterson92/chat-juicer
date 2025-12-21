import asyncio

from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from integrations.mcp_pool import MCPServerPool, _shutdown_mcp_server, _spawn_mcp_server


@pytest.fixture
def mock_mcp_params() -> Generator[dict[str, Any], None, None]:
    """Mock MCP server configurations."""
    with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"test_server": {}}) as configs:  # type: ignore[var-annotated]
        yield configs


@pytest.fixture
def mock_server_init() -> Generator[MagicMock, None, None]:
    """Mock initialize_mcp_server to return a mock server."""
    with patch("integrations.mcp_registry.initialize_mcp_server") as mock_init:
        mock_server = AsyncMock()
        mock_init.return_value = mock_server
        yield mock_init


class TestMCPServerPool:
    @pytest.mark.asyncio
    async def test_initialization(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test initializing the pool spawns correct number of servers."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"], pool_size=3)

        stats = pool.get_pool_stats()
        assert stats["test_server"]["total"] == 3
        assert stats["test_server"]["available"] == 3

        # Verify idempotency
        await pool.initialize(["test_server"], pool_size=3)
        assert mock_server_init.call_count == 3  # Should not increase

    @pytest.mark.asyncio
    async def test_initialization_unknown_server(self, mock_mcp_params: dict[str, Any]) -> None:
        """Test identifying unknown servers during init."""
        pool = MCPServerPool()
        await pool.initialize(["unknown_server"], pool_size=3)

        assert "unknown_server" not in pool.get_pool_stats()

    @pytest.mark.asyncio
    async def test_acquire_release(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test acquiring and releasing servers."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"], pool_size=1)

        # Acquire
        server = await pool.acquire("test_server")
        assert server is not None

        stats = pool.get_pool_stats()
        assert stats["test_server"]["available"] == 0

        # Release
        await pool.release("test_server", server)

        stats = pool.get_pool_stats()
        assert stats["test_server"]["available"] == 1

    @pytest.mark.asyncio
    async def test_acquire_timeout(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test timeout waiting for server."""
        pool = MCPServerPool(acquire_timeout=0.1)
        await pool.initialize(["test_server"], pool_size=1)

        # Drain the pool
        await pool.acquire("test_server")

        # Fail to acquire second one
        with pytest.raises(asyncio.TimeoutError):
            await pool.acquire("test_server")

    @pytest.mark.asyncio
    async def test_acquire_unknown_key(self) -> None:
        """Test asking for unknown server raises KeyError."""
        pool = MCPServerPool()
        with pytest.raises(KeyError, match="not in pool"):
            await pool.acquire("unknown")

    @pytest.mark.asyncio
    async def test_acquire_servers_context_manager(
        self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock
    ) -> None:
        """Test acquire_servers context manager."""
        pool = MCPServerPool()
        # Create 2 types
        with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"s1": {}, "s2": {}}):
            await pool.initialize(["s1", "s2"], pool_size=1)

            async with pool.acquire_servers(["s1", "s2"]) as servers:
                assert len(servers) == 2

                stats = pool.get_pool_stats()
                assert stats["s1"]["available"] == 0
                assert stats["s2"]["available"] == 0

            # Should be returned
            stats = pool.get_pool_stats()
            assert stats["s1"]["available"] == 1
            assert stats["s2"]["available"] == 1

    @pytest.mark.asyncio
    async def test_shutdown(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test pool shutdown cleans up resources."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"], pool_size=2)

        # Get reference to servers to check shutdown call
        # servers are AsyncMocks from fixture

        await pool.shutdown()

        stats = pool.get_pool_stats()
        assert len(stats) == 0

        # Check __aexit__ called on servers?
        # The shutdown calls _shutdown_mcp_server which calls __aexit__ on server
        # Since we mocked initialize_mcp_server returning AsyncMock,
        # that AsyncMock instance should have had __aexit__ called.

    @pytest.mark.asyncio
    async def test_spawn_helper_failure(self) -> None:
        """Test _spawn_mcp_server handles exceptions."""
        with patch("integrations.mcp_registry.initialize_mcp_server", side_effect=Exception("Spawn Fail")):
            server = await _spawn_mcp_server("key", 0)
            assert server is None

    @pytest.mark.asyncio
    async def test_shutdown_helper_failure(self) -> None:
        """Test _shutdown_mcp_server handles exceptions."""
        mock_server = MagicMock()
        mock_server.__aexit__ = AsyncMock(side_effect=Exception("Shutdown Fail"))

        # Should not raise
        await _shutdown_mcp_server(mock_server, "key")
