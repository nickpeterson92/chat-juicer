"""Database utilities for connection management and resilience.

Provides:
- Connection pool factory with production configuration
- Retry decorator for transient database failures
- Health check utilities
- Connection context managers with timeouts
"""

from __future__ import annotations

import asyncio
import functools
import random

from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any, ParamSpec, TypeVar

import asyncpg

from utils.logger import logger

P = ParamSpec("P")
T = TypeVar("T")


class DatabaseError(Exception):
    """Base exception for database operations."""

    pass


class ConnectionPoolExhausted(DatabaseError):
    """Raised when connection pool is exhausted and timeout expires."""

    pass


class QueryTimeout(DatabaseError):
    """Raised when a query exceeds the configured timeout."""

    pass


async def create_database_pool(
    dsn: str,
    *,
    min_size: int = 2,
    max_size: int = 10,
    command_timeout: float = 60.0,
    connection_timeout: float = 10.0,
    statement_cache_size: int = 100,
    max_inactive_connection_lifetime: float = 300.0,
) -> asyncpg.Pool:
    """Create a production-configured database connection pool.

    Args:
        dsn: PostgreSQL connection string
        min_size: Minimum connections to maintain
        max_size: Maximum connections allowed
        command_timeout: Default query timeout in seconds
        connection_timeout: Timeout for acquiring connections
        statement_cache_size: Prepared statement cache per connection
        max_inactive_connection_lifetime: Close idle connections after this time

    Returns:
        Configured asyncpg connection pool

    Raises:
        ConnectionPoolExhausted: If initial connections cannot be established
    """

    async def init_connection(conn: asyncpg.Connection) -> None:
        """Initialize each connection with proper settings."""
        # Set statement timeout at connection level (milliseconds)
        await conn.execute(f"SET statement_timeout = '{int(command_timeout * 1000)}'")
        # Set lock timeout to prevent indefinite waits
        await conn.execute(f"SET lock_timeout = '{int(command_timeout * 1000)}'")

    try:
        pool = await asyncio.wait_for(
            asyncpg.create_pool(
                dsn=dsn,
                min_size=min_size,
                max_size=max_size,
                command_timeout=command_timeout,
                statement_cache_size=statement_cache_size,
                max_inactive_connection_lifetime=max_inactive_connection_lifetime,
                init=init_connection,
            ),
            timeout=connection_timeout,
        )

        if pool is None:
            raise ConnectionPoolExhausted("Failed to create connection pool")

        # Database pool created successfully

        return pool

    except asyncio.TimeoutError as e:
        raise ConnectionPoolExhausted(f"Connection pool creation timed out after {connection_timeout}s") from e
    except Exception as e:
        raise ConnectionPoolExhausted(f"Failed to create connection pool: {e}") from e


@asynccontextmanager
async def acquire_connection(
    pool: asyncpg.Pool,
    *,
    timeout: float | None = None,
) -> AsyncGenerator[asyncpg.Connection, None]:
    """Acquire a database connection with timeout and proper error handling.

    Args:
        pool: The connection pool
        timeout: Override the default acquire timeout

    Yields:
        Database connection

    Raises:
        ConnectionPoolExhausted: If connection cannot be acquired within timeout
    """
    try:
        async with pool.acquire(timeout=timeout) as conn:
            yield conn
    except asyncio.TimeoutError as e:
        raise ConnectionPoolExhausted(
            f"Could not acquire database connection within {timeout}s - pool may be exhausted"
        ) from e


@asynccontextmanager
async def transaction(
    pool: asyncpg.Pool,
    *,
    timeout: float | None = None,
    isolation: str = "read_committed",
) -> AsyncGenerator[asyncpg.Connection, None]:
    """Execute operations within a database transaction.

    Args:
        pool: The connection pool
        timeout: Connection acquire timeout
        isolation: Transaction isolation level

    Yields:
        Connection with active transaction

    Example:
        async with transaction(pool) as conn:
            await conn.execute("INSERT INTO ...")
            await conn.execute("UPDATE ...")
    """
    async with acquire_connection(pool, timeout=timeout) as conn, conn.transaction(isolation=isolation):
        yield conn


def with_retry(
    max_attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 5.0,
    retryable_exceptions: tuple[type[Exception], ...] = (
        asyncpg.PostgresConnectionError,
        asyncpg.InterfaceError,
        ConnectionPoolExhausted,
    ),
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """Decorator for retrying database operations on transient failures.

    Uses exponential backoff with jitter to prevent thundering herd.

    Args:
        max_attempts: Maximum retry attempts (including initial)
        base_delay: Initial delay between retries (seconds)
        max_delay: Maximum delay between retries (seconds)
        retryable_exceptions: Exception types that trigger retry

    Example:
        @with_retry(max_attempts=3)
        async def get_user(pool, user_id):
            async with pool.acquire() as conn:
                return await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    """

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_exception: Exception | None = None

            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except retryable_exceptions as e:  # noqa: PERF203
                    last_exception = e

                    if attempt + 1 >= max_attempts:
                        logger.error(
                            f"Database operation failed after {max_attempts} attempts: {e}",
                            exc_info=True,
                        )
                        raise

                    # Exponential backoff with jitter
                    delay = min(base_delay * (2**attempt) + random.uniform(0, 0.5), max_delay)
                    logger.warning(
                        f"Database operation failed (attempt {attempt + 1}/{max_attempts}), "
                        f"retrying in {delay:.2f}s: {e}"
                    )
                    await asyncio.sleep(delay)

            # Should never reach here, but satisfy type checker
            if last_exception:
                raise last_exception
            raise RuntimeError("Retry loop exited unexpectedly")

        return wrapper

    return decorator


async def check_pool_health(pool: asyncpg.Pool) -> dict[str, Any]:
    """Check database pool health and return statistics.

    Returns:
        Dict with pool statistics and health status
    """
    try:
        async with acquire_connection(pool, timeout=5.0) as conn:
            # Simple health check query
            result = await conn.fetchval("SELECT 1")
            is_healthy = result == 1
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        is_healthy = False

    return {
        "healthy": is_healthy,
        "pool_size": pool.get_size(),
        "pool_min_size": pool.get_min_size(),
        "pool_max_size": pool.get_max_size(),
        "free_connections": pool.get_idle_size(),
        "used_connections": pool.get_size() - pool.get_idle_size(),
    }


async def graceful_pool_close(pool: asyncpg.Pool, timeout: float = 10.0) -> None:
    """Gracefully close the connection pool.

    Waits for active connections to complete before closing.

    Args:
        pool: The pool to close
        timeout: Maximum time to wait for connections to drain
    """
    # Initiating graceful database pool shutdown

    # Wait for active connections to be released
    start = asyncio.get_event_loop().time()
    while pool.get_size() > pool.get_idle_size():
        if asyncio.get_event_loop().time() - start > timeout:
            logger.warning(
                f"Timeout waiting for connections to drain, "
                f"forcing close ({pool.get_size() - pool.get_idle_size()} active)"
            )
            break
        await asyncio.sleep(0.1)

    await pool.close()
    # Database pool closed
