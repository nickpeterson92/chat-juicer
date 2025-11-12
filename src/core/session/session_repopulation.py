"""Rebuild session with summary and recent messages after summarization."""

from __future__ import annotations

from typing import Any

from agents import TResponseInputItem

from models.session_models import SessionUpdate
from utils.logger import logger


class SessionRepopulator:
    """Handles session repopulation after summarization.

    Responsibilities:
    - Clear existing session items
    - Add summary as system message
    - Re-add recent messages without IDs (break reasoning links)
    - Update token counts
    - Update session metadata
    - Emit completion event with metadata
    """

    def __init__(self, session_instance: Any, session_manager: Any):
        self.session = session_instance
        self.session_manager = session_manager

    async def repopulate_with_summary(
        self,
        summary_text: str,
        recent_items: list[TResponseInputItem],
        call_id: str,
    ) -> None:
        """Repopulate session with summary and recent messages.

        Args:
            summary_text: Generated summary
            recent_items: Recent exchanges to preserve
            call_id: IPC call_id from start event
        """
        # Count tokens
        summary_tokens = self.session.token_tracker.count_text_tokens(summary_text)
        recent_tokens = self.session.token_tracker.calculate_total_tokens(recent_items)

        # Clear session
        await self.session.clear_session()

        # Clear token cache (fresh start)
        self.session.token_tracker.clear_cache()
        logger.debug("Cleared token cache after summarization")

        # Use context manager to skip Layer 2 during repopulation
        with self.session.persistence.skip_full_history_context():
            # Add summary as system message
            await self.session.add_items(
                [
                    {
                        "role": "system",
                        "content": f"Previous conversation summary:\n{summary_text}",
                    }
                ]
            )

            # Re-add recent messages WITHOUT IDs
            # CRITICAL: Removing IDs breaks SDK reasoning item links
            # See: Manual summarization bug fix (2025-10-11)
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
                await self.session.add_items(cleaned_items)

        # Context manager automatically re-enables dual-save

        # Update token counts
        old_tokens = self.session.token_tracker.total_tokens
        self.session.token_tracker.total_tokens = summary_tokens + recent_tokens

        # Reset accumulated tool tokens (now in summary)
        self.session.token_tracker.accumulated_tool_tokens = 0

        # Update session metadata
        if self.session_manager:
            updates = SessionUpdate(accumulated_tool_tokens=0)
            self.session_manager.update_session(self.session.session_id, updates)
            logger.info("Updated session metadata after summarization: accumulated_tool_tokens=0")

        logger.info(
            f"Session tokens reset: {old_tokens} → "
            f"{self.session.token_tracker.total_tokens} "
            f"(summary: {summary_tokens}, recent: {recent_tokens})"
        )

        # Emit completion event with metadata
        metadata_str = (
            f"Tokens before: {old_tokens}, "
            f"Tokens after: {self.session.token_tracker.total_tokens}, "
            f"Tokens saved: {old_tokens - self.session.token_tracker.total_tokens}"
        )

        # Import to avoid circular dependency
        await self.session.summarizer._emit_completion_event(
            call_id,
            success=True,
            output=f"{summary_text}\n\n[{metadata_str}]",
        )

        logger.info(
            f"Summarization complete: {summary_tokens} tokens summary + "
            f"{recent_tokens} recent = "
            f"{self.session.token_tracker.total_tokens} total"
        )
