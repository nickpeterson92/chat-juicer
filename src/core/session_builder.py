"""Fluent builder for TokenAwareSQLiteSession construction.

This module provides a clean, self-documenting API for constructing sessions
with various configurations. Extracted from the session package consolidation
for improved maintainability.

Usage patterns:
    - Production: Full configuration with all dependencies
    - Testing: Minimal configuration with in-memory storage
    - Deletion: Basic configuration for cleanup operations
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agents import Agent

from core.constants import CHAT_HISTORY_DB_PATH, DEFAULT_MODEL
from core.session_manager import SessionManager
from models.session_models import FullHistoryProtocol


class SessionBuilder:
    """Fluent builder for TokenAwareSQLiteSession construction.

    Provides a clear, self-documenting way to construct sessions with various configurations.

    Examples:
        # Production usage
        session = (SessionBuilder("chat_123")
            .with_persistent_storage(CHAT_HISTORY_DB_PATH)
            .with_agent(app_state.agent)
            .with_model(app_state.deployment)
            .with_full_history(app_state.full_history_store)
            .with_session_manager(app_state.session_manager)
            .build())

        # Testing usage
        session = (SessionBuilder("test_session")
            .with_in_memory_storage()
            .with_model("gpt-4o")
            .build())

        # Deletion usage
        session = (SessionBuilder("chat_abc")
            .with_persistent_storage(CHAT_HISTORY_DB_PATH)
            .build())
    """

    def __init__(self, session_id: str) -> None:
        """Initialize builder with required session_id.

        Args:
            session_id: Unique identifier for the session

        Raises:
            ValueError: If session_id is empty
        """
        if not session_id:
            raise ValueError("session_id is required")

        self._session_id = session_id
        # Set defaults matching TokenAwareSQLiteSession constructor
        self._db_path: str | Path | None = CHAT_HISTORY_DB_PATH
        self._agent: Agent | None = None
        self._model: str = DEFAULT_MODEL
        self._threshold: float = 0.8
        self._full_history_store: FullHistoryProtocol | None = None
        self._session_manager: SessionManager | None = None

    def with_persistent_storage(self, db_path: str | Path) -> SessionBuilder:
        """Configure persistent SQLite storage.

        Args:
            db_path: Path to SQLite database file

        Returns:
            Self for method chaining
        """
        self._db_path = db_path
        return self

    def with_in_memory_storage(self) -> SessionBuilder:
        """Configure in-memory SQLite storage (for testing).

        Returns:
            Self for method chaining
        """
        self._db_path = None
        return self

    def with_agent(self, agent: Agent) -> SessionBuilder:
        """Configure agent for automatic summarization.

        Args:
            agent: Agent instance from agents SDK

        Returns:
            Self for method chaining
        """
        self._agent = agent
        return self

    def with_model(self, model: str) -> SessionBuilder:
        """Configure model for token counting.

        Args:
            model: Model name (e.g., "gpt-4o", "gpt-5-mini")

        Returns:
            Self for method chaining

        Raises:
            ValueError: If model is empty
        """
        if not model:
            raise ValueError("model cannot be empty")
        self._model = model
        return self

    def with_threshold(self, threshold: float) -> SessionBuilder:
        """Configure summarization threshold.

        Args:
            threshold: Fraction of token limit to trigger summarization (0.0-1.0)
                      e.g., 0.8 means summarize at 80% of model's token limit

        Returns:
            Self for method chaining

        Raises:
            ValueError: If threshold not in valid range
        """
        if not 0.0 < threshold <= 1.0:
            raise ValueError(f"Threshold must be between 0 and 1, got {threshold}")
        self._threshold = threshold
        return self

    def with_full_history(self, store: FullHistoryProtocol) -> SessionBuilder:
        """Configure Layer 2 full history storage.

        Args:
            store: FullHistoryStore instance for complete conversation history

        Returns:
            Self for method chaining
        """
        self._full_history_store = store
        return self

    def with_session_manager(self, manager: SessionManager) -> SessionBuilder:
        """Configure session metadata management.

        Args:
            manager: SessionManager instance for metadata persistence

        Returns:
            Self for method chaining
        """
        self._session_manager = manager
        return self

    def build(self) -> Any:  # Returns TokenAwareSQLiteSession
        """Construct the configured TokenAwareSQLiteSession.

        Returns:
            Fully configured session instance

        Raises:
            ValueError: If configuration is invalid
        """
        # Import here to avoid circular dependency
        from core.session import TokenAwareSQLiteSession

        return TokenAwareSQLiteSession(
            session_id=self._session_id,
            db_path=self._db_path,
            agent=self._agent,
            model=self._model,
            threshold=self._threshold,
            full_history_store=self._full_history_store,
            session_manager=self._session_manager,
        )
