"""PostgreSQL-backed token-aware session with automatic summarization.

Adapts the legacy TokenAwareSQLiteSession for PostgreSQL backend while maintaining
the same token tracking and summarization capabilities.

Features:
- Token counting using tiktoken
- Threshold-based summarization (80% of model limit)
- Conversation summarization to prevent context overflow
- Total token tracking stored in DB
"""

from __future__ import annotations

import asyncio

from collections.abc import Sequence
from typing import Any
from uuid import UUID

import asyncpg

from agents import Agent, Runner

from api.services.postgres_session import PostgresSession
from core.constants import (
    DEFAULT_MODEL,
    MESSAGE_STRUCTURE_TOKEN_OVERHEAD,
    MIN_MESSAGES_FOR_SUMMARIZATION,
    MODEL_TOKEN_LIMITS,
)
from core.prompts import CONVERSATION_SUMMARIZATION_INSTRUCTIONS
from utils.logger import logger
from utils.token_utils import count_tokens


def collect_recent_exchanges(items: list[dict[str, Any]], keep_recent: int) -> list[dict[str, Any]]:
    """Collect last N complete user-assistant exchanges.

    Uses optimized reverse scan with early termination.

    Args:
        items: All conversation items
        keep_recent: Number of recent user messages to keep

    Returns:
        List of items from recent exchanges (chronological order)
    """
    if not items or keep_recent <= 0:
        return []

    exchanges_found = 0
    result_indices = []
    pending_assistant_idx = None

    for i in range(len(items) - 1, -1, -1):
        item = items[i]
        role = item.get("role")

        if role == "tool":
            continue

        if role == "assistant":
            pending_assistant_idx = i

        elif role == "user" and pending_assistant_idx is not None:
            result_indices.append((i, pending_assistant_idx))
            pending_assistant_idx = None
            exchanges_found += 1

            if exchanges_found >= keep_recent:
                break

    if pending_assistant_idx is not None and exchanges_found < keep_recent:
        result_indices.append((pending_assistant_idx, pending_assistant_idx))

    result_indices.reverse()

    result = [
        items[i]
        for start_idx, end_idx in result_indices
        for i in range(start_idx, end_idx + 1)
        if items[i].get("role") in ["user", "assistant"]
    ]

    return result


