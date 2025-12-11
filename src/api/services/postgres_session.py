from __future__ import annotations

import json

from typing import Any
from uuid import UUID

import asyncpg


class PostgresSession:
    """PostgreSQL-backed session adapter for OpenAI Agents SDK."""

    def __init__(self, session_id: str, session_uuid: UUID, pool: asyncpg.Pool):
        self.session_id = session_id
        self.session_uuid = session_uuid
        self.pool = pool

    async def get_items(self) -> list[dict[str, Any]]:
        """Retrieve LLM context items."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT role, content, metadata
                FROM llm_context
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                self.session_uuid,
            )
        return [
            {
                "role": row["role"],
                "content": row["content"],
                **(row["metadata"] or {}),
            }
            for row in rows
        ]

    async def add_items(self, items: list[dict[str, Any]]) -> None:
        """Add items to LLM context."""
        async with self.pool.acquire() as conn, conn.transaction():
            for item in items:
                role = item.get("role")
                content = item.get("content")
                metadata = {k: v for k, v in item.items() if k not in ("role", "content")}

                await conn.execute(
                    """
                    INSERT INTO llm_context (session_id, role, content, metadata)
                    VALUES ($1, $2, $3, $4)
                    """,
                    self.session_uuid,
                    role,
                    content if isinstance(content, str) else json.dumps(content),
                    json.dumps(metadata) if metadata else None,
                )

    async def clear_session(self) -> None:
        """Clear all LLM context."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM llm_context WHERE session_id = $1",
                self.session_uuid,
            )
