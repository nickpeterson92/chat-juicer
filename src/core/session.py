"""
Token-aware session management using SDK's built-in SQLiteSession.
Extends the SDK's session management with automatic token-based summarization.
"""

from __future__ import annotations

import asyncio
import json
import uuid

from pathlib import Path
from typing import Any, ClassVar

from agents import Runner, SQLiteSession
from openai import AsyncOpenAI

from core.constants import KEEP_LAST_N_MESSAGES, MODEL_TOKEN_LIMITS, get_settings
from core.prompts import CONVERSATION_SUMMARIZATION_PROMPT
from models.event_models import FunctionEventMessage
from models.session_models import ContentItem
from utils.logger import logger
from utils.token_utils import count_tokens


class MessageNormalizer:
    """Normalizes Agent/Runner messages for OpenAI chat.completions API."""

    # Valid content types for OpenAI chat.completions API
    VALID_CONTENT_TYPES: ClassVar[set[str]] = {"text", "image_url", "input_audio", "refusal", "audio", "file"}

    def __init__(self) -> None:
        """Initialize the message normalizer with content type handlers."""
        # Strategy pattern for handling different SDK internal item types
        self.content_type_handlers = {
            "function_call": self._handle_function_call,
            "function_call_output": self._handle_function_call_output,
            "reasoning": self._handle_reasoning,
        }

    def normalize_content(self, content: str | list[ContentItem] | ContentItem) -> str:
        """Normalize Agent/Runner content to OpenAI format.

        Args:
            content: Content from Agent/Runner (string, list, or dict)

        Returns:
            Normalized string content
        """
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            return self._normalize_content_list(content)

        # Handle other types by converting to string
        return str(content) if content else ""

    def _normalize_content_list(self, content_list: list[ContentItem]) -> str:
        """Normalize a list of content items.

        Args:
            content_list: List of content items from Agent/Runner

        Returns:
            Normalized string content
        """
        text_parts = []

        for content_item in content_list:
            if isinstance(content_item, dict):
                text_part = self._extract_text_from_dict(content_item)
                if text_part:
                    text_parts.append(text_part)
            elif isinstance(content_item, str):
                text_parts.append(content_item)

        return "\n".join(text_parts) if text_parts else ""

    def _extract_text_from_dict(self, content_item: dict[str, Any]) -> str | None:
        """Extract text from a dictionary content item.

        Args:
            content_item: Dictionary containing content

        Returns:
            Extracted text or None
        """
        content_type = content_item.get("type", "")

        # For invalid types (like "output_text"), extract the text
        if content_type and content_type not in self.VALID_CONTENT_TYPES:
            # Try to extract text content regardless of the type
            if "text" in content_item:
                return str(content_item["text"])
            elif "output" in content_item:
                return str(content_item["output"])
        elif content_type in self.VALID_CONTENT_TYPES:
            # For valid types, preserve them if it's text
            if content_type == "text" and "text" in content_item:
                return str(content_item["text"])
        elif "text" in content_item:
            # No type field, but has text
            return str(content_item["text"])

        return None

    def normalize_item(self, item: Any) -> dict[str, Any] | None:
        """Normalize a single conversation item.

        Args:
            item: Conversation item from Agent/Runner

        Returns:
            Normalized message dict or None if should be skipped
        """
        role = item.get("role")

        # Process items with valid roles
        if role in ["user", "assistant", "system", "tool"]:
            content = item.get("content", "")
            normalized_content = self.normalize_content(content)
            return {"role": role, "content": normalized_content}

        # Handle items without proper roles (Agent/Runner SDK internal items)
        if not role or role == "unknown":
            return self._handle_internal_item(item)

        return None

    def _handle_internal_item(self, item: Any) -> dict[str, Any] | None:
        """Handle SDK internal items without proper roles.

        Args:
            item: Internal SDK item

        Returns:
            Normalized message dict or None if should be skipped
        """
        item_type = item.get("type", "")

        # Use strategy pattern for known types
        if item_type in self.content_type_handlers:
            return self.content_type_handlers[item_type](item)

        # Handle unknown types with output
        if "output" in item:
            return {"role": "assistant", "content": f"[Output: {item.get('output')}]"}

        return None

    def _handle_function_call(self, item: Any) -> dict[str, Any]:
        """Handle function_call type items."""
        tool_name = item.get("name", "unknown")
        arguments = item.get("arguments", "{}")
        return {"role": "assistant", "content": f"[Called tool: {tool_name} with arguments: {arguments}]"}

    def _handle_function_call_output(self, item: Any) -> dict[str, Any]:
        """Handle function_call_output type items."""
        output = item.get("output", "")
        return {"role": "assistant", "content": f"[Tool result: {output}]"}

    def _handle_reasoning(self, item: Any) -> dict[str, Any] | None:
        """Handle reasoning type items - skip for summarization."""
        return None  # Skip reasoning items (usually empty)

    def create_summary_messages(self, items: list[Any], system_prompt: str) -> Any:
        """Create normalized messages for summarization.

        Args:
            items: List of conversation items
            system_prompt: System prompt for summarization

        Returns:
            List of normalized messages for chat.completions API
        """
        messages = [{"role": "system", "content": system_prompt}]

        # Process and normalize all items
        for item in items:
            normalized_msg = self.normalize_item(item)
            if normalized_msg:  # Only add if not None (skipped)
                messages.append(normalized_msg)

        # Add the summary request
        messages.append(
            {
                "role": "user",
                "content": "Please summarize the above conversation and NOTHING else. Do NOT ask any follow up questions. A summary is the ONLY thing I need from you.",
            }
        )

        return messages


