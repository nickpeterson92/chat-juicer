"""PostgreSQL-backed session adapter for OpenAI Agents SDK.

Simple implementation that mirrors the SDK's SQLiteSession:
- Store items as JSON blobs without interpretation
- Load items as-is without filtering or validation

The SDK knows how to handle its own item formats (reasoning, messages, etc.)
"""

from __future__ import annotations

import json
import logging
import time

from typing import Any
from uuid import UUID

import asyncpg

from utils.metrics import db_query_duration_seconds

logger = logging.getLogger(__name__)


def _parse_json_item(content: str, session_id: str) -> dict[str, Any] | None:
    """Parse JSON content from database row, returning None on failure."""
    try:
        result: dict[str, Any] = json.loads(content)
        return result
    except json.JSONDecodeError:
        logger.warning(f"Skipping invalid JSON in llm_context for session {session_id}")
        return None


class PostgresSession:
    """PostgreSQL-backed session adapter for OpenAI Agents SDK.

    Mirrors the SDK's SQLiteSession approach: store items as JSON blobs,
    load them back without interpretation. The SDK handles all the complexity.
    """

    def __init__(self, session_id: str, session_uuid: UUID, pool: asyncpg.Pool):
        self.session_id = session_id
        self.session_uuid = session_uuid
        self.pool = pool

    async def get_items(self, limit: int | None = None) -> list[dict[str, Any]]:
        """Retrieve conversation history items.

        Returns items exactly as stored - no filtering or validation.
        The SDK handles item format interpretation.

        Uses seq column for ordering - critical for reasoning models where
        reasoning items must precede their associated function_call/message items.
        """
        start_time = time.perf_counter()
        async with self.pool.acquire() as conn:
            if limit is not None:
                # Get latest N items in chronological order
                rows = await conn.fetch(
                    """
                    SELECT content FROM llm_context
                    WHERE session_id = $1
                    ORDER BY seq DESC
                    LIMIT $2
                    """,
                    self.session_uuid,
                    limit,
                )
                rows = list(reversed(rows))  # Restore chronological order
            else:
                rows = await conn.fetch(
                    """
                    SELECT content FROM llm_context
                    WHERE session_id = $1
                    ORDER BY seq ASC
                    """,
                    self.session_uuid,
                )
        duration = time.perf_counter() - start_time
        db_query_duration_seconds.labels(query_type="select").observe(duration)

        # Parse JSON items using helper function (PERF203 compliant)
        parsed = [_parse_json_item(row["content"], self.session_id) for row in rows]
        return [item for item in parsed if item is not None]

    async def add_items(self, items: list[Any]) -> None:
        """Add items to conversation history.

        Stores items as JSON blobs - no interpretation or filtering.
        The SDK passes items in the format it needs them stored.
        """
        if not items:
            return

        start_time = time.perf_counter()
        async with self.pool.acquire() as conn, conn.transaction():
            for item in items:
                # Serialize the item exactly as provided
                try:
                    content = json.dumps(item)
                except (TypeError, ValueError) as e:
                    logger.warning(f"Failed to serialize item: {e}")
                    continue

                await conn.execute(
                    """
                    INSERT INTO llm_context (session_id, role, content)
                    VALUES ($1, $2, $3)
                    """,
                    self.session_uuid,
                    "item",  # Simple marker - not used for filtering
                    content,
                )
        duration = time.perf_counter() - start_time
        db_query_duration_seconds.labels(query_type="insert").observe(duration)

    async def pop_item(self) -> dict[str, Any] | None:
        """Remove and return the most recent item."""
        start_time = time.perf_counter()
        async with self.pool.acquire() as conn, conn.transaction():
            row = await conn.fetchrow(
                """
                DELETE FROM llm_context
                WHERE id = (
                    SELECT id FROM llm_context
                    WHERE session_id = $1
                    ORDER BY seq DESC
                    LIMIT 1
                )
                RETURNING content
                """,
                self.session_uuid,
            )
        duration = time.perf_counter() - start_time
        db_query_duration_seconds.labels(query_type="delete").observe(duration)

        if not row:
            return None

        try:
            result: dict[str, Any] = json.loads(row["content"])
            return result
        except json.JSONDecodeError:
            return None
