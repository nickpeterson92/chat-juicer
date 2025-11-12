"""Tests for transaction coordinator.

Tests TransactionCoordinator for atomic dual-layer persistence with rollback.
"""

from __future__ import annotations

from unittest.mock import Mock

import pytest

from core.session.transaction_coordinator import (
    CorruptionError,
    DiskFullError,
    Layer2Error,
    PermissionError,
    PersistenceError,
    TransactionCoordinator,
)


class TestTransactionCoordinator:
    """Tests for TransactionCoordinator."""

    def test_initialization(self) -> None:
        """Test coordinator initialization with default values."""
        coordinator = TransactionCoordinator()
        assert coordinator.max_retries == 3
        assert coordinator.initial_backoff == 0.1
        assert coordinator.backoff_multiplier == 2.0

    def test_initialization_custom_values(self) -> None:
        """Test coordinator initialization with custom values."""
        coordinator = TransactionCoordinator(
            max_retries=5,
            initial_backoff=0.5,
            backoff_multiplier=3.0,
        )
        assert coordinator.max_retries == 5
        assert coordinator.initial_backoff == 0.5
        assert coordinator.backoff_multiplier == 3.0

    @pytest.mark.asyncio
    async def test_retry_with_backoff_success_first_attempt(self) -> None:
        """Test successful operation on first attempt."""
        coordinator = TransactionCoordinator()
        operation = Mock(return_value=None)

        success, error = await coordinator._retry_with_backoff(
            operation,
            "test operation",
        )

        assert success is True
        assert error is None
        assert operation.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_with_backoff_success_after_retries(self) -> None:
        """Test successful operation after transient failures."""
        coordinator = TransactionCoordinator(
            max_retries=3,
            initial_backoff=0.01,  # Fast for testing
        )

        # Fail twice, succeed on third attempt
        call_count = 0

        def operation() -> None:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("Transient failure")

        success, error = await coordinator._retry_with_backoff(
            operation,
            "test operation",
        )

        assert success is True
        assert error is None
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retry_with_backoff_failure_max_retries(self) -> None:
        """Test operation fails after max retries."""
        coordinator = TransactionCoordinator(
            max_retries=3,
            initial_backoff=0.01,  # Fast for testing
        )

        operation = Mock(side_effect=RuntimeError("Permanent failure"))

        success, error = await coordinator._retry_with_backoff(
            operation,
            "test operation",
        )

        assert success is False
        assert error is not None
        assert "failed after 3 attempts" in error
        assert operation.call_count == 3

    @pytest.mark.asyncio
    async def test_write_with_rollback_both_succeed(self) -> None:
        """Test successful write to both layers."""
        coordinator = TransactionCoordinator()

        layer1_write = Mock(return_value=None)
        layer2_write = Mock(return_value=None)
        layer1_rollback = Mock(return_value=None)

        success, error = await coordinator.write_with_rollback(
            layer1_write,
            layer2_write,
            layer1_rollback,
            "test_session",
        )

        assert success is True
        assert error is None
        assert layer1_write.call_count == 1
        assert layer2_write.call_count >= 1  # May be called multiple times in retry
        assert layer1_rollback.call_count == 0  # No rollback needed

    @pytest.mark.asyncio
    async def test_write_with_rollback_layer1_fails(self) -> None:
        """Test Layer 1 write failure raises exception."""
        coordinator = TransactionCoordinator()

        layer1_write = Mock(side_effect=RuntimeError("Layer 1 failure"))
        layer2_write = Mock(return_value=None)
        layer1_rollback = Mock(return_value=None)

        with pytest.raises(PersistenceError) as exc_info:
            await coordinator.write_with_rollback(
                layer1_write,
                layer2_write,
                layer1_rollback,
                "test_session",
            )

        assert "Layer 1 write failed" in str(exc_info.value)
        assert layer1_write.call_count == 1
        assert layer2_write.call_count == 0  # Never reached
        assert layer1_rollback.call_count == 0  # No rollback needed

    @pytest.mark.asyncio
    async def test_write_with_rollback_layer2_fails_rollback_succeeds(self) -> None:
        """Test Layer 2 failure triggers successful rollback."""
        coordinator = TransactionCoordinator(
            max_retries=2,
            initial_backoff=0.01,
        )

        layer1_write = Mock(return_value=None)
        layer2_write = Mock(side_effect=RuntimeError("Layer 2 failure"))
        layer1_rollback = Mock(return_value=None)

        success, error = await coordinator.write_with_rollback(
            layer1_write,
            layer2_write,
            layer1_rollback,
            "test_session",
        )

        assert success is False
        assert error is not None
        assert "failed after 2 attempts" in error
        assert layer1_write.call_count == 1
        assert layer2_write.call_count == 2  # Retried once
        assert layer1_rollback.call_count == 1  # Rollback executed

    @pytest.mark.asyncio
    async def test_write_with_rollback_both_fail_critical(self) -> None:
        """Test critical inconsistency when both Layer 2 and rollback fail."""
        coordinator = TransactionCoordinator(
            max_retries=2,
            initial_backoff=0.01,
        )

        layer1_write = Mock(return_value=None)
        layer2_write = Mock(side_effect=RuntimeError("Layer 2 failure"))
        layer1_rollback = Mock(side_effect=RuntimeError("Rollback failure"))

        success, error = await coordinator.write_with_rollback(
            layer1_write,
            layer2_write,
            layer1_rollback,
            "test_session",
        )

        assert success is False
        assert error is not None
        assert "CRITICAL INCONSISTENCY" in error
        assert "Layer 2 failure" in error
        assert "Rollback failure" in error
        assert layer1_write.call_count == 1
        assert layer2_write.call_count == 2
        assert layer1_rollback.call_count == 1

    def test_validate_consistency_consistent(self) -> None:
        """Test consistency validation with consistent layers."""
        coordinator = TransactionCoordinator()

        layer1_items = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
        ]
        layer2_items = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
            {"role": "user", "content": "How are you?"},
        ]

        is_consistent, error = coordinator.validate_consistency(
            layer1_items,
            layer2_items,
            "test_session",
        )

        assert is_consistent is True
        assert error is None

    def test_validate_consistency_inconsistent(self) -> None:
        """Test consistency validation detects inconsistency."""
        coordinator = TransactionCoordinator()

        layer1_items = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
            {"role": "user", "content": "How are you?"},
        ]
        layer2_items = [
            {"role": "user", "content": "Hello"},
        ]

        is_consistent, error = coordinator.validate_consistency(
            layer1_items,
            layer2_items,
            "test_session",
        )

        assert is_consistent is False
        assert error is not None
        assert "INCONSISTENCY DETECTED" in error
        assert "Layer 2 has 1 items but Layer 1 has 3 items" in error

    def test_validate_consistency_equal_items(self) -> None:
        """Test consistency validation with equal items."""
        coordinator = TransactionCoordinator()

        items = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
        ]

        is_consistent, error = coordinator.validate_consistency(
            items,
            items,
            "test_session",
        )

        assert is_consistent is True
        assert error is None

    def test_validate_consistency_empty_layers(self) -> None:
        """Test consistency validation with empty layers."""
        coordinator = TransactionCoordinator()

        is_consistent, error = coordinator.validate_consistency(
            [],
            [],
            "test_session",
        )

        assert is_consistent is True
        assert error is None


