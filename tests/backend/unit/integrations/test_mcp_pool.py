# ruff: noqa: SIM117

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
        """Test initializing the pool spawns single server per type (singleton pattern)."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"])

        stats = pool.get_pool_stats()
        assert stats["test_server"]["total"] == 1
        assert stats["test_server"]["available"] == 1

        # Verify idempotency
        await pool.initialize(["test_server"])
        assert mock_server_init.call_count == 1  # Should not increase

    @pytest.mark.asyncio
    async def test_initialization_unknown_server(self, mock_mcp_params: dict[str, Any]) -> None:
        """Test identifying unknown servers during init."""
        pool = MCPServerPool()
        await pool.initialize(["unknown_server"])

        assert "unknown_server" not in pool.get_pool_stats()

    @pytest.mark.asyncio
    async def test_acquire_release(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test acquiring and releasing servers."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"])

        # Acquire
        server = await pool.acquire("test_server")
        assert server is not None

        stats = pool.get_pool_stats()
        # Singleton: always available since it's shared
        assert stats["test_server"]["available"] == 1

        # Release (no-op for singleton)
        await pool.release("test_server", server)

        stats = pool.get_pool_stats()
        assert stats["test_server"]["available"] == 1

    @pytest.mark.asyncio
    async def test_acquire_unknown_key(self) -> None:
        """Test asking for unknown server raises KeyError."""
        pool = MCPServerPool()
        with pytest.raises(KeyError, match="not configured"):
            await pool.acquire("unknown")

    @pytest.mark.asyncio
    async def test_acquire_servers_context_manager(
        self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock
    ) -> None:
        """Test acquire_servers context manager."""
        pool = MCPServerPool()
        # Create 2 types
        with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"s1": {}, "s2": {}}):
            await pool.initialize(["s1", "s2"])

            async with pool.acquire_servers(["s1", "s2"]) as servers:
                assert len(servers) == 2

                stats = pool.get_pool_stats()
                # Singletons are always available
                assert stats["s1"]["available"] == 1
                assert stats["s2"]["available"] == 1

            # Should remain available
            stats = pool.get_pool_stats()
            assert stats["s1"]["available"] == 1
            assert stats["s2"]["available"] == 1

    @pytest.mark.asyncio
    async def test_shutdown(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test pool shutdown cleans up resources."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"])

        await pool.shutdown()

        stats = pool.get_pool_stats()
        assert len(stats) == 0

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

    @pytest.mark.asyncio
    async def test_acquire_failed_initialization(self) -> None:
        """Test acquiring server that failed to initialize raises RuntimeError."""
        pool = MCPServerPool()

        # Server is in configs but not in _servers (failed init)
        with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"failed_server": {}}):
            with pytest.raises(RuntimeError, match="failed to initialize"):
                await pool.acquire("failed_server")

    @pytest.mark.asyncio
    async def test_acquire_servers_missing_key(
        self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock
    ) -> None:
        """Test acquire_servers logs warning for missing servers."""
        pool = MCPServerPool()
        await pool.initialize(["test_server"])

        # Request servers including a non-existent one
        async with pool.acquire_servers(["test_server", "nonexistent"]) as servers:
            # Should only get the one that exists
            assert len(servers) == 1


class TestGlobalPoolFunctions:
    """Tests for module-level pool functions."""

    @pytest.mark.asyncio
    async def test_get_mcp_pool_creates_new(self) -> None:
        """Test get_mcp_pool creates new pool if none exists."""
        from integrations.mcp_pool import _state, get_mcp_pool

        # Clear existing state
        original = _state["pool"]
        _state["pool"] = None

        try:
            pool = get_mcp_pool()
            assert pool is not None
            assert isinstance(pool, MCPServerPool)

            # Second call returns same instance
            pool2 = get_mcp_pool()
            assert pool2 is pool
        finally:
            _state["pool"] = original

    @pytest.mark.asyncio
    async def test_get_mcp_pool_custom_timeout(self) -> None:
        """Test get_mcp_pool with custom timeout."""
        from integrations.mcp_pool import _state, get_mcp_pool

        original = _state["pool"]
        _state["pool"] = None

        try:
            pool = get_mcp_pool(acquire_timeout=60.0)
            assert pool._acquire_timeout == 60.0
        finally:
            _state["pool"] = original

    @pytest.mark.asyncio
    async def test_initialize_mcp_pool(self) -> None:
        """Test initialize_mcp_pool initializes global pool."""
        from integrations.mcp_pool import _state, initialize_mcp_pool, shutdown_mcp_pool

        original = _state["pool"]
        _state["pool"] = None

        try:
            with patch("integrations.mcp_registry.initialize_mcp_server", AsyncMock(return_value=AsyncMock())):
                with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"test": {}}):
                    with patch("integrations.mcp_registry.DEFAULT_MCP_SERVERS", ["test"]):
                        pool = await initialize_mcp_pool()
                        assert pool is not None
                        assert pool._initialized is True

                        # Cleanup
                        await shutdown_mcp_pool()
        finally:
            _state["pool"] = original

    @pytest.mark.asyncio
    async def test_initialize_mcp_pool_with_keys(self) -> None:
        """Test initialize_mcp_pool with explicit server keys."""
        from integrations.mcp_pool import _state, initialize_mcp_pool, shutdown_mcp_pool

        original = _state["pool"]
        _state["pool"] = None

        try:
            with patch("integrations.mcp_registry.initialize_mcp_server", AsyncMock(return_value=AsyncMock())):
                with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"custom": {}}):
                    pool = await initialize_mcp_pool(server_keys=["custom"])
                    assert pool is not None

                    await shutdown_mcp_pool()
        finally:
            _state["pool"] = original

    @pytest.mark.asyncio
    async def test_shutdown_mcp_pool_when_none(self) -> None:
        """Test shutdown_mcp_pool when no pool exists."""
        from integrations.mcp_pool import _state, shutdown_mcp_pool

        original = _state["pool"]
        _state["pool"] = None

        try:
            # Should not raise
            await shutdown_mcp_pool()
            assert _state["pool"] is None
        finally:
            _state["pool"] = original

    @pytest.mark.asyncio
    async def test_shutdown_mcp_pool_clears_state(self) -> None:
        """Test shutdown_mcp_pool clears global state."""
        from integrations.mcp_pool import _state, get_mcp_pool, shutdown_mcp_pool

        original = _state["pool"]
        _state["pool"] = None

        try:
            pool = get_mcp_pool()
            assert _state["pool"] is pool

            await shutdown_mcp_pool()
            assert _state["pool"] is None
        finally:
            _state["pool"] = original
