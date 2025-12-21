import asyncio

from unittest.mock import Mock

import pytest

from api.websocket.task_manager import CancellationToken


@pytest.fixture
def token() -> CancellationToken:
    return CancellationToken()


@pytest.mark.asyncio
async def test_cancellation_signaling(token: CancellationToken) -> None:
    assert not token.is_cancelled
    assert token.cancel_reason is None

    await token.cancel(reason="test reason")

    assert token.is_cancelled
    assert token.cancel_reason == "test reason"

    # Idempotency
    await token.cancel(reason="another reason")
    assert token.cancel_reason == "test reason"


@pytest.mark.asyncio
async def test_callbacks(token: CancellationToken) -> None:
    mock_cb1 = Mock()
    mock_cb2 = Mock()

    token.on_cancel(mock_cb1)

    await token.cancel()

    mock_cb1.assert_called_once()
    mock_cb2.assert_not_called()

    # Register after cancellation
    token.on_cancel(mock_cb2)
    mock_cb2.assert_called_once()


@pytest.mark.asyncio
async def test_remove_callback(token: CancellationToken) -> None:
    mock_cb = Mock()
    token.on_cancel(mock_cb)
    token.remove_callback(mock_cb)

    await token.cancel()
    mock_cb.assert_not_called()


@pytest.mark.asyncio
async def test_wait_for_cancellation(token: CancellationToken) -> None:
    task = asyncio.create_task(token.wait_for_cancellation(timeout=0.5))

    await asyncio.sleep(0.01)
    await token.cancel()

    result = await task
    assert result is True


@pytest.mark.asyncio
async def test_wait_for_cancellation_timeout(token: CancellationToken) -> None:
    result = await token.wait_for_cancellation(timeout=0.01)
    assert result is False


@pytest.mark.asyncio
async def test_check_raises(token: CancellationToken) -> None:
    token.check()  # Should not raise

    await token.cancel(reason="stop")

    with pytest.raises(asyncio.CancelledError, match="stop"):
        token.check()


@pytest.mark.asyncio
async def test_cancellation_scope(token: CancellationToken) -> None:
    # Test raising inside scope when cancelled externaly
    task_cancelled = False

    async def run_scoped() -> None:
        nonlocal task_cancelled
        try:
            async with token.cancellation_scope():
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            task_cancelled = True
            raise

    task = asyncio.create_task(run_scoped())
    await asyncio.sleep(0.01)
    await token.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task

    assert task_cancelled


@pytest.mark.asyncio
async def test_cancellation_scope_pre_cancelled(token: CancellationToken) -> None:
    await token.cancel()

    with pytest.raises(asyncio.CancelledError, match="Cancelled before scope entry"):
        async with token.cancellation_scope():
            pass


@pytest.mark.asyncio
async def test_cancellation_scope_clean_exit(token: CancellationToken) -> None:
    async with token.cancellation_scope():
        val = 1
    assert val == 1


@pytest.mark.asyncio
async def test_reset(token: CancellationToken) -> None:
    await token.cancel()
    assert token.is_cancelled

    await token.reset()
    assert not token.is_cancelled
    assert token.cancel_reason is None