class TestExceptionHierarchy:
    """Tests for exception hierarchy."""

    def test_persistence_error_base(self) -> None:
        """Test PersistenceError is base exception."""
        error = PersistenceError("test error")
        assert isinstance(error, Exception)
        assert str(error) == "test error"

    def test_layer2_error_inherits_persistence_error(self) -> None:
        """Test Layer2Error inherits from PersistenceError."""
        error = Layer2Error("test error")
        assert isinstance(error, PersistenceError)
        assert isinstance(error, Exception)

    def test_disk_full_error_inherits_layer2_error(self) -> None:
        """Test DiskFullError inherits from Layer2Error."""
        error = DiskFullError("disk full")
        assert isinstance(error, Layer2Error)
        assert isinstance(error, PersistenceError)

    def test_permission_error_inherits_layer2_error(self) -> None:
        """Test PermissionError inherits from Layer2Error."""
        error = PermissionError("permission denied")
        assert isinstance(error, Layer2Error)
        assert isinstance(error, PersistenceError)

    def test_corruption_error_inherits_layer2_error(self) -> None:
        """Test CorruptionError inherits from Layer2Error."""
        error = CorruptionError("corrupted database")
        assert isinstance(error, Layer2Error)
        assert isinstance(error, PersistenceError)


class TestRetryBackoffTiming:
    """Tests for exponential backoff timing."""

    @pytest.mark.asyncio
    async def test_exponential_backoff_timing(self) -> None:
        """Test exponential backoff increases delay."""
        coordinator = TransactionCoordinator(
            max_retries=3,
            initial_backoff=0.01,
            backoff_multiplier=2.0,
        )

        import time

        call_times: list[float] = []

        def operation() -> None:
            call_times.append(time.time())
            raise RuntimeError("Always fail")

        success, _error = await coordinator._retry_with_backoff(
            operation,
            "test operation",
        )

        assert success is False
        assert len(call_times) == 3

        # Check delays between calls (approximately exponential)
        delay1 = call_times[1] - call_times[0]
        delay2 = call_times[2] - call_times[1]

        # First delay should be ~0.01s, second ~0.02s
        # Allow for timing variance
        assert 0.005 < delay1 < 0.03
        assert 0.01 < delay2 < 0.05
        assert delay2 > delay1  # Second delay should be longer
