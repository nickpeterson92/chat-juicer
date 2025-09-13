"""
Token-aware session management using SDK's built-in SQLiteSession.
Extends the SDK's session management with automatic token-based summarization.
"""

from __future__ import annotations

import asyncio
import json
import uuid

from typing import Any

from agents import Runner, SQLiteSession

from constants import MODEL_TOKEN_LIMITS
from logger import logger
from utils import estimate_tokens


class TokenAwareSQLiteSession(SQLiteSession):
    """Extends SQLiteSession with automatic token-based summarization."""

    def __init__(
        self,
        session_id: str,
        db_path: str | None = None,
        agent: Any = None,
        model: str = "gpt-5-mini",
        threshold: float = 0.8,
    ):
        """Initialize token-aware session built on SQLiteSession.

        Args:
            session_id: Unique identifier for the session
            db_path: Path to SQLite database (None for in-memory)
            agent: The Agent instance for summarization
            model: Model name for token counting
            threshold: Trigger summarization at this fraction of token limit (0.8 = 80%)
        """
        # Initialize parent SQLiteSession
        super().__init__(session_id, db_path)

        self.agent = agent
        self.model = model
        self.threshold = threshold

        # Get token limit for model
        self.max_tokens = self._get_model_limit()
        self.trigger_tokens = int(self.max_tokens * threshold)

        # Track tokens (calculated from session items)
        self.total_tokens = 0
        # Track accumulated tool tokens separately (not stored in session items)
        self.accumulated_tool_tokens = 0

        # Async lock to prevent concurrent summarizations
        self._summarization_lock = asyncio.Lock()

        logger.info(
            f"TokenAwareSQLiteSession initialized: session_id={session_id}, "
            f"model={model}, max_tokens={self.max_tokens}, "
            f"trigger_at={self.trigger_tokens}"
        )

    def _get_model_limit(self) -> int:
        """Get token limit for the current model."""
        # Check exact match first
        if self.model in MODEL_TOKEN_LIMITS:
            return MODEL_TOKEN_LIMITS[self.model]

        # Check if model contains a known base model name
        for known_model, limit in MODEL_TOKEN_LIMITS.items():
            if known_model in self.model.lower():
                return limit

        # Default conservative limit
        logger.warning(f"Unknown model {self.model}, using conservative 15k limit")
        return 15000

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using the model's tokenizer."""
        result = estimate_tokens(text, self.model)
        return result.get("exact_tokens") or result.get("estimated_tokens", 0)

    def _calculate_total_tokens(self, items: list[dict]) -> int:
        """Calculate total tokens from conversation items including tool calls."""
        total = 0
        for item in items:
            # Handle different content types
            content = item.get("content", "")

            # Regular text content (user/assistant messages)
            if isinstance(content, str):
                total += self._count_tokens(content)

            # Tool call results (stored as list of dicts or other formats)
            elif isinstance(content, list):
                # Tool results can be a list of content items
                for content_item in content:
                    if isinstance(content_item, dict):
                        # Tool result with output
                        if "output" in content_item:
                            total += self._count_tokens(str(content_item["output"]))
                        # Tool result with text
                        elif "text" in content_item:
                            total += self._count_tokens(str(content_item["text"]))
                    elif isinstance(content_item, str):
                        total += self._count_tokens(content_item)

            # Handle tool_calls field if present
            if item.get("tool_calls"):
                # Count tokens for tool call arguments
                for tool_call in item["tool_calls"]:
                    if isinstance(tool_call, dict) and "function" in tool_call and "arguments" in tool_call["function"]:
                        total += self._count_tokens(str(tool_call["function"]["arguments"]))

            # Add small overhead for role and message structure
            total += 10

        return total

    def _collect_recent_exchanges(self, items: list[dict], keep_recent: int) -> list[dict]:
        """Collect the most recent complete user-assistant exchanges.

        Uses a single forward pass O(n) algorithm.

        Args:
            items: List of conversation items
            keep_recent: Number of recent user messages to keep

        Returns:
            List of items representing the most recent exchanges
        """
        if not items or keep_recent <= 0:
            return []

        # Find all complete exchanges in a single forward pass
        exchanges = []
        pending_user_idx = None

        for i, item in enumerate(items):
            role = item.get("role")

            # Skip ephemeral content
            if role == "tool" or item.get("tool_calls"):
                pending_user_idx = None  # Reset any pending exchange
                continue

            if role == "user":
                pending_user_idx = i  # Start of potential exchange

            elif role == "assistant" and pending_user_idx is not None:
                # Complete exchange found!
                exchanges.append((pending_user_idx, i))
                pending_user_idx = None

        # Handle orphaned user message at the end
        if pending_user_idx is not None:
            exchanges.append((pending_user_idx, pending_user_idx))

        # Take the last N exchanges and build result
        recent_exchanges = exchanges[-keep_recent:] if exchanges else []

        result = []
        for start_idx, end_idx in recent_exchanges:
            result.extend(items[start_idx : end_idx + 1])

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

    async def summarize_with_agent(self, keep_recent: int = 2) -> str:
        """Summarize conversation using the agent and update session.

        Args:
            keep_recent: Number of recent USER messages to keep unsummarized

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
            # Re-check tokens in case another summarization just finished
            if self.total_tokens <= self.trigger_tokens:
                logger.info("Token count now below threshold after lock acquisition, skipping")
                return ""

            items = await self.get_items()
            if len(items) < 3:  # Need at least a few messages to summarize
                return ""

            # Emit summarization start event for UI
            call_id = f"sum_{uuid.uuid4().hex[:8]}"
            msg = json.dumps(
                {
                    "type": "function_detected",
                    "name": "summarize_conversation",
                    "call_id": call_id,
                    "arguments": json.dumps(
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

            # If nothing to summarize, don't proceed
            if not items or len(recent_items) == len(items):
                return ""

            # Build conversation text for summarization (include ALL items for context)
            conversation_text = ""
            for item in items:
                role = item.get("role", "unknown")
                content = item.get("content", "")

                # Handle tool calls specially
                if item.get("tool_calls"):
                    tool_names = [tc.get("function", {}).get("name", "unknown") for tc in item["tool_calls"]]
                    conversation_text += f"{role}: [Called tools: {', '.join(tool_names)}]\n\n"
                elif content:
                    # Truncate very long content for summarization
                    if isinstance(content, str) and len(content) > 1000:
                        content = content[:1000] + "..."
                    conversation_text += f"{role}: {content}\n\n"

            # Request summary from agent
            summary_prompt = (
                "Summarize the key points of the following conversation. "
                "Be concise but include all important context, decisions, and current task state:\n\n"
                f"{conversation_text}"
            )

            logger.info(f"Summarizing {len(items)} messages ({self.total_tokens} tokens)")

            # Run summarization (using the agent directly)
            result = await Runner.run(self.agent, summary_prompt)
            summary_text = result.final_output

            # Count summary tokens
            summary_tokens = self._count_tokens(summary_text)

            # Calculate tokens for recent items
            recent_tokens = self._calculate_total_tokens(recent_items)

            # Clear session and add summary + recent messages
            await self.clear_session()

            # Add summary as a system message
            await self.add_items([{"role": "system", "content": f"Previous conversation summary:\n{summary_text}"}])

            # Re-add recent messages (now guaranteed to have complete tool chains)
            if recent_items:
                await self.add_items(recent_items)

            # Update token count
            self.total_tokens = summary_tokens + recent_tokens
            # Reset accumulated tool tokens since they're now part of the summary
            self.accumulated_tool_tokens = 0

            # Emit summarization complete event
            output_summary = summary_text[:500] + "..." if len(summary_text) > 500 else summary_text
            msg = json.dumps(
                {
                    "type": "function_completed",
                    "call_id": call_id,
                    "success": True,
                    "output": output_summary,
                    "metadata": {
                        "tokens_before": self.total_tokens + len(items) * 10,
                        "tokens_after": summary_tokens + recent_tokens,
                        "tokens_saved": (self.total_tokens + len(items) * 10) - (summary_tokens + recent_tokens),
                    },
                }
            )
            print(f"__JSON__{msg}__JSON__", flush=True)

            logger.info(
                f"Summarization complete: {summary_tokens} tokens summary + "
                f"{recent_tokens} recent = {self.total_tokens} total"
            )

            return summary_text

    async def run_with_auto_summary(self, agent: Any, user_input: str, **kwargs):
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
        # Wait for any ongoing summarization to complete before processing
        async with self._summarization_lock:
            # Check if summarization needed
            if await self.should_summarize():
                logger.info("Triggering summarization before processing user input")
                await self.summarize_with_agent()

        # Now run with fresh context (post-summarization if it occurred)
        result = Runner.run_streamed(agent, user_input, session=self, **kwargs)

        # Note: Token count update happens after streaming completes in the caller

        return result

    def update_with_tool_tokens(self, tool_tokens: int):
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
