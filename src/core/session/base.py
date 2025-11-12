"""Core TokenAwareSQLiteSession with component delegation."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agents import Agent, Runner, RunResultStreaming, SQLiteSession

from core.constants import CHAT_HISTORY_DB_PATH, DEFAULT_MODEL, MODEL_TOKEN_LIMITS
from core.session_manager import SessionManager
from models.session_models import FullHistoryProtocol
from utils.logger import logger

from .persistence import PersistenceCoordinator
from .summarization import SummarizationOrchestrator
from .token_tracking import TokenTracker


class TokenAwareSQLiteSession(SQLiteSession):
    """Token-aware session with automatic summarization.

    Delegates specialized tasks to component classes:
    - TokenTracker: Token counting and threshold management
    - PersistenceCoordinator: Dual-layer persistence (Layer 1 + Layer 2)
    - SummarizationOrchestrator: Summary workflow orchestration

    This class serves as the public API and coordinates high-level workflows.
    """

    def __init__(
        self,
        session_id: str,
        db_path: str | Path | None = CHAT_HISTORY_DB_PATH,
        agent: Agent | None = None,
        model: str = DEFAULT_MODEL,
        threshold: float = 0.8,
        full_history_store: FullHistoryProtocol | None = None,
        session_manager: SessionManager | None = None,
    ):
        """Initialize token-aware session with component delegation.

        Args:
            session_id: Unique identifier
            db_path: SQLite database path (None for in-memory)
            agent: Agent instance for summarization
            model: Model name for token counting
            threshold: Summarization trigger threshold (0.0-1.0)
            full_history_store: Layer 2 storage for complete history
            session_manager: Session metadata manager
        """
        # Initialize parent SQLiteSession
        super().__init__(session_id, db_path if db_path is not None else ":memory:")

        # Store references
        self.agent = agent
        self.model = model
        self.threshold = threshold
        self.full_history_store = full_history_store
        self.session_manager = session_manager

        # Initialize delegated components
        max_tokens = self._get_model_limit(model)

        self.token_tracker = TokenTracker(model, max_tokens, threshold)

        self.persistence = PersistenceCoordinator(
            session_id,
            full_history_store,
            self,  # Pass reference for parent SQLiteSession methods
        )

        self.summarizer = SummarizationOrchestrator(
            session_id,
            agent,
            self,
            full_history_store,
            session_manager,
        )

        logger.info(
            f"TokenAwareSQLiteSession initialized: "
            f"session_id={session_id}, model={model}, "
            f"max_tokens={max_tokens}, trigger_at={self.token_tracker.trigger_tokens}"
        )

    def _get_model_limit(self, model: str) -> int:
        """Get token limit for model."""
        # Check exact match first
        if model in MODEL_TOKEN_LIMITS:
            limit: int = MODEL_TOKEN_LIMITS[model]
            return limit

        # Check if model contains a known base model name
        for known_model, model_limit in MODEL_TOKEN_LIMITS.items():
            if known_model in model.lower():
                limit_value: int = model_limit
                return limit_value

        # Default conservative limit
        logger.warning(f"Unknown model {model}, using conservative 15k limit")
        return 15000

    # Delegation methods - clean and simple

    async def add_items(self, items: Any) -> None:
        """Save items to both persistence layers with safeguards."""
        await self.persistence.save_items(items)

    async def should_summarize(self) -> bool:
        """Check if summarization threshold reached."""
        return self.token_tracker.should_summarize()

    async def summarize_with_agent(self, keep_recent: int = 2, force: bool = False) -> str:
        """Trigger summarization workflow."""
        return await self.summarizer.summarize(keep_recent, force)

    def update_with_tool_tokens(self, tool_tokens: int) -> None:
        """Add tokens from tool calls to total count."""
        self.token_tracker.update_with_tool_tokens(tool_tokens)
        logger.info(
            f"Added {tool_tokens} tool tokens. "
            f"Total: {self.token_tracker.total_tokens}/"
            f"{self.token_tracker.trigger_tokens}"
        )

    async def run_with_auto_summary(self, agent: Agent, user_input: str, **kwargs: Any) -> RunResultStreaming:
        """Run agent with automatic pre-check summarization.

        Convenience method that checks tokens before running
        and triggers summarization if needed.
        """
        if await self.should_summarize():
            logger.info("Triggering summarization before processing input")
            await self.summarize_with_agent()

        # Run with fresh context
        result = Runner.run_streamed(agent, user_input, session=self, **kwargs)
        return result

    async def delete_storage(self) -> bool:
        """Delete all Layer 1 (LLM context) storage for this session.

        This method encapsulates the SQL table deletion logic that should not
        be exposed to higher-level code. Use only when permanently deleting a session.

        CRITICAL FIX: OpenAI Agents SDK uses SHARED tables (agent_sessions, agent_messages)
        with foreign keys, NOT per-session tables. We must delete from agent_sessions,
        which triggers CASCADE delete of agent_messages via foreign key constraint.

        Note: This only deletes Layer 1 storage. Layer 2 (full_history_store)
        should be cleaned separately via full_history_store.clear_session().

        Returns:
            True if deletion succeeded, False otherwise
        """
        try:
            import sqlite3

            # Get db_path from parent SQLiteSession
            db_path = self.db_path if self.db_path != ":memory:" else None

            if not db_path:
                logger.info(f"Session {self.session_id} uses in-memory storage, nothing to delete")
                return True

            with sqlite3.connect(db_path) as conn:
                # CRITICAL: Enable foreign key constraints (disabled by default in SQLite)
                # Without this, ON DELETE CASCADE won't work!
                conn.execute("PRAGMA foreign_keys = ON;")

                # CORRECT: Delete from shared agent_sessions table (FK CASCADE handles agent_messages)
                # The schema has: FOREIGN KEY (session_id) REFERENCES agent_sessions (session_id) ON DELETE CASCADE
                cursor = conn.execute(
                    "DELETE FROM agent_sessions WHERE session_id = ?",
                    (self.session_id,),
                )
                deleted_count = cursor.rowcount

                # Also verify agent_messages were cascaded (should be 0 remaining)
                cursor = conn.execute(
                    "SELECT COUNT(*) FROM agent_messages WHERE session_id = ?",
                    (self.session_id,),
                )
                remaining_messages = cursor.fetchone()[0]

                conn.commit()

            logger.info(
                f"Deleted Layer 1 storage for session {self.session_id}: "
                f"{deleted_count} session record(s), {remaining_messages} remaining messages (expected 0)"
            )

            if remaining_messages > 0:
                logger.warning(
                    f"CASCADE delete may have failed: {remaining_messages} messages still exist for {self.session_id}"
                )
                return False

            return True

        except Exception as e:
            logger.error(
                f"Failed to delete Layer 1 storage for session {self.session_id}: {e}",
                exc_info=True,
            )
            return False

    # Expose internal state for backward compatibility

    @property
    def total_tokens(self) -> int:
        """Expose total_tokens from token_tracker."""
        return self.token_tracker.total_tokens

    @total_tokens.setter
    def total_tokens(self, value: int) -> None:
        """Allow direct token count updates."""
        self.token_tracker.total_tokens = value

    @property
    def accumulated_tool_tokens(self) -> int:
        """Expose accumulated_tool_tokens from token_tracker."""
        return self.token_tracker.accumulated_tool_tokens

    @accumulated_tool_tokens.setter
    def accumulated_tool_tokens(self, value: int) -> None:
        """Allow direct tool token updates."""
        self.token_tracker.accumulated_tool_tokens = value

    # Internal methods needed by coordinators (backward compatibility)

    def _calculate_total_tokens(self, items: Any) -> int:
        """Calculate tokens for items (backward compatibility)."""
        return self.token_tracker.calculate_total_tokens(items)

    def calculate_items_tokens(self, items: Any) -> int:
        """Public method to calculate tokens (backward compatibility)."""
        return self.token_tracker.calculate_total_tokens(items)

    def _count_item_tokens(self, item: dict[str, Any]) -> int:
        """Count tokens for a single item (backward compatibility)."""
        return self.token_tracker.count_item_tokens(item)

    def _collect_recent_exchanges(self, items: Any, keep_recent: int) -> Any:
        """Collect recent exchanges (backward compatibility)."""
        from .exchange_collector import ExchangeCollector

        return ExchangeCollector.collect_recent_exchanges(items, keep_recent)

    def _skip_full_history_context(self) -> Any:
        """Context manager for skipping full history (backward compatibility)."""
        return self.persistence.skip_full_history_context()

    @property
    def _skip_full_history(self) -> bool:
        """Expose _skip_full_history flag (backward compatibility)."""
        return self.persistence._skip_full_history

    @property
    def trigger_tokens(self) -> int:
        """Expose trigger_tokens (backward compatibility)."""
        return self.token_tracker.trigger_tokens

    @trigger_tokens.setter
    def trigger_tokens(self, value: int) -> None:
        """Allow direct trigger_tokens updates (backward compatibility for tests)."""
        self.token_tracker.trigger_tokens = value

    @property
    def max_tokens(self) -> int:
        """Expose max_tokens (backward compatibility)."""
        return self.token_tracker.max_tokens

    @max_tokens.setter
    def max_tokens(self, value: int) -> None:
        """Allow direct max_tokens updates (backward compatibility for tests)."""
        self.token_tracker.max_tokens = value
