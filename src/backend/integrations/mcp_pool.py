"""
MCP Server Connection Pool - Efficient MCP server management for multi-user cloud.

Pre-spawns MCP server instances and manages them as a pool, similar to database
connection pooling. This avoids the overhead of spawning new processes per request.
"""

from __future__ import annotations

import asyncio

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from utils.logger import logger

# Pool configuration is now in Settings (core/constants.py):
# - mcp_pool_size: instances per server type (default: 3)
# - mcp_acquire_timeout: acquire timeout in seconds (default: 30.0)
# Helper functions for PERF203 compliance (avoid try-except in loops)


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


DEFAULT_POOL_SIZE = 3  # Fallback; prefer settings.mcp_pool_size
ACQUIRE_TIMEOUT_SECONDS = 30.0  # Fallback; prefer settings.mcp_acquire_timeout


class MCPServerPool:
    """Singleton Manager for MCP servers.

    Manages single shared instances of MCP clients. Since WebSocketMCPClient
    supports multiplexing, we no longer need a pool of multiple connections.
    Maintains the 'pool' API for compatibility.
    """

    def __init__(self, acquire_timeout: float = ACQUIRE_TIMEOUT_SECONDS) -> None:
        self._servers: dict[str, Any] = {}
        self._initialized = False
        self._lock = asyncio.Lock()
        self._acquire_timeout = acquire_timeout

    async def initialize(
        self,
        server_keys: list[str],
        pool_size: int = DEFAULT_POOL_SIZE,
    ) -> None:
        """Initialize the manager by connecting to MCP servers.

        Args:
            server_keys: List of server keys to connect to
            pool_size: Ignored (kept for compatibility)
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

    def get_pool_stats(self) -> dict[str, dict[str, int]]:
        """Get current manager statistics."""
        return {
            key: {
                "total": 1,
                "available": 1,
            }
            for key in self._servers
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
_state: dict[str, MCPServerPool | None] = {"pool": None}


def get_mcp_pool(acquire_timeout: float = ACQUIRE_TIMEOUT_SECONDS) -> MCPServerPool:
    """Get the global MCP server pool instance."""
    pool = _state["pool"]
    if pool is None:
        pool = MCPServerPool(acquire_timeout=acquire_timeout)
        _state["pool"] = pool
    return pool


async def initialize_mcp_pool(
    server_keys: list[str] | None = None,
    pool_size: int = DEFAULT_POOL_SIZE,
    acquire_timeout: float = ACQUIRE_TIMEOUT_SECONDS,
) -> MCPServerPool:
    """Initialize the global MCP server pool.

    Args:
        server_keys: Server types to pool (defaults to all configured)
        pool_size: Number of instances per server type
        acquire_timeout: Timeout in seconds for acquiring a server from pool

    Returns:
        The initialized pool
    """
    from integrations.mcp_registry import DEFAULT_MCP_SERVERS

    pool = get_mcp_pool(acquire_timeout=acquire_timeout)
    keys = server_keys if server_keys is not None else DEFAULT_MCP_SERVERS
    await pool.initialize(keys, pool_size)
    return pool


async def shutdown_mcp_pool() -> None:
    """Shutdown the global MCP server pool."""
    if _state["pool"] is not None:
        await _state["pool"].shutdown()
        _state["pool"] = None
