"""
Token-aware session management using SDK's built-in SQLiteSession.
Extends the SDK's session management with automatic token-based summarization.
"""

from __future__ import annotations

import asyncio
import uuid

from collections.abc import Generator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any, cast

from agents import Agent, Runner, RunResultStreaming, SQLiteSession, TResponseInputItem

from core.constants import (
    CHAT_HISTORY_DB_PATH,
    DEFAULT_MODEL,
    KEEP_LAST_N_MESSAGES,
    MESSAGE_STRUCTURE_TOKEN_OVERHEAD,
    MIN_MESSAGES_FOR_SUMMARIZATION,
    MODEL_TOKEN_LIMITS,
)
from core.session_manager import SessionManager
from models.event_models import FunctionEventMessage
from models.session_models import FullHistoryProtocol, SessionUpdate
from utils.json_utils import json_compact
from utils.logger import logger
from utils.token_utils import count_tokens


class SessionBuilder:
    """Fluent builder for TokenAwareSQLiteSession construction.

    Provides a clear, self-documenting way to construct sessions with various configurations.
    Supports three main usage patterns:
    - Production: Full configuration with all dependencies
    - Testing: Minimal configuration with in-memory storage
    - Deletion: Basic configuration for cleanup operations

    Example:
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

    def build(self) -> TokenAwareSQLiteSession:
        """Construct the configured TokenAwareSQLiteSession.

        Returns:
            Fully configured session instance

        Raises:
            ValueError: If configuration is invalid
        """
        return TokenAwareSQLiteSession(
            session_id=self._session_id,
            db_path=self._db_path,
            agent=self._agent,
            model=self._model,
            threshold=self._threshold,
            full_history_store=self._full_history_store,
            session_manager=self._session_manager,
        )


class TokenAwareSQLiteSession(SQLiteSession):
    """Extends SQLiteSession with automatic token-based summarization."""

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
        """Initialize token-aware session built on SQLiteSession.

        Args:
            session_id: Unique identifier for the session
            db_path: Path to SQLite database (default from constants, None for in-memory)
            agent: The Agent instance for summarization
            model: Model name for token counting
            threshold: Trigger summarization at this fraction of token limit (0.8 = 80%)
            full_history_store: Optional FullHistoryStore for Layer 2 complete conversation history
            session_manager: Optional SessionManager for metadata updates after summarization
        """
        # Initialize parent SQLiteSession - use ":memory:" if explicitly None
        super().__init__(session_id, db_path if db_path is not None else ":memory:")

        self.agent = agent
        self.model = model
        self.threshold = threshold
        self.full_history_store = full_history_store
        self.session_manager = session_manager

        # Get token limit for model
        self.max_tokens = self._get_model_limit()
        self.trigger_tokens = int(self.max_tokens * threshold)

        # Track tokens (calculated from session items)
        self.total_tokens = 0
        # Track accumulated tool tokens separately (not stored in session items)
        self.accumulated_tool_tokens = 0

        # Incremental token tracking cache - cache tokens by item ID to avoid recalculation
        self._item_token_cache: dict[str, int] = {}

        # Async lock to prevent concurrent summarizations
        self._summarization_lock = asyncio.Lock()

        # Context flag to skip full_history save during summarization repopulation
        self._skip_full_history = False

        logger.info(
            f"TokenAwareSQLiteSession initialized: session_id={session_id}, "
            f"model={model}, max_tokens={self.max_tokens}, "
            f"trigger_at={self.trigger_tokens}, "
            f"full_history_enabled={full_history_store is not None}"
        )

    @contextmanager
    def _skip_full_history_context(self) -> Generator[None, None, None]:
        """Context manager for safely skipping full history saves during repopulation.

        This ensures the flag is properly reset even if an exception occurs,
        preventing the flag from getting stuck in the wrong state.

        Yields:
            None
        """
        old_value = self._skip_full_history
        self._skip_full_history = True
        try:
            yield
        finally:
            self._skip_full_history = old_value

    def _get_model_limit(self) -> int:
        """Get token limit for the current model."""
        # Check exact match first
        if self.model in MODEL_TOKEN_LIMITS:
            limit: int = MODEL_TOKEN_LIMITS[self.model]
            return limit

        # Check if model contains a known base model name
        for known_model, model_limit in MODEL_TOKEN_LIMITS.items():
            if known_model in self.model.lower():
                limit_value: int = model_limit
                return limit_value

        # Default conservative limit
        logger.warning(f"Unknown model {self.model}, using conservative 15k limit")
        return 15000

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using the model's tokenizer."""
        result = count_tokens(text, self.model)
        return int(result["exact_tokens"])  # Ensure return type is int

    def _count_item_tokens(self, item: dict[str, Any]) -> int:
        """Count tokens for a single item (extracted for caching).

        Args:
            item: Single conversation item

        Returns:
            Token count for this item
        """
        item_tokens: int = 0

        # Handle different content types
        content = item.get("content", "")

        # Regular text content (user/assistant messages)
        if isinstance(content, str):
            item_tokens += self._count_tokens(content)

        # Tool call results (stored as list of dicts or other formats)
        elif isinstance(content, list):
            # Tool results can be a list of content items
            for content_item in content:
                if isinstance(content_item, dict):
                    # Tool result with output
                    if "output" in content_item:
                        item_tokens += self._count_tokens(str(content_item["output"]))
                    # Tool result with text
                    elif "text" in content_item:
                        item_tokens += self._count_tokens(str(content_item["text"]))
                elif isinstance(content_item, str):
                    item_tokens += self._count_tokens(content_item)

        # Handle tool_calls field if present
        if item.get("tool_calls"):
            # Count tokens for tool call arguments
            for tool_call in item["tool_calls"]:
                if isinstance(tool_call, dict) and "function" in tool_call and "arguments" in tool_call["function"]:
                    item_tokens += self._count_tokens(str(tool_call["function"]["arguments"]))

        # Add small overhead for role and message structure
        item_tokens += MESSAGE_STRUCTURE_TOKEN_OVERHEAD

        return item_tokens

    def _calculate_total_tokens(self, items: Sequence[dict[str, Any] | TResponseInputItem]) -> int:
        """Calculate total tokens from conversation items with caching.

        Uses item ID cache to avoid recalculating tokens for unchanged items.
        Performance: O(n) first time, O(1) for cached items on subsequent calls.
        """
        total = 0
        for item in items:
            # Cast to dict for internal operations (runtime-compatible)
            item_dict = cast(dict[str, Any], item)

            # Try to use cached token count first
            item_id = item_dict.get("id")

            if item_id and item_id in self._item_token_cache:
                # Cache hit - use cached value
                total += self._item_token_cache[item_id]
            else:
                # Cache miss - calculate and cache
                item_tokens = self._count_item_tokens(item_dict)
                total += item_tokens

                # Cache for future use if item has ID
                if item_id:
                    self._item_token_cache[item_id] = item_tokens

        return total

    def calculate_items_tokens(self, items: Sequence[dict[str, Any] | TResponseInputItem]) -> int:
        """Public method to calculate total tokens from conversation items.

        Args:
            items: List of conversation items

        Returns:
            Total token count
        """
        return self._calculate_total_tokens(items)

    async def add_items(self, items: Any) -> None:
        """Override add_items to save to both Layer 1 (LLM context) and Layer 2 (full history).

        Layer 1 (SQLiteSession): Token-optimized LLM context, may be summarized
        Layer 2 (FullHistoryStore): Complete user-visible history, never trimmed

        CRITICAL SAFEGUARD: Prevents orphaned sessions by enforcing dual-layer writes.
        If full_history_store is None during normal operation, this is a configuration error.

        Args:
            items: List of conversation items to add

        Raises:
            RuntimeError: If full_history_store is None when not skipping (prevents orphaned sessions)
        """
        # SAFEGUARD: Enforce dual-layer persistence during normal operation
        # Only allow Layer 1-only writes during summarization repopulation (_skip_full_history=True)
        if not self._skip_full_history and not self.full_history_store:
            error_msg = (
                f"CRITICAL: Attempted to write to Layer 1 without Layer 2 for session {self.session_id}. "
                f"This would create an orphaned session. full_history_store must be configured."
            )
            logger.error(error_msg)
            raise RuntimeError(error_msg)

        # Save to Layer 1 (LLM context) - parent SQLiteSession
        await super().add_items(items)

        # Save to Layer 2 (full history) - only if not repopulating during summarization
        # Note: save_message handles its own errors (best-effort Layer 2)
        # Filter out SDK internal items (tool_call_item, reasoning_item, etc.) - only save chat messages
        if not self._skip_full_history and self.full_history_store:
            layer2_success_count = 0
            layer2_fail_count = 0

            for item in items:
                # Only save items with a 'role' field (user/assistant/system/tool messages)
                # Skip SDK internal items with 'type' field (tool_call_item, reasoning_item, etc.)
                if item.get("role"):
                    success = self.full_history_store.save_message(self.session_id, item)
                    if success:
                        layer2_success_count += 1
                    else:
                        layer2_fail_count += 1

            # Log Layer 2 save results for monitoring
            if layer2_fail_count > 0:
                logger.warning(
                    f"Layer 2 partial save for session {self.session_id}: "
                    f"{layer2_success_count} succeeded, {layer2_fail_count} failed"
                )
            elif layer2_success_count > 0:
                logger.debug(f"Layer 2 saved {layer2_success_count} messages for session {self.session_id}")

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
                cursor = conn.execute("DELETE FROM agent_sessions WHERE session_id = ?", (self.session_id,))
                deleted_count = cursor.rowcount

                # Also verify agent_messages were cascaded (should be 0 remaining)
                cursor = conn.execute("SELECT COUNT(*) FROM agent_messages WHERE session_id = ?", (self.session_id,))
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
            logger.error(f"Failed to delete Layer 1 storage for session {self.session_id}: {e}", exc_info=True)
            return False

    def _collect_recent_exchanges(self, items: list[TResponseInputItem], keep_recent: int) -> list[TResponseInputItem]:
        """Collect the most recent complete user-assistant exchanges.

        Optimized with reverse scan and early termination - stops when enough exchanges found.
        Performance: O(k) where k is items needed, vs O(n) for all items.

        Args:
            items: List of conversation items
            keep_recent: Number of recent user messages to keep

        Returns:
            List of items representing the most recent exchanges
        """
        if not items or keep_recent <= 0:
            logger.info(f"_collect_recent_exchanges: No items or keep_recent={keep_recent}")
            return []

        # Scan backwards to find recent exchanges with early exit
        exchanges_found = 0
        result_indices = []
        pending_assistant_idx = None

        # Reverse iteration with early termination
        for i in range(len(items) - 1, -1, -1):
            item = items[i]
            role = item.get("role")

            # Skip tool results but NOT assistant messages with tool_calls
            if role == "tool":
                continue

            if role == "assistant":
                pending_assistant_idx = i  # Potential end of exchange

            elif role == "user" and pending_assistant_idx is not None:
                # Complete exchange found (user followed by assistant)
                result_indices.append((i, pending_assistant_idx))
                pending_assistant_idx = None
                exchanges_found += 1

                # EARLY EXIT: Stop when we have enough exchanges
                if exchanges_found >= keep_recent:
                    logger.info(f"Early exit after scanning {len(items) - i} items (found {exchanges_found} exchanges)")
                    break

        # Handle orphaned assistant message at the end (if we haven't exited early)
        if pending_assistant_idx is not None and exchanges_found < keep_recent:
            result_indices.append((pending_assistant_idx, pending_assistant_idx))
            exchanges_found += 1

        # Reverse to restore chronological order
        result_indices.reverse()

        logger.info(f"Found {exchanges_found} exchanges, scanned from end")

        # Extract items from stored indices (only user/assistant, skip tool/reasoning)
        result = [
            items[i]
            for start_idx, end_idx in result_indices
            for i in range(start_idx, end_idx + 1)
            if items[i].get("role") in ["user", "assistant"]
        ]

        logger.info(f"Returning {len(result)} recent items from {len(items)} total items")
        return result

    async def should_summarize(self) -> bool:
        """Check if summarization should be triggered based on token count.

        Note: This uses the current total_tokens which may include tool tokens
        that were added via update_with_tool_tokens().
        """
        # Don't recalculate from items - use the current total which includes tool tokens
        should_trigger = self.total_tokens > self.trigger_tokens
        if should_trigger:
            logger.info(
                f"Token limit approaching ({self.total_tokens}/{self.trigger_tokens}), summarization recommended"
            )
        return should_trigger

    async def summarize_with_agent(self, keep_recent: int = KEEP_LAST_N_MESSAGES, force: bool = False) -> str:
        """Summarize conversation using the agent and update session.

        Args:
            keep_recent: Number of recent USER messages to keep unsummarized
                (default from KEEP_LAST_N_MESSAGES constant)
            force: If True, bypass threshold check for manual summarization

        Returns:
            The summary text
        """
        if not self.agent:
            raise ValueError("Agent required for summarization")

        # Try to acquire lock, skip if already held
        if self._summarization_lock.locked():
            logger.info("Summarization already in progress, skipping duplicate trigger")
            return ""

        async with self._summarization_lock:
            # Perform all validation checks
            summary_text = await self._perform_summarization(keep_recent, force)
            return summary_text

    async def _perform_summarization(self, keep_recent: int, force: bool = False) -> str:
        """Internal method to perform summarization with reduced complexity.

        Args:
            keep_recent: Number of recent USER messages to keep unsummarized
            force: If True, bypass threshold check for manual summarization

        Returns:
            The summary text or empty string if summarization not needed/failed
        """
        # Re-check tokens in case another summarization just finished (unless forced)
        if not force and self.total_tokens <= self.trigger_tokens:
            logger.info("Token count now below threshold after lock acquisition, skipping")
            return ""

        if force:
            logger.info(f"Manual summarization forced (current: {self.total_tokens}/{self.trigger_tokens} tokens)")

        items = await self.get_items()

        # Analyze items and their types for better understanding
        role_counts: dict[str, int] = {}
        item_types: dict[str, int] = {}
        for item in items:
            role = str(item.get("role", "unknown"))
            role_counts[role] = role_counts.get(role, 0) + 1

            # Count items without roles for summary logging
            if role == "unknown":
                item_type = str(item.get("type", "no_type"))
                item_types[item_type] = item_types.get(item_type, 0) + 1

                # Debug logging commented out - uncomment if needed for debugging
                # if item_types[item_type] <= 2:
                #     logger.info(f"Item #{i} type '{item_type}' keys: {list(item.keys())}")
                #     logger.info(f"  Full item: {json.dumps(item, default=str)[:500]}")

        logger.info(f"Summarization check: {len(items)} total items - Roles: {role_counts}, Types: {item_types}")

        if len(items) < MIN_MESSAGES_FOR_SUMMARIZATION:
            logger.warning(f"Not enough items to summarize (< {MIN_MESSAGES_FOR_SUMMARIZATION})")
            return ""

        # Prepare items for summarization (returns call_id and recent_items)
        call_id, recent_items = self._prepare_summary_items(items, keep_recent)
        logger.info(f"Recent items to keep: {len(recent_items)} out of {len(items)} total")

        # If nothing to summarize, don't proceed
        if not items or len(recent_items) == len(items):
            logger.warning(f"Aborting summarization: all {len(items)} items are recent, nothing to summarize")
            await self._emit_completion_event(
                call_id, success=False, error="All items are recent - nothing to summarize"
            )
            return ""

        try:
            # Generate the summary
            logger.info(f"Starting summarization of {len(items)} items with call_id: {call_id}")
            summary_text = await self._generate_summary_text(items)

            if not summary_text:
                logger.error("Summarization failed: empty summary returned")
                await self._emit_completion_event(call_id, success=False, error="Empty summary returned")
                return ""

            logger.info(f"Summary generated successfully ({len(summary_text)} chars)")

            # Update session with summary (pass call_id for completion event)
            await self._update_session_with_summary(summary_text, recent_items, call_id)

            return summary_text

        except Exception as e:
            logger.error(f"Summarization failed with error: {e}", exc_info=True)
            await self._emit_completion_event(call_id, success=False, error=str(e))
            return ""

    async def _emit_completion_event(
        self, call_id: str, success: bool = True, error: str | None = None, output: str | None = None
    ) -> None:
        """Emit a completion event to the frontend.

        Args:
            call_id: The call ID for matching with start event
            success: Whether the operation succeeded
            error: Error message if failed
            output: Output summary if succeeded
        """
        # Use Pydantic model for validation and serialization
        event = FunctionEventMessage(
            type="function_completed", call_id=call_id, success=success, error=error, output=output
        )

        msg = event.to_json()
        print(f"__JSON__{msg}__JSON__", flush=True)

    def _prepare_summary_items(
        self, items: list[TResponseInputItem], keep_recent: int
    ) -> tuple[str, list[TResponseInputItem]]:
        """Prepare recent items to keep after summarization.

        Args:
            items: All conversation items
            keep_recent: Number of recent user messages to keep

        Returns:
            Tuple of (call_id, list of recent items to preserve)
        """
        # Emit summarization start event for UI
        call_id = f"sum_{uuid.uuid4().hex[:8]}"
        msg = json_compact(
            {
                "type": "function_detected",
                "name": "summarize_conversation",
                "call_id": call_id,
                "arguments": json_compact(
                    {
                        "messages_count": len(items),
                        "tokens_before": self.total_tokens,
                        "threshold": self.trigger_tokens,
                    }
                ),
            }
        )
        print(f"__JSON__{msg}__JSON__", flush=True)

        # Keep only the last N user-assistant exchanges (no tool messages)
        # Tool calls and results are execution details that belong in the summary
        recent_items = self._collect_recent_exchanges(items, keep_recent)

        return call_id, recent_items

    async def _generate_summary_text(self, items: list[TResponseInputItem]) -> str:
        """Generate summary text from conversation items using Agent/Runner.

        Uses the Responses API (via Agent/Runner) for consistency with the rest of the application.
        Appends a user message with summarization instructions to the conversation items.

        Args:
            items: Conversation items to summarize (from session.get_items())

        Returns:
            Generated summary text
        """
        logger.info(f"Summarizing {len(items)} messages ({self.total_tokens} tokens)")

        # Get settings and deployment
        deployment = DEFAULT_MODEL

        # Create a one-off summarization agent with generic instructions
        summary_agent = Agent(
            name="Summarizer",
            model=deployment,
            instructions="You are a helpful assistant that creates CONCISE but TECHNICALLY COMPLETE conversation summaries.",
        )

        # Append summarization request as final user message
        # This provides explicit guidance on what to summarize and how
        from core.prompts import CONVERSATION_SUMMARIZATION_REQUEST

        summary_request = {
            "role": "user",
            "content": CONVERSATION_SUMMARIZATION_REQUEST,
        }

        # Cast to TResponseInputItem for type safety (runtime-compatible dict)
        from typing import cast

        messages_with_request = [*items, cast(TResponseInputItem, summary_request)]

        # Pass items with summarization request to Runner
        result = await Runner.run(
            summary_agent,
            input=messages_with_request,
            session=None,  # No session for summarization (one-shot operation)
        )

        return result.final_output or ""

    async def _update_session_with_summary(
        self, summary_text: str, recent_items: list[TResponseInputItem], call_id: str
    ) -> None:
        """Update session with summary and recent items.

        Args:
            summary_text: The generated summary
            recent_items: Recent items to preserve
            call_id: The call_id from the start event for matching completion
        """
        # Count summary tokens
        summary_tokens = self._count_tokens(summary_text)

        # Calculate tokens for recent items
        recent_tokens = self._calculate_total_tokens(recent_items)

        # Clear session and add summary + recent messages
        await self.clear_session()

        # Clear token cache since we're starting fresh
        self._item_token_cache.clear()
        logger.debug("Cleared item token cache after session summarization")

        # Use context manager to safely skip full_history saves during repopulation
        with self._skip_full_history_context():
            # Add summary as a system message
            await self.add_items([{"role": "system", "content": f"Previous conversation summary:\n{summary_text}"}])

            # Re-add recent messages without IDs to break reasoning references
            # CRITICAL: The SDK maintains message->reasoning links via IDs in its SQLite database.
            # When we try to keep messages without their associated reasoning items, the API rejects
            # requests with "required reasoning item" errors. By removing IDs, we force the SDK to
            # create fresh items without any internal references to reasoning items.
            # See: Manual summarization bug fix (2025-10-11)
            if recent_items:
                cleaned_items = []
                for item in recent_items:
                    role = item.get("role")
                    content = item.get("content")

                    # Defensive: Skip items with missing essential fields
                    if not role or not content:
                        logger.warning(
                            f"Skipping invalid item during summarization: role={role}, has_content={bool(content)}"
                        )
                        continue

                    # Create new dict with only essential fields (no id, status, type)
                    cleaned_item = {
                        "role": role,
                        "content": content,
                    }
                    cleaned_items.append(cleaned_item)

                # Defensive: Ensure we have items to add
                if not cleaned_items:
                    logger.error("No valid items to re-add after cleaning - session may be corrupted")
                    raise ValueError("All recent items were invalid after cleaning")

                logger.info(f"Re-adding {len(cleaned_items)} items without IDs to break reasoning references")
                await self.add_items(cleaned_items)

        # Context manager automatically re-enables dual-save for future messages

        # Update token count
        old_tokens = self.total_tokens
        self.total_tokens = summary_tokens + recent_tokens
        # Reset accumulated tool tokens since they're now part of the summary
        self.accumulated_tool_tokens = 0

        # Update session metadata to persist token reset across session switches
        if self.session_manager:
            updates = SessionUpdate(accumulated_tool_tokens=self.accumulated_tool_tokens)
            self.session_manager.update_session(self.session_id, updates)
            logger.info(
                f"Updated session metadata after summarization: accumulated_tool_tokens={self.accumulated_tool_tokens}"
            )

        logger.info(
            f"Session tokens reset: {old_tokens} → {self.total_tokens} "
            f"(summary: {summary_tokens}, recent: {recent_tokens})"
        )

        # Emit summarization complete event (using same call_id from start)
        # No truncation - show the full summary in the frontend

        # Include metadata in the output for the frontend
        metadata_str = (
            f"Tokens before: {old_tokens}, "
            f"Tokens after: {self.total_tokens}, "
            f"Tokens saved: {old_tokens - self.total_tokens}"
        )

        await self._emit_completion_event(call_id, success=True, output=f"{summary_text}\n\n[{metadata_str}]")

        logger.info(
            f"Summarization complete: {summary_tokens} tokens summary + "
            f"{recent_tokens} recent = {self.total_tokens} total"
        )

    async def run_with_auto_summary(self, agent: Agent, user_input: str, **kwargs: Any) -> RunResultStreaming:
        """Run agent with automatic summarization when needed.

        This is a convenience method that checks tokens before running
        and triggers summarization if needed.

        Args:
            agent: The agent to run
            user_input: The user's input
            **kwargs: Additional arguments for Runner.run_streamed

        Returns:
            RunResultStreaming from the agent execution
        """
        # Check if summarization needed (summarize_with_agent handles its own locking)
        if await self.should_summarize():
            logger.info("Triggering summarization before processing user input")
            await self.summarize_with_agent()

        # Now run with fresh context (post-summarization if it occurred)
        result = Runner.run_streamed(agent, user_input, session=self, **kwargs)

        # Note: Token count update happens after streaming completes in the caller

        return result

    def update_with_tool_tokens(self, tool_tokens: int) -> None:
        """Update token count with tokens from tool calls.

        Args:
            tool_tokens: Number of tokens used by tool calls
        """
        self.accumulated_tool_tokens += tool_tokens
        self.total_tokens += tool_tokens
        logger.info(
            f"Added {tool_tokens} tool tokens. Total: {self.total_tokens}/{self.trigger_tokens} "
            f"({int(self.total_tokens / self.trigger_tokens * 100)}%)"
        )
