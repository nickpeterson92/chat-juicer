from __future__ import annotations

import json

from typing import Any

from fastapi import APIRouter, HTTPException

from api.dependencies import DB

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

    messages = []
    for row in rows:
        # Extract partial flag from metadata JSONB
        metadata = row.get("metadata") or {}
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = {}

        msg: dict[str, Any] = {
            "id": str(row["id"]),
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }

        # Add partial flag if present in metadata (for interrupted responses)
        if metadata.get("partial"):
            msg["partial"] = True

        # For tool_call messages, include tool-specific fields matching legacy format
        # Legacy shape: role, content (tool name), call_id, name, arguments, result, status
        if row["role"] == "tool_call":
            # Parse arguments from JSON string if stored that way
            args = row["tool_arguments"]
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    pass  # Keep as string if not valid JSON
            msg.update(
                {
                    "call_id": row["tool_call_id"],
                    "name": row["tool_name"],
                    "arguments": args,
                    "result": row["tool_result"],
                    "status": "completed",  # All persisted tool calls are completed
                    "success": row["tool_success"],
                }
            )
        messages.append(msg)

    return {"messages": list(reversed(messages))}
