"""Token-aware SQLite session with dual-layer persistence and automatic summarization.

This module consolidates all session functionality into a single cohesive class.
Previously spread across 9 files (1,494 lines), now consolidated for improved
maintainability and discoverability.

Architecture:
    - TokenAwareSQLiteSession: Main session class with all functionality
    - Utility functions: Exchange collection and session repopulation helpers

Consistency Model: Eventual Consistency
---------------------------------------
This module uses eventual consistency between Layer 1 (LLM context) and Layer 2
(UI display). Layer 1 is the source of truth. Layer 2 writes are best-effort and
may fail (logged but non-fatal).

Consistency guarantees:
    - Layer 1 always consistent (all writes succeed or fail atomically)
    - Layer 2 best-effort (failures logged, not fatal to operations)
    - On failure, Layer 2 falls back to Layer 1 for reads
    - Manual consistency check available via validate_consistency()

This design prioritizes availability over consistency (AP in CAP theorem).
Layer 2 can lag or fail without affecting core chat functionality.
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
    MESSAGE_STRUCTURE_TOKEN_OVERHEAD,
    MIN_MESSAGES_FOR_SUMMARIZATION,
    MODEL_TOKEN_LIMITS,
)
from core.prompts import CONVERSATION_SUMMARIZATION_REQUEST
from core.session_manager import SessionManager
from models.event_models import FunctionEventMessage
from models.session_models import FullHistoryProtocol, SessionUpdate
from utils.binary_io import write_message
from utils.json_utils import json_compact
from utils.logger import logger
from utils.token_utils import count_tokens

# ==============================================================================
# Exception Classes
# ==============================================================================


class PersistenceError(Exception):
    """Base exception for persistence errors."""

    pass


# ==============================================================================
# Utility Functions
# ==============================================================================


def collect_recent_exchanges(items: list[TResponseInputItem], keep_recent: int) -> list[TResponseInputItem]:
    """Collect last N complete user-assistant exchanges.

    Uses optimized reverse scan with early termination:
    - Scans backward from end of conversation
    - Stops when enough exchanges found (O(k) vs O(n))
    - Preserves chronological order in result

    Args:
        items: All conversation items
        keep_recent: Number of recent user messages to keep

    Returns:
        List of items from recent exchanges (chronological order)
    """
    if not items or keep_recent <= 0:
        logger.info(f"No items or keep_recent={keep_recent}")
        return []

    # Reverse scan with early exit
    exchanges_found = 0
    result_indices = []
    pending_assistant_idx = None

    for i in range(len(items) - 1, -1, -1):
        item = items[i]
        role = item.get("role")

        # Skip tool results (but NOT assistant messages with tool_calls)
        if role == "tool":
            continue

        if role == "assistant":
            pending_assistant_idx = i

        elif role == "user" and pending_assistant_idx is not None:
            # Complete exchange found
            result_indices.append((i, pending_assistant_idx))
            pending_assistant_idx = None
            exchanges_found += 1

            # EARLY EXIT: Stop when enough exchanges collected
            if exchanges_found >= keep_recent:
                logger.info(f"Early exit after scanning {len(items) - i} items (found {exchanges_found} exchanges)")
                break

    # Handle orphaned assistant message at end
    if pending_assistant_idx is not None and exchanges_found < keep_recent:
        result_indices.append((pending_assistant_idx, pending_assistant_idx))
        exchanges_found += 1

    # Restore chronological order
    result_indices.reverse()

    # Extract items (only user/assistant roles)
    result = [
        items[i]
        for start_idx, end_idx in result_indices
        for i in range(start_idx, end_idx + 1)
        if items[i].get("role") in ["user", "assistant"]
    ]

    logger.info(f"Collected {len(result)} items from {exchanges_found} exchanges")
    return result


async def repopulate_session(
    session: TokenAwareSQLiteSession,
    summary_text: str,
    recent_items: list[TResponseInputItem],
    call_id: str,
) -> None:
    """Repopulate session after summarization.

    Workflow:
    1. Clear existing session items
    2. Add summary as system message
    3. Re-add recent messages without IDs (break reasoning links)
    4. Update token counts
    5. Update session metadata
    6. Emit completion event with metadata

    Args:
        session: TokenAwareSQLiteSession instance
        summary_text: Generated summary
        recent_items: Recent exchanges to preserve
        call_id: IPC call_id from start event
    """
    # Count tokens
    summary_tokens = session._count_text_tokens(summary_text)
    recent_tokens = session._calculate_total_tokens(recent_items)

    # Clear session
    await session.clear_session()

    # Clear token cache (fresh start)
    session._item_token_cache.clear()
    logger.debug("Cleared token cache after summarization")

    # Use context manager to skip Layer 2 during repopulation
    with session._skip_full_history_context():
        # Add summary as system message
        await session.add_items(
            [
                {
                    "role": "system",
                    "content": f"Previous conversation summary:\n{summary_text}",
                }
            ]
        )

        # Re-add recent messages WITHOUT IDs
        # CRITICAL: Removing IDs breaks SDK reasoning item links
        if recent_items:
            cleaned_items = []
            for item in recent_items:
                role = item.get("role")
                content = item.get("content")

                # Defensive: Skip invalid items
                if not role or not content:
                    logger.warning(f"Skipping invalid item: role={role}, has_content={bool(content)}")
                    continue

                # Create new dict with only essential fields
                cleaned_items.append(
                    {
                        "role": role,
                        "content": content,
                    }
                )

            # Defensive: Ensure we have items to add
            if not cleaned_items:
                logger.error("No valid items after cleaning - session corrupted")
                raise ValueError("All recent items invalid after cleaning")

            logger.info(f"Re-adding {len(cleaned_items)} items without IDs")
            await session.add_items(cleaned_items)

    # Context manager automatically re-enables dual-save

    # Update token counts
    old_tokens = session.total_tokens
    session._total_tokens = summary_tokens + recent_tokens

    # Reset accumulated tool tokens (now in summary)
    session._accumulated_tool_tokens = 0

    # Update session metadata
    if session.session_manager:
        updates = SessionUpdate(accumulated_tool_tokens=0)
        session.session_manager.update_session(session.session_id, updates)
        logger.info("Updated session metadata after summarization: accumulated_tool_tokens=0")

    logger.info(
        f"Session tokens reset: {old_tokens} → "
        f"{session.total_tokens} "
        f"(summary: {summary_tokens}, recent: {recent_tokens})"
    )

    # Emit completion event with metadata
    metadata_str = (
        f"Tokens before: {old_tokens}, "
        f"Tokens after: {session.total_tokens}, "
        f"Tokens saved: {old_tokens - session.total_tokens}"
    )

    await session._emit_completion_event(
        call_id,
        success=True,
        output=f"{summary_text}\n\n[{metadata_str}]",
    )

    logger.info(
        f"Summarization complete: {summary_tokens} tokens summary + "
        f"{recent_tokens} recent = "
        f"{session.total_tokens} total"
    )


# ==============================================================================
# Main Session Class
# ==============================================================================


class TokenAwareSQLiteSession(SQLiteSession):
    """Token-aware session with automatic summarization and dual-layer persistence.

    This class consolidates all session functionality:
    - Token counting and threshold monitoring
    - Dual-layer persistence (Layer 1: LLM context, Layer 2: UI display)
    - Automatic summarization workflow
    - Transaction coordination with rollback

    Usage:
        # Production usage (via SessionBuilder recommended)
        session = TokenAwareSQLiteSession(
            session_id="chat_123",
            db_path=CHAT_HISTORY_DB_PATH,
            agent=agent,
            model="gpt-4o",
            threshold=0.8,
            full_history_store=full_history_store,
            session_manager=session_manager,
        )

        # Run with auto-summarization
        result = await session.run_with_auto_summary(agent, "user input")

        # Manual summarization
        summary = await session.summarize_with_agent(keep_recent=2, force=True)

        # Check tokens
        if await session.should_summarize():
            await session.summarize_with_agent()
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
        """Initialize token-aware session.

        Args:
            session_id: Unique identifier
            db_path: SQLite database path (None for in-memory)
            agent: Agent instance for summarization
            model: Model name for token counting
            threshold: Summarization trigger threshold (0.0-1.0)
            full_history_store: Layer 2 storage for complete history
            session_manager: Session metadata manager

        Raises:
            ValueError: If threshold not in valid range
        """
        # Initialize parent SQLiteSession
        super().__init__(session_id, db_path if db_path is not None else ":memory:")

        # Validate threshold
        if not 0.0 < threshold <= 1.0:
            raise ValueError(f"Threshold must be in (0.0, 1.0], got {threshold}")

        # Store configuration
        self.agent = agent
        self.model = model
        self.threshold = threshold
        self.full_history_store = full_history_store
        self.session_manager = session_manager

        # Token tracking state
        self.max_tokens = self._get_model_limit(model)
        self.trigger_tokens = int(self.max_tokens * threshold)
        self._total_tokens = 0
        self._accumulated_tool_tokens = 0
        self._item_token_cache: dict[str, int] = {}

        # Persistence state
        self._skip_full_history = False

        # Summarization state
        self._summarization_lock = asyncio.Lock()

        logger.info(
            f"TokenAwareSQLiteSession initialized: "
            f"session_id={session_id}, model={model}, "
            f"max_tokens={self.max_tokens}, trigger_at={self.trigger_tokens}"
        )

    # ==========================================================================
    # Model Limit Configuration
    # ==========================================================================

    def _get_model_limit(self, model: str) -> int:
        """Get token limit for model.

        Args:
            model: Model name

        Returns:
            Token limit for model
        """
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

    # ==========================================================================
    # Token Tracking Methods
    # ==========================================================================

    def _count_text_tokens(self, text: str) -> int:
        """Count tokens in text using model's tokenizer.

        Args:
            text: Text to tokenize

        Returns:
            Exact token count
        """
        result = count_tokens(text, self.model)
        return int(result["exact_tokens"])

    def _count_item_tokens(self, item: dict[str, Any]) -> int:
        """Count tokens for a single conversation item.

        Handles multiple content types:
        - String content (user/assistant messages)
        - List content (tool results with output/text fields)
        - Tool call arguments

        Args:
            item: Conversation item dict

        Returns:
            Total token count including structure overhead
        """
        item_tokens: int = 0

        # Handle different content types
        content = item.get("content", "")

        if isinstance(content, str):
            item_tokens += self._count_text_tokens(content)

        elif isinstance(content, list):
            # Tool results: list of content items
            for content_item in content:
                if isinstance(content_item, dict):
                    # Tool result with output
                    if "output" in content_item:
                        item_tokens += self._count_text_tokens(str(content_item["output"]))
                    # Tool result with text
                    elif "text" in content_item:
                        item_tokens += self._count_text_tokens(str(content_item["text"]))
                elif isinstance(content_item, str):
                    item_tokens += self._count_text_tokens(content_item)

        # Handle tool_calls field
        if item.get("tool_calls"):
            for tool_call in item["tool_calls"]:
                if isinstance(tool_call, dict) and "function" in tool_call and "arguments" in tool_call["function"]:
                    item_tokens += self._count_text_tokens(str(tool_call["function"]["arguments"]))

        # Add message structure overhead
        item_tokens += MESSAGE_STRUCTURE_TOKEN_OVERHEAD

        return item_tokens

    def _calculate_total_tokens(self, items: Sequence[dict[str, Any] | TResponseInputItem]) -> int:
        """Calculate total tokens from conversation items with caching.

        Uses item ID cache to avoid recalculating tokens for unchanged items.
        Performance: O(n) first time, O(1) for cached items on subsequent calls.

        Args:
            items: Sequence of conversation items

        Returns:
            Total token count across all items
        """
        total = 0

        for item in items:
            # Cast to dict for internal operations
            item_dict = cast(dict[str, Any], item)
            item_id = item_dict.get("id")

            # Try cache first
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

    async def should_summarize(self) -> bool:
        """Check if summarization threshold reached.

        Returns:
            True if total_tokens > trigger_tokens
        """
        should_trigger = self._total_tokens > self.trigger_tokens

        if should_trigger:
            logger.info(
                f"Token limit approaching ({self._total_tokens}/{self.trigger_tokens}), summarization recommended"
            )

        return should_trigger

    def update_with_tool_tokens(self, tool_tokens: int) -> None:
        """Add tokens from tool calls to total count.

        Tool tokens are tracked separately because they're not stored
        in conversation items but still count toward context limit.

        Args:
            tool_tokens: Number of tokens used by tool calls
        """
        self._accumulated_tool_tokens += tool_tokens
        self._total_tokens += tool_tokens

        logger.info(
            f"Added {tool_tokens} tool tokens. "
            f"Total: {self._total_tokens}/{self.trigger_tokens} "
            f"({int(self._total_tokens / self.trigger_tokens * 100)}%)"
        )

    # ==========================================================================
    # Persistence Methods
    # ==========================================================================

    @contextmanager
    def _skip_full_history_context(self) -> Generator[None, None, None]:
        """Context manager for safely skipping Layer 2 during repopulation."""
        old_value = self._skip_full_history
        self._skip_full_history = True
        try:
            yield
        finally:
            self._skip_full_history = old_value

    async def add_items(self, items: Any) -> None:
        """Save items to both layers with safeguards and transaction support.

        Uses best-effort consistency: Layer 1 is critical, Layer 2 is best-effort.
        Layer 2 failures are logged but do not block operations.

        Args:
            items: Conversation items to save

        Raises:
            RuntimeError: If full_history_store is None during normal operation
        """
        # SAFEGUARD: Enforce dual-layer persistence during normal operation
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
            await super().add_items(items)
            logger.debug(f"Layer 1-only write during repopulation: {len(items)} items")
            return

        # Normal operation: Layer 1 write first (critical path)
        try:
            await super().add_items(items)
            logger.debug(f"Layer 1 write succeeded: {len(items)} items")
        except Exception as e:
            error_msg = f"Layer 1 write failed for session {self.session_id}: {e}"
            logger.error(error_msg, exc_info=True)
            raise RuntimeError(error_msg) from e

        # Layer 2 write (best-effort, failures logged but not fatal)
        if self.full_history_store and role_items:
            try:
                for item in role_items:
                    self.full_history_store.save_message(self.session_id, item)
                logger.debug(f"Layer 2 write succeeded: {len(role_items)} messages")
            except Exception as e:
                # Log but don't raise - Layer 1 succeeded, that's what matters
                logger.error(f"Layer 2 write failed (non-fatal): {e}", exc_info=True)
                # Future: Trigger background reconciliation

    async def validate_consistency(self) -> tuple[bool, str | None]:
        """Validate consistency between Layer 1 and Layer 2.

        Checks that Layer 2 has at least as many items as Layer 1. Layer 2 is allowed
        to have more items (Layer 1 may be trimmed during summarization).

        Returns:
            Tuple of (is_consistent: bool, error: str | None)
        """
        if not self.full_history_store:
            return True, None

        # Get items from both layers
        layer1_items = await self.get_items()
        layer2_items = self.full_history_store.get_messages(self.session_id)

        # Layer 2 should have at least as many items as Layer 1
        layer1_count = len(layer1_items)
        layer2_count = len(layer2_items)

        if layer2_count < layer1_count:
            error_msg = (
                f"INCONSISTENCY DETECTED in session {self.session_id}: "
                f"Layer 2 has {layer2_count} items but Layer 1 has {layer1_count} items. "
                f"Layer 2 should never have fewer items than Layer 1."
            )
            logger.error(error_msg)
            return False, error_msg

        logger.debug(
            f"Consistency check passed for session {self.session_id}: "
            f"Layer 1={layer1_count} items, Layer 2={layer2_count} items"
        )
        return True, None

    async def delete_storage(self) -> bool:
        """Delete all Layer 1 (LLM context) storage for this session.

        CRITICAL: OpenAI Agents SDK uses SHARED tables (agent_sessions, agent_messages)
        with foreign keys. We must delete from agent_sessions, which triggers CASCADE
        delete of agent_messages via foreign key constraint.

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
                conn.execute("PRAGMA foreign_keys = ON;")

                # Delete from shared agent_sessions table (FK CASCADE handles agent_messages)
                cursor = conn.execute(
                    "DELETE FROM agent_sessions WHERE session_id = ?",
                    (self.session_id,),
                )
                deleted_count = cursor.rowcount

                # Verify agent_messages were cascaded (should be 0 remaining)
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

    # ==========================================================================
    # Summarization Methods
    # ==========================================================================

    def _emit_start_event(self, items: list[TResponseInputItem]) -> str:
        """Emit summarization start event for UI.

        Args:
            items: Conversation items being summarized

        Returns:
            Call ID for event tracking
        """
        call_id = f"sum_{uuid.uuid4().hex[:8]}"
        write_message(
            {
                "type": "function_detected",
                "name": "summarize_conversation",
                "call_id": call_id,
                "arguments": json_compact(
                    {
                        "messages_count": len(items),
                        "tokens_before": self._total_tokens,
                        "threshold": self.trigger_tokens,
                    }
                ),
            }
        )
        return call_id

    async def _emit_completion_event(
        self,
        call_id: str,
        success: bool = True,
        error: str | None = None,
        output: str | None = None,
    ) -> None:
        """Emit completion event to frontend.

        Args:
            call_id: Event tracking ID
            success: Whether operation succeeded
            error: Error message if failed
            output: Summary output if succeeded
        """
        event = FunctionEventMessage(
            type="function_completed",
            call_id=call_id,
            success=success,
            error=error,
            output=output,
        )
        write_message(event.model_dump(exclude_none=True))

    async def _generate_summary(self, items: list[TResponseInputItem]) -> str:
        """Generate summary using Agent/Runner pattern.

        Creates one-shot summarization agent with generic instructions
        and appends summarization request to conversation items.

        Args:
            items: Conversation items to summarize

        Returns:
            Generated summary text
        """
        logger.info(f"Summarizing {len(items)} messages ({self._total_tokens} tokens)")

        # Create summarization agent
        summary_agent = Agent(
            name="Summarizer",
            model=DEFAULT_MODEL,
            instructions=(
                "You are a helpful assistant that creates CONCISE but TECHNICALLY COMPLETE conversation summaries."
            ),
        )

        # Append summarization request
        summary_request = {
            "role": "user",
            "content": CONVERSATION_SUMMARIZATION_REQUEST,
        }
        messages_with_request = [
            *items,
            cast(TResponseInputItem, summary_request),
        ]

        # Generate summary
        result = await Runner.run(
            summary_agent,
            input=messages_with_request,
            session=None,  # No session for one-shot operation
        )

        return result.final_output or ""

    async def summarize_with_agent(self, keep_recent: int = 2, force: bool = False) -> str:
        """Execute summarization workflow with locking.

        Workflow:
        1. Validate preconditions (token threshold, min messages)
        2. Emit start event (IPC)
        3. Collect recent exchanges to preserve
        4. Generate summary via Agent/Runner
        5. Delegate session repopulation
        6. Emit completion event (IPC)

        Args:
            keep_recent: Number of recent user messages to preserve
            force: Bypass threshold check for manual summarization

        Returns:
            Generated summary text or empty string if failed
        """
        if not self.agent:
            raise ValueError("Agent required for summarization")

        # Try to acquire lock (skip if already summarizing)
        if self._summarization_lock.locked():
            logger.info("Summarization already in progress, skipping")
            return ""

        async with self._summarization_lock:
            # Re-check threshold after acquiring lock
            if not force and not await self.should_summarize():
                logger.info("Tokens below threshold after lock, skipping")
                return ""

            if force:
                logger.info(f"Manual summarization forced ({self._total_tokens}/{self.trigger_tokens} tokens)")

            # Get conversation items
            items = await self.get_items()

            # Analyze for logging
            role_counts: dict[str, int] = {}
            for item in items:
                role = str(item.get("role", "unknown"))
                role_counts[role] = role_counts.get(role, 0) + 1

            logger.info(f"Summarization check: {len(items)} items - Roles: {role_counts}")

            # Collect recent exchanges (needed for validation)
            recent_items = collect_recent_exchanges(items, keep_recent)

            # Validate: need minimum items AND something old to summarize
            not_enough = len(items) < MIN_MESSAGES_FOR_SUMMARIZATION
            all_recent = len(recent_items) == len(items)

            if not_enough or all_recent:
                if not_enough:
                    logger.warning(f"Not enough items to summarize (< {MIN_MESSAGES_FOR_SUMMARIZATION})")
                else:
                    logger.warning(f"Aborting: all {len(items)} items are recent, nothing to summarize")
                    call_id = self._emit_start_event(items)
                    await self._emit_completion_event(call_id, success=False, error="All items are recent")
                return ""

            try:
                # Emit start event
                call_id = self._emit_start_event(items)

                # Generate summary
                summary_text = await self._generate_summary(items)

                if not summary_text:
                    logger.error("Summarization failed: empty summary")
                    await self._emit_completion_event(call_id, success=False, error="Empty summary returned")
                    return ""

                logger.info(f"Summary generated ({len(summary_text)} chars)")

                # Repopulate session
                await repopulate_session(self, summary_text, recent_items, call_id)

                return summary_text

            except Exception as e:
                logger.error(f"Summarization failed: {e}", exc_info=True)
                await self._emit_completion_event(call_id, success=False, error=str(e))
                return ""

    async def run_with_auto_summary(self, agent: Agent, user_input: str, **kwargs: Any) -> RunResultStreaming:
        """Run agent with automatic pre-check summarization.

        Convenience method that checks tokens before running and triggers
        summarization if needed.

        Args:
            agent: Agent to run
            user_input: User input to process
            **kwargs: Additional arguments for Runner.run_streamed

        Returns:
            Streaming result from agent run
        """
        if await self.should_summarize():
            logger.info("Triggering summarization before processing input")
            await self.summarize_with_agent()

        # Run with fresh context
        result = Runner.run_streamed(agent, user_input, session=self, **kwargs)
        return result

    # ==========================================================================
    # Public API Properties (Backward Compatibility)
    # ==========================================================================

    @property
    def total_tokens(self) -> int:
        """Total token count (conversation + tool tokens)."""
        return self._total_tokens

    @total_tokens.setter
    def total_tokens(self, value: int) -> None:
        """Allow direct token count updates."""
        self._total_tokens = value

    @property
    def accumulated_tool_tokens(self) -> int:
        """Tool tokens accumulated separately."""
        return self._accumulated_tool_tokens

    @accumulated_tool_tokens.setter
    def accumulated_tool_tokens(self, value: int) -> None:
        """Allow direct tool token updates."""
        self._accumulated_tool_tokens = value

    # ==========================================================================
    # Backward Compatibility Methods
    # ==========================================================================

    def calculate_items_tokens(self, items: Any) -> int:
        """Public method to calculate tokens (backward compatibility)."""
        return self._calculate_total_tokens(items)

    def _collect_recent_exchanges(self, items: Any, keep_recent: int) -> Any:
        """Collect recent exchanges (backward compatibility)."""
        return collect_recent_exchanges(items, keep_recent)