class PostgresTokenAwareSession(PostgresSession):  # type: ignore[misc]
    """Token-aware PostgreSQL session with automatic summarization.

    Extends PostgresSession with:
    - Token counting and threshold monitoring
    - Automatic summarization when 80% of model limit reached
    - Tool token accumulation tracking
    """

    def __init__(
        self,
        session_id: str,
        session_uuid: UUID,
        pool: asyncpg.Pool,
        model: str = DEFAULT_MODEL,
        threshold: float = 0.8,
    ):
        """Initialize token-aware session.

        Args:
            session_id: Session identifier
            session_uuid: PostgreSQL UUID
            pool: Database connection pool
            model: Model name for token counting
            threshold: Summarization trigger threshold (0.0-1.0)
        """
        super().__init__(session_id, session_uuid, pool)

        self.model = model
        self.threshold = threshold

        # Token tracking state
        self.max_tokens = self._get_model_limit(model)
        self.trigger_tokens = int(self.max_tokens * threshold)
        self._total_tokens = 0
        self._accumulated_tool_tokens = 0
        self._item_token_cache: dict[str, int] = {}

        # Summarization lock
        self._summarization_lock = asyncio.Lock()

        logger.info(
            f"PostgresTokenAwareSession initialized: "
            f"session_id={session_id}, model={model}, "
            f"max_tokens={self.max_tokens}, trigger_at={self.trigger_tokens}"
        )

    def _get_model_limit(self, model: str) -> int:
        """Get token limit for model."""
        if model in MODEL_TOKEN_LIMITS:
            limit: int = MODEL_TOKEN_LIMITS[model]
            return limit

        for known_model, model_limit in MODEL_TOKEN_LIMITS.items():
            if known_model in model.lower():
                limit = int(model_limit)
                return limit

        logger.warning(f"Unknown model {model}, using conservative 15k limit")
        return 15000

    def _count_text_tokens(self, text: str) -> int:
        """Count tokens in text using model's tokenizer."""
        result = count_tokens(text, self.model)
        return int(result["exact_tokens"])

    def _count_item_tokens(self, item: dict[str, Any]) -> int:
        """Count tokens for a single conversation item."""
        item_tokens: int = 0

        content = item.get("content", "")

        if isinstance(content, str):
            item_tokens += self._count_text_tokens(content)

        elif isinstance(content, list):
            for content_item in content:
                if isinstance(content_item, dict):
                    if "output" in content_item:
                        item_tokens += self._count_text_tokens(str(content_item["output"]))
                    elif "text" in content_item:
                        item_tokens += self._count_text_tokens(str(content_item["text"]))
                elif isinstance(content_item, str):
                    item_tokens += self._count_text_tokens(content_item)

        if item.get("tool_calls"):
            for tool_call in item["tool_calls"]:
                if isinstance(tool_call, dict) and "function" in tool_call and "arguments" in tool_call["function"]:
                    item_tokens += self._count_text_tokens(str(tool_call["function"]["arguments"]))

        item_tokens += MESSAGE_STRUCTURE_TOKEN_OVERHEAD
        return item_tokens

    def _calculate_total_tokens(self, items: Sequence[dict[str, Any]]) -> int:
        """Calculate total tokens from conversation items with caching."""
        total = 0

        for item in items:
            item_id = item.get("id")

            if item_id and item_id in self._item_token_cache:
                total += self._item_token_cache[item_id]
            else:
                item_tokens = self._count_item_tokens(item)
                total += item_tokens

                if item_id:
                    self._item_token_cache[item_id] = item_tokens

        return total

    async def should_summarize(self) -> bool:
        """Check if summarization threshold reached."""
        should_trigger = self._total_tokens > self.trigger_tokens

        if should_trigger:
            logger.info(
                f"Token limit approaching ({self._total_tokens}/{self.trigger_tokens}), " "summarization recommended"
            )

        return should_trigger

    def update_with_tool_tokens(self, tool_tokens: int) -> None:
        """Add tokens from tool calls to total count."""
        self._accumulated_tool_tokens += tool_tokens
        self._total_tokens += tool_tokens

        logger.info(
            f"Added {tool_tokens} tool tokens. "
            f"Total: {self._total_tokens}/{self.trigger_tokens} "
            f"({int(self._total_tokens / self.trigger_tokens * 100)}%)"
        )

    async def add_items(self, items: list[dict[str, Any]]) -> None:
        """Add items and update token count."""
        await super().add_items(items)

        # Update token count
        new_tokens = self._calculate_total_tokens(items)
        self._total_tokens += new_tokens

    async def recalculate_tokens(self) -> int:
        """Recalculate total tokens from current session items."""
        items = await self.get_items()
        self._total_tokens = self._calculate_total_tokens(items) + self._accumulated_tool_tokens
        return self._total_tokens

    async def _generate_summary(self, items: list[dict[str, Any]]) -> str:
        """Generate summary using Agent/Runner pattern."""
        logger.info(f"Summarizing {len(items)} messages ({self._total_tokens} tokens)")

        # Sanitize items to extract text from multimodal content (avoid base64 overflow)
        sanitized_items = self._sanitize_items_for_summary(items)

        summary_agent = Agent(
            name="Summarizer",
            model=self.model,
            instructions=CONVERSATION_SUMMARIZATION_INSTRUCTIONS,
        )

        result = await Runner.run(
            summary_agent,
            input=sanitized_items,  # type: ignore[arg-type]  # SDK accepts dict messages
            session=None,
        )

        return result.final_output or ""

    def _sanitize_items_for_summary(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Sanitize conversation items for summarization.

        Extracts text-only content from multimodal messages to avoid
        context overflow from base64 image data.

        Args:
            items: Raw conversation items

        Returns:
            Items with text-only content suitable for summarization
        """
        sanitized = []
        for item in items:
            role = item.get("role")
            content = item.get("content")

            if not role:
                continue

            # Extract text from multimodal content
            text_content = self._extract_text_from_content(content)

            sanitized.append({"role": role, "content": text_content})

        return sanitized

    def _extract_text_from_content(self, content: Any) -> str:
        """Extract text from content, handling multimodal formats.

        Args:
            content: Message content (string, list, or other)

        Returns:
            Extracted text content
        """
        if content is None:
            return ""

        # Plain string - return as-is
        if isinstance(content, str):
            # Check if it's JSON-encoded multimodal content
            import json

            try:
                parsed = json.loads(content)
                if isinstance(parsed, list):
                    return self._extract_text_from_parts(parsed)
            except (json.JSONDecodeError, TypeError):
                pass
            return content

        # List of content parts (multimodal format)
        if isinstance(content, list):
            return self._extract_text_from_parts(content)

        # Fallback for other types
        return str(content)

    def _extract_text_from_parts(self, parts: list[Any]) -> str:
        """Extract text from multimodal content parts.

        Args:
            parts: List of content parts

        Returns:
            Concatenated text from text parts
        """
        text_parts = []
        has_images = False

        for part in parts:
            if isinstance(part, dict):
                part_type = part.get("type", "")
                # Handle text types
                if part_type in ("input_text", "text"):
                    text = part.get("text", "")
                    if text:
                        text_parts.append(text)
                # Track if images were present
                elif part_type in ("input_image", "image_url", "image"):
                    has_images = True
            elif isinstance(part, str):
                text_parts.append(part)

        result = " ".join(text_parts)
        if has_images and not result:
            return "[Image attached]"
        elif has_images:
            return f"{result} [with image]"
        return result

    async def summarize_with_agent(self, keep_recent: int = 2, force: bool = False) -> str:
        """Execute summarization workflow with locking.

        Args:
            keep_recent: Number of recent user messages to preserve
            force: Bypass threshold check

        Returns:
            Generated summary text or empty string if skipped/failed
        """
        if self._summarization_lock.locked():
            logger.info("Summarization already in progress, skipping")
            return ""

        async with self._summarization_lock:
            # Check preconditions
            if not force and not await self.should_summarize():
                logger.info("Tokens below threshold, skipping summarization")
                return ""

            items = await self.get_items()
            recent_items = collect_recent_exchanges(items, keep_recent)

            # Validate we have enough content to summarize
            skip_reason = None
            if len(items) < MIN_MESSAGES_FOR_SUMMARIZATION:
                skip_reason = f"Not enough items to summarize (< {MIN_MESSAGES_FOR_SUMMARIZATION})"
            elif len(recent_items) == len(items):
                skip_reason = "All items are recent, nothing to summarize"

            if skip_reason:
                logger.warning(skip_reason)
                return ""

            try:
                summary_text = await self._generate_summary(items)
                if not summary_text:
                    logger.error("Summarization failed: empty summary")
                    return ""

                await self._repopulate_session(summary_text, recent_items)
                logger.info(f"Summarization complete. New token count: {self._total_tokens}")
                return summary_text

            except Exception as e:
                logger.error(f"Summarization failed: {e}", exc_info=True)
                return ""

    async def _clear_llm_context(self) -> None:
        """Clear all items from LLM context (Layer 1) for this session.

        ONLY used during summarization repopulation - not for general use.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM llm_context WHERE session_id = $1",
                self.session_uuid,
            )

    async def _repopulate_session(
        self,
        summary_text: str,
        recent_items: list[dict[str, Any]],
    ) -> None:
        """Repopulate session after summarization."""
        summary_tokens = self._count_text_tokens(summary_text)
        recent_tokens = self._calculate_total_tokens(recent_items)

        # Clear current LLM context (Layer 1 only)
        await self._clear_llm_context()
        self._item_token_cache.clear()

        # Add summary as system message
        await super().add_items(
            [
                {
                    "role": "system",
                    "content": f"Previous conversation summary:\n{summary_text}",
                }
            ]
        )

        # Re-add recent messages without IDs
        if recent_items:
            cleaned_items = []
            for item in recent_items:
                role = item.get("role")
                content = item.get("content")

                if not role or not content:
                    continue

                cleaned_items.append({"role": role, "content": content})

            if cleaned_items:
                await super().add_items(cleaned_items)

        # Update token counts
        old_tokens = self._total_tokens
        self._total_tokens = summary_tokens + recent_tokens
        self._accumulated_tool_tokens = 0

        logger.info(
            f"Session tokens reset: {old_tokens} -> {self._total_tokens} "
            f"(summary: {summary_tokens}, recent: {recent_tokens})"
        )

    async def update_db_token_count(self) -> None:
        """Persist current token count to database."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sessions
                SET total_tokens = $1, accumulated_tool_tokens = $2
                WHERE id = $3
                """,
                self._total_tokens,
                self._accumulated_tool_tokens,
                self.session_uuid,
            )

    async def load_token_state_from_db(self) -> None:
        """Load token state from database."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT total_tokens, accumulated_tool_tokens
                FROM sessions WHERE id = $1
                """,
                self.session_uuid,
            )

        if row:
            self._total_tokens = row["total_tokens"] or 0
            self._accumulated_tool_tokens = row["accumulated_tool_tokens"] or 0

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
