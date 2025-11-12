"""Conversation summarization orchestration and summary generation."""

from __future__ import annotations

import asyncio
import uuid

from typing import Any, cast

from agents import Agent, Runner, TResponseInputItem

from core.constants import DEFAULT_MODEL, MIN_MESSAGES_FOR_SUMMARIZATION
from core.prompts import CONVERSATION_SUMMARIZATION_REQUEST
from models.event_models import FunctionEventMessage
from utils.json_utils import json_compact
from utils.logger import logger

from .exchange_collector import ExchangeCollector


class SummarizationOrchestrator:
    """Orchestrates multi-step summarization workflow.

    Responsibilities:
    - Validate summarization preconditions
    - Coordinate exchange collection
    - Generate summary using Agent/Runner
    - Delegate session repopulation
    - Emit IPC events for UI progress
    """

    def __init__(
        self,
        session_id: str,
        agent: Agent | None,
        session_instance: Any,  # TokenAwareSQLiteSession
        full_history_store: Any,
        session_manager: Any,
    ):
        self.session_id = session_id
        self.agent = agent
        self.session = session_instance
        self.full_history_store = full_history_store
        self.session_manager = session_manager

        # Async lock to prevent concurrent summarizations
        self._lock = asyncio.Lock()

    async def summarize(self, keep_recent: int, force: bool = False) -> str:
        """Execute summarization workflow with locking.

        Args:
            keep_recent: Number of recent user messages to preserve
            force: Bypass threshold check for manual summarization

        Returns:
            Generated summary text or empty string if failed
        """
        if not self.agent:
            raise ValueError("Agent required for summarization")

        # Try to acquire lock (skip if already summarizing)
        if self._lock.locked():
            logger.info("Summarization already in progress, skipping")
            return ""

        async with self._lock:
            return await self._perform_summarization(keep_recent, force)

    async def _perform_summarization(self, keep_recent: int, force: bool) -> str:
        """Internal summarization implementation.

        Workflow:
        1. Validate preconditions (token threshold, min messages)
        2. Emit start event (IPC)
        3. Collect recent exchanges to preserve
        4. Generate summary via Agent/Runner
        5. Delegate session repopulation
        6. Emit completion event (IPC)
        """
        # Re-check threshold after acquiring lock
        if not force and not self.session.token_tracker.should_summarize():
            logger.info("Tokens below threshold after lock, skipping")
            return ""

        if force:
            logger.info(
                f"Manual summarization forced "
                f"({self.session.token_tracker.total_tokens}/"
                f"{self.session.token_tracker.trigger_tokens} tokens)"
            )

        # Get conversation items
        items = await self.session.get_items()

        # Analyze for logging
        role_counts: dict[str, int] = {}
        for item in items:
            role = str(item.get("role", "unknown"))
            role_counts[role] = role_counts.get(role, 0) + 1

        logger.info(f"Summarization check: {len(items)} items - Roles: {role_counts}")

        # Validate minimum messages
        if len(items) < MIN_MESSAGES_FOR_SUMMARIZATION:
            logger.warning(f"Not enough items to summarize (< {MIN_MESSAGES_FOR_SUMMARIZATION})")
            return ""

        # Collect recent exchanges
        recent_items = ExchangeCollector.collect_recent_exchanges(items, keep_recent)

        # Nothing to summarize if all items are recent
        if len(recent_items) == len(items):
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

            # Delegate session repopulation
            from .session_repopulation import SessionRepopulator

            repopulator = SessionRepopulator(self.session, self.session_manager)
            await repopulator.repopulate_with_summary(summary_text, recent_items, call_id)

            return summary_text

        except Exception as e:
            logger.error(f"Summarization failed: {e}", exc_info=True)
            await self._emit_completion_event(call_id, success=False, error=str(e))
            return ""

    def _emit_start_event(self, items: list[TResponseInputItem]) -> str:
        """Emit summarization start event for UI."""
        call_id = f"sum_{uuid.uuid4().hex[:8]}"
        msg = json_compact(
            {
                "type": "function_detected",
                "name": "summarize_conversation",
                "call_id": call_id,
                "arguments": json_compact(
                    {
                        "messages_count": len(items),
                        "tokens_before": self.session.token_tracker.total_tokens,
                        "threshold": self.session.token_tracker.trigger_tokens,
                    }
                ),
            }
        )
        print(f"__JSON__{msg}__JSON__", flush=True)
        return call_id

    async def _emit_completion_event(
        self,
        call_id: str,
        success: bool = True,
        error: str | None = None,
        output: str | None = None,
    ) -> None:
        """Emit completion event to frontend."""
        event = FunctionEventMessage(
            type="function_completed",
            call_id=call_id,
            success=success,
            error=error,
            output=output,
        )
        msg = event.to_json()
        print(f"__JSON__{msg}__JSON__", flush=True)

    async def _generate_summary(self, items: list[TResponseInputItem]) -> str:
        """Generate summary using Agent/Runner pattern.

        Creates one-shot summarization agent with generic instructions
        and appends summarization request to conversation items.
        """
        logger.info(f"Summarizing {len(items)} messages ({self.session.token_tracker.total_tokens} tokens)")

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
