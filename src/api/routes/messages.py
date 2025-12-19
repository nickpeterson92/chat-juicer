from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from api.dependencies import DB
from api.middleware.exception_handlers import SessionNotFoundError
from api.middleware.request_context import update_request_context
from api.services.message_utils import row_to_message

router = APIRouter()


@router.get("/{session_id}/messages")
async def list_messages(
    session_id: str,
    db: DB,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """List messages for a session (Layer 2 history)."""
    update_request_context(session_id=session_id)

    async with db.acquire() as conn:
        session_uuid = await conn.fetchval("SELECT id FROM sessions WHERE session_id = $1", session_id)
        if not session_uuid:
            raise SessionNotFoundError(session_id)

        rows = await conn.fetch(
            """
            SELECT * FROM messages
            WHERE session_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            """,
            session_uuid,
            limit,
            offset,
        )

    messages = [row_to_message(row) for row in rows]
    return {"messages": list(reversed(messages))}
