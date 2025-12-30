"""
MCP Server Manager - Shared MCP client management for multi-user cloud.

Manages singleton instances of MCP clients. Since WebSocketMCPClient
supports multiplexing, a single connection per server type handles
concurrent requests without conflicts.
"""

from __future__ import annotations

import asyncio

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from utils.logger import logger

# Configuration is in Settings (core/constants.py):
# - mcp_acquire_timeout: acquire timeout in seconds (default: 30.0)


async def _spawn_mcp_server(server_key: str, index: int) -> Any | None:
    """Spawn a single MCP server instance with error handling."""
    from integrations.mcp_registry import initialize_mcp_server

    try:
        server = await initialize_mcp_server(server_key)
        return server
    except Exception as e:
        logger.error(f"Failed to spawn {server_key}[{index}]: {e}")
        return None


async def _shutdown_mcp_server(server: Any, server_key: str) -> None:
    """Shutdown a single MCP server with error handling."""
    try:
        await server.__aexit__(None, None, None)
    except Exception as e:
        logger.warning(f"Error shutting down {server_key}: {e}")


ACQUIRE_TIMEOUT_SECONDS = 30.0  # Fallback; prefer settings.mcp_acquire_timeout


class MCPServerManager:
    """Singleton Manager for MCP servers.

    Manages single shared instances of MCP clients. Since WebSocketMCPClient
    supports multiplexing, we no longer need a pool of multiple connections.
    """

    def __init__(self, acquire_timeout: float = ACQUIRE_TIMEOUT_SECONDS) -> None:
        self._servers: dict[str, Any] = {}
        self._initialized = False
        self._lock = asyncio.Lock()
        self._acquire_timeout = acquire_timeout

    async def initialize(
        self,
        server_keys: list[str],
    ) -> None:
        """Initialize the manager by connecting to MCP servers.

        Args:
            server_keys: List of server keys to connect to
        """
        from integrations.mcp_registry import MCP_SERVER_CONFIGS

        async with self._lock:
            if self._initialized:
                logger.warning("MCP manager already initialized, skipping")
                return

            logger.info(f"Initializing MCP server manager for: {server_keys}")

            for server_key in server_keys:
                if server_key not in MCP_SERVER_CONFIGS:
                    logger.warning(f"Unknown MCP server key: {server_key}, skipping")
                    continue

                # Spawn single instance
                server = await _spawn_mcp_server(server_key, 0)
                if server:
                    self._servers[server_key] = server
                    logger.info(f"Connected to {server_key}")

            self._initialized = True
            logger.info(f"MCP manager initialized with {len(self._servers)} servers")

    async def acquire(self, server_key: str, timeout: float | None = None) -> Any:
        """Acquire the shared server instance.

        Args:
            server_key: The server type to acquire
            timeout: Ignored (immediate return)

        Returns:
            The shared MCP client instance

        Raises:
            KeyError: If server_key not managed
            RuntimeError: If server initialization failed
        """
        if server_key not in self._servers:
            # Check if it was a configuration error or initialization failure
            from integrations.mcp_registry import MCP_SERVER_CONFIGS

            if server_key in MCP_SERVER_CONFIGS:
                raise RuntimeError(f"Server '{server_key}' failed to initialize")
            raise KeyError(f"Server type '{server_key}' not configured")

        return self._servers[server_key]

    async def release(self, server_key: str, server: Any) -> None:
        """Release the server (no-op for shared instances)."""
        pass

    @asynccontextmanager
    async def acquire_servers(
        self,
        server_keys: list[str],
        timeout: float | None = None,
    ) -> AsyncGenerator[list[Any], None]:
        """Context manager to acquire multiple servers.

        Args:
            server_keys: List of server types to acquire
            timeout: Ignored

        Yields:
            List of shared server instances
        """
        servers = []
        for key in server_keys:
            if key in self._servers:
                servers.append(self._servers[key])
            else:
                logger.warning(f"Requested server '{key}' not available")

        yield servers

    def get_stats(self) -> dict[str, Any]:
        """Get statistics for health check endpoint."""
        return {
            "initialized": self._initialized,
            "servers": list(self._servers.keys()),
            "server_count": len(self._servers),
        }

    async def shutdown(self) -> None:
        """Shutdown all managed servers."""
        async with self._lock:
            logger.info("Shutting down MCP server manager")

            # Shutdown all servers concurrently
            shutdown_tasks = [_shutdown_mcp_server(server, key) for key, server in self._servers.items()]
            if shutdown_tasks:
                await asyncio.gather(*shutdown_tasks)

            self._servers.clear()
            self._initialized = False

            logger.info("MCP server manager shutdown complete")


# Module-level state holder to avoid global statement (PLW0603)
_state: dict[str, MCPServerManager | None] = {"manager": None}


def get_mcp_manager(acquire_timeout: float = ACQUIRE_TIMEOUT_SECONDS) -> MCPServerManager:
    """Get the global MCP server manager instance."""
    manager = _state["manager"]
    if manager is None:
        manager = MCPServerManager(acquire_timeout=acquire_timeout)
        _state["manager"] = manager
    return manager


async def initialize_mcp_manager(
    server_keys: list[str] | None = None,
    acquire_timeout: float = ACQUIRE_TIMEOUT_SECONDS,
) -> MCPServerManager:
    """Initialize the global MCP server manager.

    Args:
        server_keys: Server types to connect to (defaults to all configured)
        acquire_timeout: Timeout in seconds (kept for API compatibility)

    Returns:
        The initialized manager
    """
    from integrations.mcp_registry import DEFAULT_MCP_SERVERS

    manager = get_mcp_manager(acquire_timeout=acquire_timeout)
    keys = server_keys if server_keys is not None else DEFAULT_MCP_SERVERS
    await manager.initialize(keys)
    return manager


async def shutdown_mcp_manager() -> None:
    """Shutdown the global MCP server manager."""
    if _state["manager"] is not None:
        await _state["manager"].shutdown()
        _state["manager"] = None