class TokenAwareSQLiteSession(SQLiteSession):
    """Extends SQLiteSession with automatic token-based summarization."""

    def __init__(
        self,
        session_id: str,
        db_path: str | Path | None = None,
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
        # Initialize parent SQLiteSession - use ":memory:" as default instead of None
        super().__init__(session_id, db_path if db_path is not None else ":memory:")

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

    def _calculate_total_tokens(self, items: list[dict[str, Any]]) -> int:
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

    def calculate_items_tokens(self, items: list[dict[str, Any]]) -> int:
        """Public method to calculate total tokens from conversation items.

        Args:
            items: List of conversation items

        Returns:
            Total token count
        """
        return self._calculate_total_tokens(items)

    def _collect_recent_exchanges(self, items: list[dict[str, Any]], keep_recent: int) -> list[dict[str, Any]]:
        """Collect the most recent complete user-assistant exchanges.

        Uses a single forward pass O(n) algorithm.

        Args:
            items: List of conversation items
            keep_recent: Number of recent user messages to keep

        Returns:
            List of items representing the most recent exchanges
        """
        if not items or keep_recent <= 0:
            logger.info(f"_collect_recent_exchanges: No items or keep_recent={keep_recent}")
            return []

        # Find all complete exchanges in a single forward pass
        exchanges = []
        pending_user_idx = None

        for i, item in enumerate(items):
            role = item.get("role")

            # Skip tool results but NOT assistant messages with tool_calls
            # In Agent/Runner, assistant messages often include tool_calls
            if role == "tool":
                continue

            if role == "user":
                pending_user_idx = i  # Start of potential exchange

            elif role == "assistant" and pending_user_idx is not None:
                # Complete exchange found! (includes assistant messages with tool_calls)
                exchanges.append((pending_user_idx, i))
                pending_user_idx = None

        # Handle orphaned user message at the end
        if pending_user_idx is not None:
            exchanges.append((pending_user_idx, pending_user_idx))

        # Take the last N exchanges and build result
        recent_exchanges = exchanges[-keep_recent:] if exchanges else []
        logger.info(f"Found {len(exchanges)} total exchanges, keeping last {len(recent_exchanges)}")

        # Only include the user and assistant messages, not tool calls/results
        # This prevents massive tool chains from being considered "recent"
        result = [
            items[i]
            for start_idx, end_idx in recent_exchanges
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

    async def summarize_with_agent(self, keep_recent: int = KEEP_LAST_N_MESSAGES) -> str:
        """Summarize conversation using the agent and update session.

        Args:
            keep_recent: Number of recent USER messages to keep unsummarized
                (default from KEEP_LAST_N_MESSAGES constant)

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
            summary_text = await self._perform_summarization(keep_recent)
            return summary_text

    async def _perform_summarization(self, keep_recent: int) -> str:
        """Internal method to perform summarization with reduced complexity.

        Args:
            keep_recent: Number of recent USER messages to keep unsummarized

        Returns:
            The summary text or empty string if summarization not needed/failed
        """
        # Re-check tokens in case another summarization just finished
        if self.total_tokens <= self.trigger_tokens:
            logger.info("Token count now below threshold after lock acquisition, skipping")
            return ""

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

        if len(items) < 3:  # Need at least a few messages to summarize
            logger.warning("Not enough items to summarize (< 3)")
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

    def _prepare_summary_items(self, items: list[Any], keep_recent: int) -> tuple[str, list[Any]]:
        """Prepare recent items to keep after summarization.

        Args:
            items: All conversation items
            keep_recent: Number of recent user messages to keep

        Returns:
            Tuple of (call_id, list of recent items to preserve)
        """
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

        return call_id, recent_items

    async def _generate_summary_text(self, items: list[Any]) -> str:
        """Generate summary text from conversation items.

        Args:
            items: Conversation items to summarize

        Returns:
            Generated summary text
        """
        logger.info(f"Summarizing {len(items)} messages ({self.total_tokens} tokens)")

        # Use the responses API (same as Agent/Runner uses internally)
        # This handles complex content structures seamlessly

        # Create client using validated settings
        settings = get_settings()
        api_key = settings.azure_openai_api_key
        endpoint = settings.azure_endpoint_str
        deployment = settings.azure_openai_deployment

        client = AsyncOpenAI(api_key=api_key, base_url=endpoint)

        # System prompt with summarization instructions from prompts.py
        system_prompt = CONVERSATION_SUMMARIZATION_PROMPT

        # Build messages using the new normalizer
        normalizer = MessageNormalizer()
        messages = normalizer.create_summary_messages(items, system_prompt)

        # Use standard chat.completions API with normalized messages
        response = await client.chat.completions.create(
            model=deployment,
            messages=messages,
            max_completion_tokens=3000,
        )

        return response.choices[0].message.content or ""

    async def _update_session_with_summary(self, summary_text: str, recent_items: list[Any], call_id: str) -> None:
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

        # Add summary as a system message
        await self.add_items([{"role": "system", "content": f"Previous conversation summary:\n{summary_text}"}])

        # Re-add recent messages (now guaranteed to have complete tool chains)
        if recent_items:
            await self.add_items(recent_items)

        # Update token count
        old_tokens = self.total_tokens
        self.total_tokens = summary_tokens + recent_tokens
        # Reset accumulated tool tokens since they're now part of the summary
        self.accumulated_tool_tokens = 0

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

    async def run_with_auto_summary(self, agent: Any, user_input: str, **kwargs: Any) -> Any:
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
