"""
Summarization service for generating session summaries.

Creates concise summaries of conversation history for embedding.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

import asyncpg

from core.constants import DEFAULT_MODEL, get_settings
from core.prompts import CONVERSATION_SUMMARIZATION_INSTRUCTIONS
from utils.client_factory import create_openai_client
from utils.logger import logger

if TYPE_CHECKING:
    from openai import AsyncOpenAI

# Summarization configuration
SUMMARY_TURN_THRESHOLD = 10  # Summarize every N turns
SUMMARY_MAX_TOKENS = 500  # Target summary length
SUMMARY_MODEL = DEFAULT_MODEL  # Use default chat model


class SummarizationService:
    """Generate session summaries for embedding.

    Produces concise summaries of conversation history that capture:
    - Main user requests and goals
    - Key tools/functions used
    - Important findings or results
    - Current task state
    - Any errors or issues
    """

    def __init__(self, pool: asyncpg.Pool, client: AsyncOpenAI | None = None) -> None:
        """Initialize summarization service.

        Args:
            pool: Database connection pool
            client: Optional AsyncOpenAI client. If not provided, creates one from settings.
        """
        self.pool = pool
        self._client = client

    async def _get_client(self) -> AsyncOpenAI:
        """Lazily initialize OpenAI client."""
        if self._client is None:
            settings = get_settings()
            self._client = create_openai_client(
                api_key=settings.azure_openai_api_key or "",
                base_url=str(settings.azure_openai_endpoint) if settings.azure_openai_endpoint else None,
            )
        return self._client

    async def should_summarize(self, session_id: str, project_id: UUID | None = None) -> bool:
        """Check if session needs summarization.

        Sessions are summarized when:
        - They have a project_id (sessions without projects are not embedded)
        - Turn count is at a threshold (10, 20, 30, ...)

        Args:
            session_id: Session ID to check
            project_id: Optional project ID (fetched from DB if not provided)

        Returns:
            True if session should be summarized
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT project_id, turn_count
                FROM sessions
                WHERE session_id = $1
                """,
                session_id,
            )

        if not row:
            return False

        project_id = project_id or row["project_id"]
        if not project_id:
            return False  # No project = no embedding

        turn_count = row["turn_count"] or 0
        return turn_count > 0 and turn_count % SUMMARY_TURN_THRESHOLD == 0

    async def generate_summary(self, session_id: str) -> str | None:
        """Generate a summary of the session conversation.

        Args:
            session_id: Session to summarize

        Returns:
            Summary text or None if no messages
        """
        # Fetch conversation history
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT role, content
                FROM messages
                WHERE session_id = $1
                ORDER BY created_at ASC
                LIMIT 200
                """,
                session_id,
            )

        if not rows:
            return None

        # Build conversation text for summarization
        conversation_lines = []
        for row in rows:
            role = row["role"]
            content = row["content"] or ""
            if role == "user":
                conversation_lines.append(f"User: {content[:500]}")  # Truncate long messages
            elif role == "assistant":
                conversation_lines.append(f"Assistant: {content[:500]}")

        conversation_text = "\n\n".join(conversation_lines)

        # Generate summary via LLM
        client = await self._get_client()

        try:
            response = await client.chat.completions.create(
                model=SUMMARY_MODEL,
                messages=[
                    {"role": "system", "content": CONVERSATION_SUMMARIZATION_INSTRUCTIONS},
                    {"role": "user", "content": f"Summarize this conversation:\n\n{conversation_text}"},
                ],
                max_tokens=SUMMARY_MAX_TOKENS,
                temperature=0.3,  # Lower temperature for consistent summaries
            )

            summary = response.choices[0].message.content
            if summary:
                logger.info(
                    "Generated session summary",
                    extra={"session_id": session_id, "summary_length": len(summary)},
                )
            return summary

        except Exception as e:
            logger.error(
                "Failed to generate session summary",
                extra={"session_id": session_id, "error": str(e)},
            )
            return None

    async def get_session_for_embedding(self, session_id: str) -> dict[str, Any] | None:
        """Get session data needed for embedding.

        Args:
            session_id: Session ID

        Returns:
            Dict with id, project_id, title, turn_count or None
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, session_id, project_id, title, turn_count
                FROM sessions
                WHERE session_id = $1 AND project_id IS NOT NULL
                """,
                session_id,
            )

        if not row:
            return None

        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "project_id": row["project_id"],
            "title": row["title"],
            "turn_count": row["turn_count"],
        }

    async def find_sessions_needing_summary(self, limit: int = 10) -> list[dict[str, Any]]:
        """Find sessions that need summarization.

        Finds sessions that:
        - Have a project_id
        - Have turn counts at summarization thresholds
        - Don't have recent context chunks

        Args:
            limit: Maximum sessions to return

        Returns:
            List of session dicts needing summarization
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT s.id, s.session_id, s.project_id, s.title, s.turn_count
                FROM sessions s
                WHERE s.project_id IS NOT NULL
                  AND s.turn_count > 0
                  AND (s.turn_count % $1) = 0
                  AND NOT EXISTS (
                      SELECT 1 FROM context_chunks cc
                      WHERE cc.source_id = s.id
                        AND cc.source_type = 'session_summary'
                        AND cc.created_at > s.updated_at - INTERVAL '1 minute'
                  )
                ORDER BY s.updated_at DESC
                LIMIT $2
                """,
                SUMMARY_TURN_THRESHOLD,
                limit,
            )

        return [
            {
                "id": row["id"],
                "session_id": row["session_id"],
                "project_id": row["project_id"],
                "title": row["title"],
                "turn_count": row["turn_count"],
            }
            for row in rows
        ]
