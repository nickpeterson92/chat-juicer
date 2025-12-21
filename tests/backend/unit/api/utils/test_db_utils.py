import asyncio

from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest

from utils.db_utils import (
    ConnectionPoolExhausted,
    acquire_connection,
    check_pool_health,
    create_database_pool,
    graceful_pool_close,
    transaction,
    with_retry,
)


@pytest.mark.asyncio
async def test_create_database_pool_success() -> None:
    """Test successful pool creation and initialization."""
    mock_pool = AsyncMock(spec=asyncpg.Pool)

    with patch("asyncpg.create_pool", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_pool

        pool = await create_database_pool("postgres://dsn")

        assert pool == mock_pool
        mock_create.assert_called_once()

        # Verify init callback logic
        kwargs = mock_create.call_args.kwargs
        init_func = kwargs["init"]

        # Test the init function sets timeouts
        mock_conn = AsyncMock()
        await init_func(mock_conn)

        # Expect SET statement_timeout and SET lock_timeout
        assert mock_conn.execute.call_count == 2
        assert "SET statement_timeout" in mock_conn.execute.call_args_list[0][0][0]


@pytest.mark.asyncio
async def test_create_database_pool_failure() -> None:
    """Test pool creation failure handling."""
    with (
        patch("asyncpg.create_pool", side_effect=asyncio.TimeoutError),
        pytest.raises(ConnectionPoolExhausted, match="timed out"),
    ):
        await create_database_pool("postgres://dsn", connection_timeout=0.1)


@pytest.mark.asyncio
async def test_acquire_connection_success() -> None:
    """Test successful connection acquisition."""
    mock_pool = MagicMock()
    mock_conn = AsyncMock()

    # Mock context manager
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value = mock_ctx

    async with acquire_connection(mock_pool) as conn:
        assert conn == mock_conn

    mock_pool.acquire.assert_called_once()


@pytest.mark.asyncio
async def test_acquire_connection_timeout() -> None:
    """Test timeout during acquisition."""
    mock_pool = MagicMock()
    # Simulate timeout on acquire
    mock_pool.acquire.side_effect = asyncio.TimeoutError

    with pytest.raises(ConnectionPoolExhausted, match="Could not acquire"):
        async with acquire_connection(mock_pool, timeout=1.0):
            pass


@pytest.mark.asyncio
async def test_transaction_decorator() -> None:
    """Test transaction context manager."""
    mock_pool = MagicMock()
    # Let's use AsyncMock but fix transaction
    mock_conn = AsyncMock()

    mock_conn = AsyncMock()

    # Setup connection context manager
    mock_conn_ctx = AsyncMock()
    mock_conn_ctx.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value = mock_conn_ctx

    # Setup transaction context manager logic on connection
    # conn.transaction() is NOT async, it returns a CM.
    mock_tx_ctx = AsyncMock()

    # Important: Configure transaction to be a MagicMock that returns the ctx
    mock_conn.transaction = MagicMock(return_value=mock_tx_ctx)

    async with transaction(mock_pool) as conn:
        assert conn == mock_conn

    mock_pool.acquire.assert_called_once()
    mock_conn.transaction.assert_called_once()
    mock_tx_ctx.__aenter__.assert_called_once()
    mock_tx_ctx.__aexit__.assert_called_once()


@pytest.mark.asyncio
async def test_with_retry_success() -> None:
    """Test retry logic eventually succeeds."""
    mock_func = AsyncMock(side_effect=[asyncpg.PostgresConnectionError("Fail 1"), "Success"])

    @with_retry(max_attempts=3, base_delay=0.01)
    async def retried_func() -> str:
        return await mock_func()  # type: ignore

    result = await retried_func()
    assert result == "Success"
    assert mock_func.call_count == 2


@pytest.mark.asyncio
async def test_with_retry_exhausted() -> None:
    """Test retry logic gives up after max attempts."""
    mock_func = AsyncMock(side_effect=asyncpg.PostgresConnectionError("Persistent Fail"))

    @with_retry(max_attempts=2, base_delay=0.01)
    async def retried_func() -> None:
        await mock_func()

    with pytest.raises(asyncpg.PostgresConnectionError):
        await retried_func()

    assert mock_func.call_count == 2


@pytest.mark.asyncio
async def test_check_pool_health_healthy() -> None:
    """Test healthy pool check."""
    mock_pool = MagicMock()
    mock_conn = AsyncMock()

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value = mock_ctx

    mock_conn.fetchval.return_value = 1

    # Mock pool stats
    mock_pool.get_size.return_value = 5
    mock_pool.get_min_size.return_value = 2
    mock_pool.get_max_size.return_value = 10
    mock_pool.get_idle_size.return_value = 3

    health = await check_pool_health(mock_pool)

    assert health["healthy"] is True
    assert health["pool_size"] == 5
    assert health["free_connections"] == 3


@pytest.mark.asyncio
async def test_check_pool_health_unhealthy() -> None:
    """Test unhealthy pool check."""
    mock_pool = MagicMock()
    mock_pool.acquire.side_effect = Exception("DB Down")

    health = await check_pool_health(mock_pool)

    assert health["healthy"] is False


@pytest.mark.asyncio
async def test_graceful_pool_close() -> None:
    """Test graceful shutdown waits for connections."""
    mock_pool = MagicMock()  # Use MagicMock to avoid auto-async methods
    mock_pool.close = AsyncMock()  # close IS async

    # Simulate: 5 connections, then 3 idle (2 active), then 5 idle (0 active)
    # get_size - get_idle_size > 0 means active

    mock_pool.get_size.return_value = 5
    # First call: 2 active (5-3), Second call: 0 active (5-5)
    mock_pool.get_idle_size.side_effect = [3, 5, 5]

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        await graceful_pool_close(mock_pool, timeout=1.0)

        mock_sleep.assert_called()
        mock_pool.close.assert_called_once()
