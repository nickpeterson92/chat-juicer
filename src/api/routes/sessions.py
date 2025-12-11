from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.dependencies import DB, Sessions
from core.constants import get_settings
from models.api_models import SessionListResponse, SessionRecord, SessionWithHistoryResponse

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


@router.post("/{session_id}/clear")
async def clear_session(
    session_id: str,
    db: DB,
    sessions: Sessions,
) -> dict[str, bool]:
    """Clear session history."""
    user_id = await get_default_user_id(db)
    success = await sessions.clear_session(user_id, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}
