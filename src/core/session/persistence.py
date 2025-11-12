"""Dual-layer persistence with safeguards (Layer 1 + Layer 2)."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from core.session.transaction_coordinator import TransactionCoordinator
from models.session_models import FullHistoryProtocol
from utils.logger import logger


class PersistenceCoordinator:
    """Coordinates writes to Layer 1 (LLM context) and Layer 2 (full history).

    CRITICAL SAFEGUARD: Enforces dual-layer writes during normal operation
    to prevent orphaned sessions. Only allows Layer 1-only writes during
    summarization repopulation (_skip_full_history=True).

    Uses TransactionCoordinator for atomic writes with rollback capabilities.
    """

    def __init__(
        self,
        session_id: str,
        full_history_store: FullHistoryProtocol | None,
        session_instance: Any,  # TokenAwareSQLiteSession reference
    ):
        self.session_id = session_id
        self.full_history_store = full_history_store
        self.session = session_instance

        # Context flag for skipping Layer 2 during repopulation
        self._skip_full_history = False

        # Transaction coordinator for atomic writes
        self._transaction_coordinator = TransactionCoordinator(
            max_retries=3,
            initial_backoff=0.1,
            backoff_multiplier=2.0,
        )

    @contextmanager
    def skip_full_history_context(self) -> Generator[None, None, None]:
        """Context manager for safely skipping Layer 2 during repopulation."""
        old_value = self._skip_full_history
        self._skip_full_history = True
        try:
            yield
        finally:
            self._skip_full_history = old_value

    async def save_items(self, items: Any) -> None:
        """Save items to both layers with safeguards and transaction support.

        Uses TransactionCoordinator for atomic writes with automatic retry
        and rollback on Layer 2 failures.

        Raises:
            RuntimeError: If full_history_store is None during normal operation
            PersistenceError: If Layer 2 write fails after retries
        """
        # SAFEGUARD: Enforce dual-layer persistence
        if not self._skip_full_history and not self.full_history_store:
            error_msg = (
                f"CRITICAL: Attempted to write to Layer 1 without Layer 2 "
                f"for session {self.session_id}. This would create an orphaned session. "
                f"full_history_store must be configured."
            )
            logger.error(error_msg)
            raise RuntimeError(error_msg)

        # Filter items with 'role' (SDK internals are filtered out)
        role_items = [item for item in items if item.get("role")]

        # During repopulation, skip Layer 2 and just write to Layer 1
        if self._skip_full_history:
            await self.session.__class__.__bases__[0].add_items(self.session, items)
            logger.debug(f"Layer 1-only write during repopulation: {len(items)} items")
            return

        # Normal operation: use transaction coordinator for atomic writes
        if not self.full_history_store:
            # This should never happen due to earlier check, but satisfy type checker
            raise RuntimeError("full_history_store is None")

        # Save Layer 1 state for rollback
        layer1_items_before = await self.session.get_items()
        items_count_before = len(layer1_items_before)

        # Define Layer 1 write operation
        async def layer1_write() -> None:
            await self.session.__class__.__bases__[0].add_items(self.session, items)

        # Define Layer 2 write operation (non-async for transaction coordinator)
        def layer2_write() -> None:
            # Type guard: full_history_store is not None (checked earlier)
            if not self.full_history_store:
                raise RuntimeError("full_history_store is None")
            for item in role_items:
                self.full_history_store.save_message(self.session_id, item)

        # Define Layer 1 rollback operation
        async def layer1_rollback() -> None:
            # Clear session and restore previous items
            await self.session.clear_session()
            if layer1_items_before:
                await self.session.__class__.__bases__[0].add_items(self.session, layer1_items_before)
                logger.info(f"Restored Layer 1 to {items_count_before} items after rollback")

        # Execute Layer 1 write first (required for rollback state)
        try:
            await layer1_write()
            logger.debug(f"Layer 1 write succeeded: {len(items)} items")
        except Exception as e:
            error_msg = f"Layer 1 write failed for session {self.session_id}: {e}"
            logger.error(error_msg, exc_info=True)
            raise RuntimeError(error_msg) from e

        # Execute Layer 2 write with transaction coordinator
        success, error = await self._transaction_coordinator._retry_with_backoff(
            layer2_write,
            f"Layer 2 write for session {self.session_id}",
        )

        if not success:
            # Layer 2 failed - rollback Layer 1
            logger.error(f"Layer 2 write failed after retries, rolling back Layer 1: {error}")
            try:
                await layer1_rollback()
                logger.info(f"Layer 1 rollback succeeded for session {self.session_id}")
            except Exception as rollback_error:
                # Rollback failed - critical inconsistency
                error_msg = (
                    f"CRITICAL INCONSISTENCY: Layer 2 write failed AND rollback failed "
                    f"for session {self.session_id}. "
                    f"Layer 2 error: {error}, Rollback error: {rollback_error}"
                )
                logger.error(error_msg, exc_info=True)
                raise RuntimeError(error_msg) from rollback_error

            # Raise error to notify caller
            from core.session.transaction_coordinator import PersistenceError

            raise PersistenceError(f"Layer 2 write failed after retries: {error}")

        logger.debug(f"Layer 2 write succeeded: {len(role_items)} messages")

    async def validate_consistency(self) -> tuple[bool, str | None]:
        """Validate consistency between Layer 1 and Layer 2.

        Returns:
            Tuple of (is_consistent: bool, error: str | None)
        """
        if not self.full_history_store:
            return True, None

        # Get items from both layers
        layer1_items = await self.session.get_items()
        layer2_items = self.full_history_store.get_messages(self.session_id)

        # Use transaction coordinator for consistency check
        result: tuple[bool, str | None] = self._transaction_coordinator.validate_consistency(
            layer1_items, layer2_items, self.session_id
        )
        return result
