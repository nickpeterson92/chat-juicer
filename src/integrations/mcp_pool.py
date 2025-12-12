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

# Default pool sizes per server type
DEFAULT_POOL_SIZE = 3
ACQUIRE_TIMEOUT_SECONDS = 30.0


class MCPServerPool:
    """Connection pool for MCP servers.

    Pre-spawns MCP server instances and manages checkout/checkin for concurrent
    requests. Each server type has its own pool of instances.

    Usage:
        pool = MCPServerPool()
        await pool.initialize(["sequential", "fetch", "tavily"], pool_size=3)

        # Acquire servers for a request
        async with pool.acquire_servers(["sequential", "fetch"]) as servers:
            # Use servers...
            pass
        # Servers automatically returned to pool
    """

    def __init__(self) -> None:
        self._pools: dict[str, asyncio.Queue[Any]] = {}
        self._all_servers: dict[str, list[Any]] = {}  # Track all servers for cleanup
        self._initialized = False
        self._lock = asyncio.Lock()

    async def initialize(
        self,
        server_keys: list[str],
        pool_size: int = DEFAULT_POOL_SIZE,
    ) -> None:
        """Initialize the pool by pre-spawning MCP servers.

        Args:
            server_keys: List of server keys to initialize (e.g., ["sequential", "fetch"])
            pool_size: Number of instances per server type
        """
        from integrations.mcp_registry import MCP_SERVER_CONFIGS, initialize_mcp_server

        async with self._lock:
            if self._initialized:
                logger.warning("MCP pool already initialized, skipping")
                return

            logger.info(f"Initializing MCP server pool: {server_keys} x {pool_size}")

            for server_key in server_keys:
                if server_key not in MCP_SERVER_CONFIGS:
                    logger.warning(f"Unknown MCP server key: {server_key}, skipping")
                    continue

                # Create queue for this server type
                self._pools[server_key] = asyncio.Queue()
                self._all_servers[server_key] = []

                # Spawn pool_size instances
                spawned = 0
                for i in range(pool_size):
                    try:
                        server = await initialize_mcp_server(server_key)
                        if server:
                            await self._pools[server_key].put(server)
                            self._all_servers[server_key].append(server)
                            spawned += 1
                    except Exception as e:
                        logger.error(f"Failed to spawn {server_key}[{i}]: {e}")

                logger.info(f"Spawned {spawned}/{pool_size} instances of {server_key}")

            self._initialized = True
            total = sum(len(servers) for servers in self._all_servers.values())
            logger.info(f"MCP pool initialized with {total} total server instances")

    async def acquire(self, server_key: str, timeout: float = ACQUIRE_TIMEOUT_SECONDS) -> Any:
        """Acquire a server from the pool.

        Blocks until a server is available or timeout is reached.

        Args:
            server_key: The server type to acquire (e.g., "sequential")
            timeout: Maximum time to wait for a server

        Returns:
            MCPServerStdio instance

        Raises:
            KeyError: If server_key not in pool
            asyncio.TimeoutError: If no server available within timeout
        """
        if server_key not in self._pools:
            raise KeyError(f"Server type '{server_key}' not in pool")

        try:
            server = await asyncio.wait_for(
                self._pools[server_key].get(),
                timeout=timeout,
            )
            logger.debug(f"Acquired {server_key} from pool (remaining: {self._pools[server_key].qsize()})")
            return server
        except asyncio.TimeoutError:
            logger.error(f"Timeout acquiring {server_key} from pool after {timeout}s")
            raise

    async def release(self, server_key: str, server: Any) -> None:
        """Return a server to the pool.

        Args:
            server_key: The server type
            server: The server instance to return
        """
        if server_key not in self._pools:
            logger.warning(f"Cannot release server - unknown key: {server_key}")
            return

        await self._pools[server_key].put(server)
        logger.debug(f"Released {server_key} to pool (available: {self._pools[server_key].qsize()})")

    @asynccontextmanager
    async def acquire_servers(
        self,
        server_keys: list[str],
        timeout: float = ACQUIRE_TIMEOUT_SECONDS,
    ) -> AsyncGenerator[list[Any], None]:
        """Context manager to acquire multiple servers and release them on exit.

        Args:
            server_keys: List of server types to acquire
            timeout: Maximum time to wait per server

        Yields:
            List of acquired server instances (in same order as server_keys)
        """
        acquired: list[tuple[str, Any]] = []

        try:
            for key in server_keys:
                if key in self._pools:
                    server = await self.acquire(key, timeout)
                    acquired.append((key, server))

            # Yield just the servers (not the keys)
            yield [server for _, server in acquired]

        finally:
            # Always release acquired servers
            for key, server in acquired:
                await self.release(key, server)

    def get_pool_stats(self) -> dict[str, dict[str, int]]:
        """Get current pool statistics.

        Returns:
            Dict mapping server_key to {total, available} counts
        """
        return {
            key: {
                "total": len(self._all_servers.get(key, [])),
                "available": self._pools[key].qsize() if key in self._pools else 0,
            }
            for key in self._pools
        }

    async def shutdown(self) -> None:
        """Shutdown all pooled servers."""
        async with self._lock:
            logger.info("Shutting down MCP server pool")

            for server_key, servers in self._all_servers.items():
                for server in servers:
                    try:
                        await server.__aexit__(None, None, None)
                    except Exception as e:
                        logger.warning(f"Error shutting down {server_key}: {e}")

            self._pools.clear()
            self._all_servers.clear()
            self._initialized = False

            logger.info("MCP server pool shutdown complete")


# Global pool instance
_mcp_pool: MCPServerPool | None = None


def get_mcp_pool() -> MCPServerPool:
    """Get the global MCP server pool instance."""
    global _mcp_pool
    if _mcp_pool is None:
        _mcp_pool = MCPServerPool()
    return _mcp_pool


async def initialize_mcp_pool(
    server_keys: list[str] | None = None,
    pool_size: int = DEFAULT_POOL_SIZE,
) -> MCPServerPool:
    """Initialize the global MCP server pool.

    Args:
        server_keys: Server types to pool (defaults to all configured)
        pool_size: Number of instances per server type

    Returns:
        The initialized pool
    """
    from integrations.mcp_registry import DEFAULT_MCP_SERVERS

    pool = get_mcp_pool()
    keys = server_keys if server_keys is not None else DEFAULT_MCP_SERVERS
    await pool.initialize(keys, pool_size)
    return pool


async def shutdown_mcp_pool() -> None:
    """Shutdown the global MCP server pool."""
    global _mcp_pool
    if _mcp_pool:
        await _mcp_pool.shutdown()
        _mcp_pool = None
