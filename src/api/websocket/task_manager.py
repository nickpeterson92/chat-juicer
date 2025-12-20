"""
Cancellation token for cooperative task cancellation.

Provides a cleaner alternative to flag-based interruption with:
- Thread-safe cancellation signaling via asyncio.Event
- Async waiting for cancellation with timeout support
- Integration with asyncio.CancelledError propagation
"""

from __future__ import annotations

import asyncio
import contextlib

from collections.abc import AsyncIterator, Callable

from utils.logger import logger


class CancellationToken:
    """Cooperative cancellation token for async task cancellation.

    Provides a cleaner alternative to flag-based interruption with:
    - Thread-safe cancellation signaling via asyncio.Event
    - Async waiting for cancellation with timeout support
    - Callback registration for cancellation notifications
    - Integration with asyncio.CancelledError propagation

    Usage:
        token = CancellationToken()

        # In producer/controller:
        token.cancel()

        # In consumer/worker:
        if token.is_cancelled:
            return  # Early exit

        # Or periodically check in a loop:
        async for event in stream:
            token.check()  # Raises CancelledError if cancelled
            process(event)
    """

    __slots__ = ("_callbacks", "_cancel_reason", "_cancelled", "_lock")

    def __init__(self) -> None:
        self._cancelled = asyncio.Event()
        self._callbacks: list[Callable[[], None]] = []
        self._cancel_reason: str | None = None
        self._lock = asyncio.Lock()

    @property
    def is_cancelled(self) -> bool:
        """Check if cancellation has been requested."""
        return self._cancelled.is_set()

    @property
    def cancel_reason(self) -> str | None:
        """Get the reason for cancellation, if any."""
        return self._cancel_reason

    async def cancel(self, reason: str | None = None) -> None:
        """Request cancellation and notify all callbacks.

        Args:
            reason: Optional reason for cancellation (for logging/debugging)
        """
        async with self._lock:
            if self._cancelled.is_set():
                return  # Already cancelled

            self._cancel_reason = reason
            self._cancelled.set()

            # Notify callbacks (fire and forget, don't block)
            for callback in self._callbacks:
                self._invoke_callback(callback)

    def _invoke_callback(self, callback: Callable[[], None]) -> None:
        """Safely invoke a callback, logging any errors."""
        try:
            callback()
        except Exception as e:
            logger.warning(f"Cancellation callback error: {e}")

    def cancel_sync(self, reason: str | None = None) -> None:
        """Synchronous cancellation (for use in sync contexts).

        Note: Callbacks won't be called from this method to avoid
        blocking. Use async cancel() when possible.
        """
        self._cancel_reason = reason
        self._cancelled.set()

    async def wait_for_cancellation(self, timeout: float | None = None) -> bool:
        """Wait for cancellation to be requested.

        Args:
            timeout: Maximum time to wait (None = wait forever)

        Returns:
            True if cancelled, False if timeout expired
        """
        try:
            await asyncio.wait_for(self._cancelled.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def on_cancel(self, callback: Callable[[], None]) -> Callable[[], None]:
        """Register a callback to be called when cancelled.

        Args:
            callback: Function to call on cancellation

        Returns:
            The callback (for use as decorator)
        """
        self._callbacks.append(callback)
        # If already cancelled, call immediately
        if self._cancelled.is_set():
            try:
                callback()
            except Exception as e:
                logger.warning(f"Cancellation callback error: {e}")
        return callback

    def remove_callback(self, callback: Callable[[], None]) -> None:
        """Remove a previously registered callback."""
        with contextlib.suppress(ValueError):
            self._callbacks.remove(callback)

    @contextlib.asynccontextmanager
    async def cancellation_scope(self) -> AsyncIterator[None]:
        """Context manager that raises CancelledError if token is cancelled.

        Usage:
            async with token.cancellation_scope():
                await some_operation()  # Raises if cancelled

        Raises:
            asyncio.CancelledError: If token is cancelled during scope
        """
        if self.is_cancelled:
            raise asyncio.CancelledError(self._cancel_reason or "Cancelled before scope entry")

        # Create a task that waits for cancellation
        cancel_waiter = asyncio.create_task(self._cancelled.wait())

        try:
            yield
        finally:
            cancel_waiter.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await cancel_waiter

        # Check again after scope exits
        if self.is_cancelled:
            raise asyncio.CancelledError(self._cancel_reason or "Cancelled during scope")

    def check(self) -> None:
        """Check cancellation and raise if cancelled.

        Call this periodically in long-running loops to enable
        cooperative cancellation.

        Raises:
            asyncio.CancelledError: If token is cancelled
        """
        if self.is_cancelled:
            raise asyncio.CancelledError(self._cancel_reason or "Cancellation requested")

    def reset(self) -> None:
        """Reset the token to uncancelled state.

        Use with caution - typically you should create a new token instead.
        """
        self._cancelled.clear()
        self._cancel_reason = None


__all__ = ["CancellationToken"]
