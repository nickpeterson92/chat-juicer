"""Transaction coordinator for dual-layer persistence.

Provides atomic writes across Layer 1 (LLM context) and Layer 2 (UI display)
with rollback capabilities and retry logic for transient failures.
"""

from __future__ import annotations

import asyncio

from collections.abc import Callable
from typing import Any

from utils.logger import logger


class PersistenceError(Exception):
    """Base exception for persistence errors."""

    pass


class Layer2Error(PersistenceError):
    """Layer 2 (full history) persistence failure."""

    pass


class DiskFullError(Layer2Error):
    """Disk full error during Layer 2 write."""

    pass


class PermissionError(Layer2Error):
    """Permission denied during Layer 2 write."""

    pass


class CorruptionError(Layer2Error):
    """Data corruption detected in Layer 2."""

    pass


class TransactionCoordinator:
    """Coordinates atomic writes across Layer 1 and Layer 2 with rollback.

    Implements exponential backoff retry logic for transient failures and
    provides rollback mechanism to maintain consistency between layers.
    """

    def __init__(
        self,
        max_retries: int = 3,
        initial_backoff: float = 0.1,
        backoff_multiplier: float = 2.0,
    ):
        """Initialize transaction coordinator.

        Args:
            max_retries: Maximum retry attempts for transient failures
            initial_backoff: Initial backoff delay in seconds
            backoff_multiplier: Backoff multiplier for exponential backoff
        """
        self.max_retries = max_retries
        self.initial_backoff = initial_backoff
        self.backoff_multiplier = backoff_multiplier

    async def _retry_with_backoff(
        self,
        operation: Callable[[], Any],
        operation_name: str,
    ) -> tuple[bool, str | None]:
        """Retry operation with exponential backoff.

        Args:
            operation: Callable operation to retry
            operation_name: Human-readable operation name for logging

        Returns:
            Tuple of (success: bool, error: str | None)
        """
        backoff = self.initial_backoff

        for attempt in range(self.max_retries):
            try:
                operation()
                return True, None
            except Exception as e:  # noqa: PERF203 - Necessary for retry logic
                logger.warning(f"{operation_name} failed (attempt {attempt + 1}/{self.max_retries}): {e}")

                # Last attempt - give up
                if attempt == self.max_retries - 1:
                    error_msg = f"{operation_name} failed after {self.max_retries} attempts: {e}"
                    logger.error(error_msg, exc_info=True)
                    return False, error_msg

                # Wait before retry with exponential backoff
                await asyncio.sleep(backoff)
                backoff *= self.backoff_multiplier

        return False, "Max retries exceeded"

    async def write_with_rollback(
        self,
        layer1_write: Callable[[], Any],
        layer2_write: Callable[[], Any],
        layer1_rollback: Callable[[], Any],
        session_id: str,
    ) -> tuple[bool, str | None]:
        """Execute both writes with rollback on Layer 2 failure.

        Transaction sequence:
        1. Save Layer 1 state for potential rollback
        2. Execute Layer 1 write
        3. Execute Layer 2 write with retry logic
        4. If Layer 2 fails after retries, rollback Layer 1
        5. Return success status and error message

        Args:
            layer1_write: Callable for Layer 1 write operation
            layer2_write: Callable for Layer 2 write operation
            layer1_rollback: Callable to rollback Layer 1 on Layer 2 failure
            session_id: Session identifier for logging

        Returns:
            Tuple of (success: bool, error: str | None)

        Raises:
            PersistenceError: If Layer 1 write fails (unrecoverable)
        """
        logger.debug(f"Starting transactional write for session {session_id}")

        # Step 1: Execute Layer 1 write (critical path)
        try:
            layer1_write()
            logger.debug(f"Layer 1 write succeeded for session {session_id}")
        except Exception as e:
            error_msg = f"CRITICAL: Layer 1 write failed for session {session_id}: {e}"
            logger.error(error_msg, exc_info=True)
            raise PersistenceError(error_msg) from e

        # Step 2: Execute Layer 2 write with retry logic
        layer2_success, layer2_error = await self._retry_with_backoff(
            layer2_write,
            f"Layer 2 write for session {session_id}",
        )

        if not layer2_success:
            # Layer 2 failed after retries - attempt rollback
            logger.error(f"Layer 2 write failed for session {session_id}, attempting rollback")

            try:
                layer1_rollback()
                logger.info(f"Layer 1 rollback succeeded for session {session_id}")
            except Exception as rollback_error:
                # Rollback failed - this is a critical inconsistency
                error_msg = (
                    f"CRITICAL INCONSISTENCY: Layer 2 write failed AND rollback failed "
                    f"for session {session_id}. Layer 1 may contain orphaned data. "
                    f"Layer 2 error: {layer2_error}, Rollback error: {rollback_error}"
                )
                logger.error(error_msg, exc_info=True)
                return False, error_msg

            # Rollback succeeded - consistent state restored
            return False, f"Layer 2 write failed after {self.max_retries} retries: {layer2_error}"

        # Both layers succeeded
        logger.debug(f"Transactional write succeeded for session {session_id}")
        return True, None

    def validate_consistency(
        self,
        layer1_items: list[dict[str, Any]],
        layer2_items: list[dict[str, Any]],
        session_id: str,
    ) -> tuple[bool, str | None]:
        """Validate consistency between Layer 1 and Layer 2.

        Checks that Layer 2 contains at least as many items as Layer 1
        (Layer 2 may have more due to trimming in Layer 1).

        Args:
            layer1_items: Items from Layer 1 (LLM context)
            layer2_items: Items from Layer 2 (full history)
            session_id: Session identifier for logging

        Returns:
            Tuple of (is_consistent: bool, error: str | None)
        """
        layer1_count = len(layer1_items)
        layer2_count = len(layer2_items)

        # Layer 2 should have at least as many items as Layer 1
        # (Layer 1 may be trimmed due to summarization)
        if layer2_count < layer1_count:
            error_msg = (
                f"INCONSISTENCY DETECTED in session {session_id}: "
                f"Layer 2 has {layer2_count} items but Layer 1 has {layer1_count} items. "
                f"Layer 2 should never have fewer items than Layer 1."
            )
            logger.error(error_msg)
            return False, error_msg

        logger.debug(
            f"Consistency check passed for session {session_id}: "
            f"Layer 1={layer1_count} items, Layer 2={layer2_count} items"
        )
        return True, None
