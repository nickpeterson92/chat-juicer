from __future__ import annotations

import json
import secrets
import shutil

from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from api.services.message_utils import row_to_message
from core.constants import DATA_FILES_PATH, DEFAULT_MODEL, MODEL_TOKEN_LIMITS
from utils.logger import logger


class SessionService:
    """Session business logic backed by PostgreSQL."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    def _generate_session_id(self) -> str:
        """Generate unique session ID."""
        return f"chat_{secrets.token_hex(4)}"

    async def create_session(
        self,
        user_id: UUID,
        title: str | None = None,
        model: str | None = None,
        mcp_config: list[str] | None = None,
        reasoning_effort: str | None = None,
    ) -> dict[str, Any]:
        """Create a new session."""
        session_id = self._generate_session_id()

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO sessions (
                    user_id, session_id, title, model, mcp_config, reasoning_effort
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                user_id,
                session_id,
                title,
                model or DEFAULT_MODEL,
                json.dumps(mcp_config or ["sequential-thinking", "fetch"]),
                reasoning_effort or "medium",
            )
        return self._row_to_session(row)

    async def get_session(self, user_id: UUID, session_id: str) -> dict[str, Any] | None:
        """Get session by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM sessions
                WHERE user_id = $1 AND session_id = $2
                """,
                user_id,
                session_id,
            )
        if not row:
            return None
        return self._row_to_session(row)

    async def get_session_with_history(
        self,
        user_id: UUID,
        session_id: str,
        message_limit: int = 50,
    ) -> dict[str, Any] | None:
        """Get session with full history for UI."""
        session = await self.get_session(user_id, session_id)
        if not session:
            return None

        # Convert string ID back to UUID for database queries
        session_uuid = UUID(session["id"])

        async with self.pool.acquire() as conn:
            message_rows = await conn.fetch(
                """
                SELECT * FROM messages
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                session_uuid,
                message_limit,
            )

            file_rows = await conn.fetch(
                """
                SELECT * FROM files
                WHERE session_id = $1
                ORDER BY uploaded_at DESC
                """,
                session_uuid,
            )

            total = await conn.fetchval(
                "SELECT COUNT(*) FROM messages WHERE session_id = $1",
                session_uuid,
            )

        messages = [row_to_message(r) for r in reversed(message_rows)]
        files = [self._row_to_file(r) for r in file_rows]

        return {
            "session": session,
            "full_history": messages,
            "files": files,
            "has_more": total > message_limit,
            "loaded_count": len(messages),
            "message_count": total,
        }

    async def list_sessions(
        self,
        user_id: UUID,
        offset: int = 0,
        limit: int = 50,
    ) -> dict[str, Any]:
        """List all sessions for user."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM sessions
                WHERE user_id = $1
                ORDER BY pinned DESC, last_used_at DESC
                LIMIT $2 OFFSET $3
                """,
                user_id,
                limit,
                offset,
            )

            total = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1",
                user_id,
            )

        sessions = [self._row_to_session(r) for r in rows]

        return {
            "sessions": sessions,
            "total_count": total,
            "has_more": offset + len(sessions) < total,
        }

    async def update_session(
        self,
        user_id: UUID,
        session_id: str,
        **updates: Any,
    ) -> dict[str, Any] | None:
        """Update session fields."""
        set_clauses = []
        values = [user_id, session_id]
        idx = 3

        allowed_fields = ["title", "pinned", "model", "reasoning_effort", "mcp_config", "is_named"]

        for field, val in updates.items():
            if field in allowed_fields and val is not None:
                to_store = json.dumps(val) if field == "mcp_config" else val
                set_clauses.append(f"{field} = ${idx}")
                values.append(to_store)
                idx += 1

        if not set_clauses:
            return await self.get_session(user_id, session_id)

        set_clauses.append(f"last_used_at = ${idx}")
        values.append(datetime.utcnow())

        query = f"""
            UPDATE sessions
            SET {', '.join(set_clauses)}
            WHERE user_id = $1 AND session_id = $2
            RETURNING *
        """

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, *values)
        if not row:
            return None
        return self._row_to_session(row)

    async def delete_session(self, user_id: UUID, session_id: str) -> bool:
        """Delete session and all related data including files."""
        async with self.pool.acquire() as conn:
            result: str = await conn.execute(
                """
                DELETE FROM sessions
                WHERE user_id = $1 AND session_id = $2
                """,
                user_id,
                session_id,
            )

        deleted: bool = result == "DELETE 1"

        # Clean up session files from disk
        if deleted:
            session_dir = DATA_FILES_PATH / session_id
            if session_dir.exists():
                try:
                    shutil.rmtree(session_dir)
                    logger.info(f"Deleted session files: {session_dir}")
                except Exception as e:
                    logger.warning(f"Failed to delete session files: {e}")

        return deleted

    def _get_model_limit(self, model: str) -> int:
        """Get token limit for a model."""
        if model in MODEL_TOKEN_LIMITS:
            limit: int = MODEL_TOKEN_LIMITS[model]
            return limit
        # Try partial match for deployment names
        for known_model, model_limit in MODEL_TOKEN_LIMITS.items():
            if known_model in model.lower():
                limit = int(model_limit)
                return limit
        # Conservative default
        return 15000

    def _row_to_session(self, row: asyncpg.Record) -> dict[str, Any]:
        """Convert database row to session dict."""
        model = row["model"]
        max_tokens = self._get_model_limit(model)
        trigger_tokens = int(max_tokens * 0.8)  # 80% threshold

        return {
            "id": str(row["id"]),
            "session_id": row["session_id"],
            "title": row["title"],
            "model": model,
            "reasoning_effort": row["reasoning_effort"],
            "mcp_config": json.loads(row["mcp_config"]) if row["mcp_config"] else [],
            "pinned": row["pinned"],
            "is_named": row["is_named"],
            "message_count": row["message_count"],
            "turn_count": row["turn_count"],
            "total_tokens": row["total_tokens"],
            # Token fields for frontend indicator
            "tokens": row["total_tokens"] or 0,
            "max_tokens": max_tokens,
            "trigger_tokens": trigger_tokens,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
        }

    def _row_to_file(self, row: asyncpg.Record) -> dict[str, Any]:
        """Convert database row to file dict."""
        return {
            "id": str(row["id"]),
            "name": row["filename"],
            "type": "file",
            "size": row["size_bytes"],
            "folder": row["folder"],
            "uploaded_at": row["uploaded_at"].isoformat() if row["uploaded_at"] else None,
        }
