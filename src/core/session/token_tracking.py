"""Token counting, caching, and threshold management."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, cast

from agents import TResponseInputItem

from core.constants import MESSAGE_STRUCTURE_TOKEN_OVERHEAD
from utils.logger import logger
from utils.token_utils import count_tokens


class TokenTracker:
    """Manages token counting with performance optimization.

    Features:
    - Exact token counting using tiktoken
    - Item-level caching by ID for O(1) lookups
    - Separate tracking for conversation vs tool tokens
    - Threshold monitoring for auto-summarization

    Thread-safety: Not thread-safe (single-threaded async context)
    """

    def __init__(self, model: str, max_tokens: int, threshold: float):
        """Initialize token tracker.

        Args:
            model: Model name for tokenizer selection
            max_tokens: Maximum token limit for model
            threshold: Fraction of max_tokens to trigger summarization

        Raises:
            ValueError: If threshold not in range (0.0, 1.0]
        """
        if not 0.0 < threshold <= 1.0:
            raise ValueError(f"Threshold must be in (0.0, 1.0], got {threshold}")

        self.model = model
        self.max_tokens = max_tokens
        self.trigger_tokens = int(max_tokens * threshold)

        # Token state
        self.total_tokens = 0
        self.accumulated_tool_tokens = 0

        # Performance cache: item_id -> token_count
        self._item_token_cache: dict[str, int] = {}

        logger.debug(f"TokenTracker initialized: model={model}, max={max_tokens}, trigger={self.trigger_tokens}")

    def count_text_tokens(self, text: str) -> int:
        """Count tokens in text using model's tokenizer.

        Args:
            text: Text to tokenize

        Returns:
            Exact token count
        """
        result = count_tokens(text, self.model)
        return int(result["exact_tokens"])

    def count_item_tokens(self, item: dict[str, Any]) -> int:
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
            item_tokens += self.count_text_tokens(content)

        elif isinstance(content, list):
            # Tool results: list of content items
            for content_item in content:
                if isinstance(content_item, dict):
                    # Tool result with output
                    if "output" in content_item:
                        item_tokens += self.count_text_tokens(str(content_item["output"]))
                    # Tool result with text
                    elif "text" in content_item:
                        item_tokens += self.count_text_tokens(str(content_item["text"]))
                elif isinstance(content_item, str):
                    item_tokens += self.count_text_tokens(content_item)

        # Handle tool_calls field
        if item.get("tool_calls"):
            for tool_call in item["tool_calls"]:
                if isinstance(tool_call, dict) and "function" in tool_call and "arguments" in tool_call["function"]:
                    item_tokens += self.count_text_tokens(str(tool_call["function"]["arguments"]))

        # Add message structure overhead
        item_tokens += MESSAGE_STRUCTURE_TOKEN_OVERHEAD

        return item_tokens

    def calculate_total_tokens(self, items: Sequence[dict[str, Any] | TResponseInputItem]) -> int:
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
                item_tokens = self.count_item_tokens(item_dict)
                total += item_tokens

                # Cache for future use if item has ID
                if item_id:
                    self._item_token_cache[item_id] = item_tokens

        return total

    def clear_cache(self) -> None:
        """Clear token cache (called after summarization).

        Should be called when conversation items change (e.g., after
        summarization clears and repopulates the session).
        """
        self._item_token_cache.clear()
        logger.debug("Cleared item token cache")

    def should_summarize(self) -> bool:
        """Check if current tokens exceed summarization threshold.

        Returns:
            True if total_tokens > trigger_tokens
        """
        should_trigger = self.total_tokens > self.trigger_tokens

        if should_trigger:
            logger.info(
                f"Token limit approaching ({self.total_tokens}/{self.trigger_tokens}), summarization recommended"
            )

        return should_trigger

    def update_with_tool_tokens(self, tool_tokens: int) -> None:
        """Add tokens from tool calls to total count.

        Tool tokens are tracked separately because they're not stored
        in conversation items but still count toward context limit.

        Args:
            tool_tokens: Number of tokens used by tool calls
        """
        self.accumulated_tool_tokens += tool_tokens
        self.total_tokens += tool_tokens

        logger.debug(
            f"Added {tool_tokens} tool tokens. "
            f"Accumulated: {self.accumulated_tool_tokens}, "
            f"Total: {self.total_tokens}/{self.trigger_tokens} "
            f"({int(self.total_tokens / self.trigger_tokens * 100)}%)"
        )

    def get_usage_percentage(self) -> float:
        """Calculate current token usage as percentage of trigger threshold.

        Returns:
            Usage percentage (0.0 to 100.0+)
        """
        if self.trigger_tokens == 0:
            return 0.0
        return (self.total_tokens / self.trigger_tokens) * 100
