# ruff: noqa: SIM117

from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from integrations.mcp_manager import MCPServerManager, _shutdown_mcp_server, _spawn_mcp_server


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


class TestMCPServerManager:
    @pytest.mark.asyncio
    async def test_initialization(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test initializing the manager spawns single server per type (singleton pattern)."""
        manager = MCPServerManager()
        await manager.initialize(["test_server"])

        stats = manager.get_stats()
        assert stats["server_count"] == 1
        assert "test_server" in stats["servers"]

        # Verify idempotency
        await manager.initialize(["test_server"])
        assert mock_server_init.call_count == 1  # Should not increase

    @pytest.mark.asyncio
    async def test_initialization_unknown_server(self, mock_mcp_params: dict[str, Any]) -> None:
        """Test identifying unknown servers during init."""
        manager = MCPServerManager()
        await manager.initialize(["unknown_server"])

        assert "unknown_server" not in manager.get_stats()["servers"]

    @pytest.mark.asyncio
    async def test_acquire_release(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test acquiring and releasing servers."""
        manager = MCPServerManager()
        await manager.initialize(["test_server"])

        # Acquire
        server = await manager.acquire("test_server")
        assert server is not None

        stats = manager.get_stats()
        # Singleton: always available since it's shared
        assert stats["server_count"] == 1

        # Release (no-op for singleton)
        await manager.release("test_server", server)

        stats = manager.get_stats()
        assert stats["server_count"] == 1

    @pytest.mark.asyncio
    async def test_acquire_unknown_key(self) -> None:
        """Test asking for unknown server raises KeyError."""
        manager = MCPServerManager()
        with pytest.raises(KeyError, match="not configured"):
            await manager.acquire("unknown")

    @pytest.mark.asyncio
    async def test_acquire_servers_context_manager(
        self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock
    ) -> None:
        """Test acquire_servers context manager."""
        manager = MCPServerManager()
        # Create 2 types
        with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"s1": {}, "s2": {}}):
            await manager.initialize(["s1", "s2"])

            async with manager.acquire_servers(["s1", "s2"]) as servers:
                assert len(servers) == 2

                stats = manager.get_stats()
                # Singletons are always available
                assert stats["server_count"] == 2

            # Should remain available
            stats = manager.get_stats()
            assert stats["server_count"] == 2

    @pytest.mark.asyncio
    async def test_shutdown(self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock) -> None:
        """Test manager shutdown cleans up resources."""
        manager = MCPServerManager()
        await manager.initialize(["test_server"])

        await manager.shutdown()

        stats = manager.get_stats()
        assert stats["server_count"] == 0

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
        manager = MCPServerManager()

        # Server is in configs but not in _servers (failed init)
        with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"failed_server": {}}):
            with pytest.raises(RuntimeError, match="failed to initialize"):
                await manager.acquire("failed_server")

    @pytest.mark.asyncio
    async def test_acquire_servers_missing_key(
        self, mock_mcp_params: dict[str, Any], mock_server_init: MagicMock
    ) -> None:
        """Test acquire_servers logs warning for missing servers."""
        manager = MCPServerManager()
        await manager.initialize(["test_server"])

        # Request servers including a non-existent one
        async with manager.acquire_servers(["test_server", "nonexistent"]) as servers:
            # Should only get the one that exists
            assert len(servers) == 1


class TestGlobalManagerFunctions:
    """Tests for module-level manager functions."""

    @pytest.mark.asyncio
    async def test_get_mcp_manager_creates_new(self) -> None:
        """Test get_mcp_manager creates new manager if none exists."""
        from integrations.mcp_manager import _state, get_mcp_manager

        # Clear existing state
        original = _state["manager"]
        _state["manager"] = None

        try:
            manager = get_mcp_manager()
            assert manager is not None
            assert isinstance(manager, MCPServerManager)

            # Second call returns same instance
            manager2 = get_mcp_manager()
            assert manager2 is manager
        finally:
            _state["manager"] = original

    @pytest.mark.asyncio
    async def test_get_mcp_manager_custom_timeout(self) -> None:
        """Test get_mcp_manager with custom timeout."""
        from integrations.mcp_manager import _state, get_mcp_manager

        original = _state["manager"]
        _state["manager"] = None

        try:
            manager = get_mcp_manager(acquire_timeout=60.0)
            assert manager._acquire_timeout == 60.0
        finally:
            _state["manager"] = original

    @pytest.mark.asyncio
    async def test_initialize_mcp_manager(self) -> None:
        """Test initialize_mcp_manager initializes global manager."""
        from integrations.mcp_manager import _state, initialize_mcp_manager, shutdown_mcp_manager

        original = _state["manager"]
        _state["manager"] = None

        try:
            with patch("integrations.mcp_registry.initialize_mcp_server", AsyncMock(return_value=AsyncMock())):
                with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"test": {}}):
                    with patch("integrations.mcp_registry.DEFAULT_MCP_SERVERS", ["test"]):
                        manager = await initialize_mcp_manager()
                        assert manager is not None
                        assert manager._initialized is True

                        # Cleanup
                        await shutdown_mcp_manager()
        finally:
            _state["manager"] = original

    @pytest.mark.asyncio
    async def test_initialize_mcp_manager_with_keys(self) -> None:
        """Test initialize_mcp_manager with explicit server keys."""
        from integrations.mcp_manager import _state, initialize_mcp_manager, shutdown_mcp_manager

        original = _state["manager"]
        _state["manager"] = None

        try:
            with patch("integrations.mcp_registry.initialize_mcp_server", AsyncMock(return_value=AsyncMock())):
                with patch("integrations.mcp_registry.MCP_SERVER_CONFIGS", {"custom": {}}):
                    manager = await initialize_mcp_manager(server_keys=["custom"])
                    assert manager is not None

                    await shutdown_mcp_manager()
        finally:
            _state["manager"] = original

    @pytest.mark.asyncio
    async def test_shutdown_mcp_manager_when_none(self) -> None:
        """Test shutdown_mcp_manager when no manager exists."""
        from integrations.mcp_manager import _state, shutdown_mcp_manager

        original = _state["manager"]
        _state["manager"] = None

        try:
            # Should not raise
            await shutdown_mcp_manager()
            assert _state["manager"] is None
        finally:
            _state["manager"] = original

    @pytest.mark.asyncio
    async def test_shutdown_mcp_manager_clears_state(self) -> None:
        """Test shutdown_mcp_manager clears global state."""
        from integrations.mcp_manager import _state, get_mcp_manager, shutdown_mcp_manager

        original = _state["manager"]
        _state["manager"] = None

        try:
            manager = get_mcp_manager()
            assert _state["manager"] is manager

            await shutdown_mcp_manager()
            assert _state["manager"] is None
        finally:
            _state["manager"] = original
