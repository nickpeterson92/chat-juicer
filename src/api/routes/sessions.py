from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.dependencies import DB, PROJECT_ROOT, Files, Sessions
from core.constants import get_settings
from models.api_models import SessionListResponse, SessionRecord, SessionWithHistoryResponse

# Global templates path
TEMPLATES_PATH = PROJECT_ROOT / "templates"

router = APIRouter()


class CreateSessionRequest(BaseModel):
    title: str | None = None
    model: str | None = None
    mcp_config: list[str] | None = None
    reasoning_effort: str | None = None


class UpdateSessionRequest(BaseModel):
    title: str | None = None
    pinned: bool | None = None
    model: str | None = None
    mcp_config: list[str] | None = None
    reasoning_effort: str | None = None


async def get_default_user_id(db: DB) -> UUID:
    """Get default user ID for Phase 1 (single user mode)."""
    settings = get_settings()
    async with db.acquire() as conn:
        user_id = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1",
            settings.default_user_email,
        )
    if not user_id:
        raise HTTPException(status_code=500, detail="Default user not found")
    return UUID(str(user_id))


@router.get("")
async def list_sessions(
    db: DB,
    sessions: Sessions,
    offset: int = 0,
    limit: int = 50,
) -> SessionListResponse:
    """List all sessions."""
    user_id = await get_default_user_id(db)
    data = await sessions.list_sessions(user_id, offset, limit)
    return SessionListResponse(
        sessions=[SessionRecord(**s) for s in data["sessions"]],
        total_count=data["total_count"],
        has_more=data["has_more"],
    )


@router.post("")
async def create_session(
    request: CreateSessionRequest,
    db: DB,
    sessions: Sessions,
    files: Files,
) -> SessionRecord:
    """Create a new session."""
    user_id = await get_default_user_id(db)
    created = await sessions.create_session(
        user_id=user_id,
        title=request.title,
        model=request.model,
        mcp_config=request.mcp_config,
        reasoning_effort=request.reasoning_effort,
    )

    # Initialize session workspace with templates symlink
    files.init_session_workspace(created["session_id"], TEMPLATES_PATH)

    return SessionRecord(**created)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    db: DB,
    sessions: Sessions,
) -> SessionWithHistoryResponse:
    """Get session with history."""
    user_id = await get_default_user_id(db)
    result = await sessions.get_session_with_history(user_id, session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionWithHistoryResponse(
        session=SessionRecord(**result["session"]),
        full_history=result["full_history"],
        files=result["files"],
        has_more=bool(result["has_more"]),
        loaded_count=result["loaded_count"],
        message_count=result["message_count"],
    )


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    db: DB,
    sessions: Sessions,
) -> SessionRecord:
    """Update session."""
    user_id = await get_default_user_id(db)
    result = await sessions.update_session(
        user_id=user_id,
        session_id=session_id,
        **request.model_dump(exclude_none=True),
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionRecord(**result)


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: DB,
    sessions: Sessions,
) -> dict[str, bool]:
    """Delete session."""
    user_id = await get_default_user_id(db)
    success = await sessions.delete_session(user_id, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


@router.post("/{session_id}/summarize")
async def summarize_session(
    session_id: str,
    db: DB,
) -> dict[str, Any]:
    """Force summarization of session conversation.

    Creates a token-aware session, loads existing state, and triggers
    summarization regardless of threshold. Persists the summarization
    as a tool_call for frontend card restoration.
    """
    import json
    import secrets

    from uuid import UUID as UUIDType

    from api.services.token_aware_session import PostgresTokenAwareSession

    # Get session from database
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, model FROM sessions WHERE session_id = $1",
            session_id,
        )

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    session_uuid = UUIDType(str(row["id"]))
    model = row["model"]

    # Create token-aware session and load state
    session = PostgresTokenAwareSession(session_id, session_uuid, db, model=model)
    await session.load_token_state_from_db()

    tokens_before = session.total_tokens

    # Force summarization (bypass threshold check)
    summary = await session.summarize_with_agent(force=True)

    if not summary:
        return {
            "success": False,
            "error": "Summarization skipped - not enough content or already summarized",
        }

    # Persist updated token count
    await session.update_db_token_count()

    # Generate call_id for the tool card (matches frontend pattern)
    call_id = f"sum_{secrets.token_hex(4)}"

    # Persist summarization as tool_call to messages table (Layer 2)
    # This enables frontend card restoration when switching sessions
    args_json = json.dumps(
        {
            "tokens_before": tokens_before,
            "tokens_after": session.total_tokens,
        }
    )

    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO messages (
                session_id, role, content, tool_call_id, tool_name,
                tool_arguments, tool_result, tool_success
            )
            VALUES ($1, 'tool_call', $2, $3, $4, $5, $6, $7)
            """,
            session_uuid,
            "Summarized conversation",
            call_id,
            "summarize_conversation",
            args_json,
            summary,
            True,
        )

    return {
        "success": True,
        "message": summary,
        "new_token_count": session.total_tokens,
        "call_id": call_id,
    }
