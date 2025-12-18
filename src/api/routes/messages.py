from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from api.dependencies import DB
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
    async with db.acquire() as conn:
        session_uuid = await conn.fetchval("SELECT id FROM sessions WHERE session_id = $1", session_id)
        if not session_uuid:
            raise HTTPException(status_code=404, detail="Session not found")

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
