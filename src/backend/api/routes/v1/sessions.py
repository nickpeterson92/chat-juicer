"""
Session management endpoints (v1).

Provides CRUD operations for chat sessions with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

import json
import secrets

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from api.dependencies import DB, Files, Sessions
from api.middleware.auth import get_current_user
from api.middleware.exception_handlers import SessionNotFoundError
from api.middleware.request_context import update_request_context
from core.constants import TEMPLATES_PATH
from models.api_models import UserInfo
from models.schemas.base import PaginationMeta
from models.schemas.sessions import (
    CreateSessionRequest,
    DeleteSessionResponse,
    FileInfoResponse,
    MessageResponse,
    SessionListResponse,
    SessionResponse,
    SessionWithHistoryResponse,
    SummarizeResponse,
    UpdateSessionRequest,
)

router = APIRouter()

# Type alias for authenticated user dependency
CurrentUser = Annotated[UserInfo, Depends(get_current_user)]


# =============================================================================
# Path Parameter Types
# =============================================================================

SessionIdPath = Annotated[
    str,
    Path(
        ...,
        description="Session identifier",
        examples=["sess_abc123"],
        min_length=1,
        max_length=100,
    ),
]

# =============================================================================
# Endpoints
# =============================================================================


@router.get(
    "",
    response_model=SessionListResponse,
    summary="List sessions",
    description="Retrieve a paginated list of chat sessions for the current user.",
    responses={
        200: {
            "description": "Sessions retrieved successfully",
            "content": {
                "application/json": {
                    "example": {
                        "sessions": [
                            {
                                "id": "550e8400-e29b-41d4-a716-446655440000",
                                "session_id": "sess_abc123",
                                "title": "Project Discussion",
                                "model": "gpt-4o",
                                "message_count": 24,
                            }
                        ],
                        "pagination": {
                            "total_count": 42,
                            "offset": 0,
                            "limit": 50,
                            "has_more": False,
                        },
                    }
                }
            },
        }
    },
)
async def list_sessions(
    user: CurrentUser,
    sessions: Sessions,
    offset: Annotated[
        int,
        Query(ge=0, description="Number of sessions to skip", examples=[0]),
    ] = 0,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Maximum sessions to return", examples=[50]),
    ] = 50,
) -> SessionListResponse:
    """List all sessions with pagination."""
    user_id = UUID(user.id)

    data = await sessions.list_sessions(user_id, offset, limit)

    return SessionListResponse(
        sessions=[SessionResponse(**s) for s in data["sessions"]],
        pagination=PaginationMeta(
            total_count=data["total_count"],
            offset=offset,
            limit=limit,
            has_more=data["has_more"],
        ),
    )


@router.post(
    "",
    response_model=SessionResponse,
    status_code=201,
    summary="Create session",
    description="Create a new chat session with optional configuration.",
    responses={
        201: {
            "description": "Session created successfully",
            "content": {
                "application/json": {
                    "example": {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "session_id": "sess_abc123",
                        "title": None,
                        "model": "gpt-4o",
                        "reasoning_effort": "medium",
                        "message_count": 0,
                    }
                }
            },
        }
    },
)
async def create_session(
    request: CreateSessionRequest,
    user: CurrentUser,
    sessions: Sessions,
    files: Files,
) -> SessionResponse:
    """Create a new chat session."""
    user_id = UUID(user.id)

    created = await sessions.create_session(
        user_id=user_id,
        title=request.title,
        model=request.model,
        mcp_config=request.mcp_config,
        reasoning_effort=request.reasoning_effort,
    )

    # Initialize session workspace with templates symlink
    files.init_session_workspace(created["session_id"], TEMPLATES_PATH)

    return SessionResponse(**created)


@router.get(
    "/{session_id}",
    response_model=SessionWithHistoryResponse,
    summary="Get session with history",
    description="Retrieve a session with its message history and files.",
    responses={
        200: {"description": "Session retrieved successfully"},
        404: {"description": "Session not found"},
    },
)
async def get_session(
    session_id: SessionIdPath,
    user: CurrentUser,
    sessions: Sessions,
    files: Files,
) -> SessionWithHistoryResponse:
    """Get session with message history and files."""
    update_request_context(session_id=session_id)

    user_id = UUID(user.id)
    result = await sessions.get_session_with_history(user_id, session_id)

    if not result:
        raise SessionNotFoundError(session_id)

    # Sync files from S3 if S3 sync is enabled (Phase 2)
    if files.s3_sync:
        await files.s3_sync.sync_from_s3(session_id)

    return SessionWithHistoryResponse(
        session=SessionResponse(**result["session"]),
        messages=[MessageResponse(**m) for m in result["full_history"]],
        files=[FileInfoResponse(**f) for f in result["files"]],
        has_more=result["has_more"],
        loaded_count=result["loaded_count"],
        message_count=result["message_count"],
    )


@router.patch(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Update session",
    description="Update session properties (title, model, etc.).",
    responses={
        200: {"description": "Session updated successfully"},
        404: {"description": "Session not found"},
    },
)
async def update_session(
    session_id: SessionIdPath,
    request: UpdateSessionRequest,
    user: CurrentUser,
    sessions: Sessions,
) -> SessionResponse:
    """Update session properties."""
    update_request_context(session_id=session_id)

    user_id = UUID(user.id)
    result = await sessions.update_session(
        user_id=user_id,
        session_id=session_id,
        **request.model_dump(exclude_none=True),
    )

    if not result:
        raise SessionNotFoundError(session_id)

    return SessionResponse(**result)


@router.delete(
    "/{session_id}",
    response_model=DeleteSessionResponse,
    summary="Delete session",
    description="Permanently delete a session and all its data.",
    responses={
        200: {
            "description": "Session deleted successfully",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "Session deleted successfully",
                        "session_id": "sess_abc123",
                    }
                }
            },
        },
        404: {"description": "Session not found"},
    },
)
async def delete_session(
    session_id: SessionIdPath,
    user: CurrentUser,
    sessions: Sessions,
) -> DeleteSessionResponse:
    """Delete a session permanently."""
    update_request_context(session_id=session_id)

    user_id = UUID(user.id)
    success = await sessions.delete_session(user_id, session_id)

    if not success:
        raise SessionNotFoundError(session_id)

    return DeleteSessionResponse(
        success=True,
        message="Session deleted successfully",
        session_id=session_id,
    )


@router.post(
    "/{session_id}/summarize",
    response_model=SummarizeResponse,
    summary="Summarize session",
    description="Force summarization of session conversation to reduce token usage.",
    responses={
        200: {
            "description": "Summarization completed",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "Conversation summarized successfully",
                        "summary": "Discussion covered project architecture...",
                        "tokens_before": 45000,
                        "tokens_after": 12000,
                        "tool_call_id": "sum_abc123",
                    }
                }
            },
        },
        404: {"description": "Session not found"},
    },
)
async def summarize_session(
    session_id: SessionIdPath,
    user: CurrentUser,
    db: DB,
) -> SummarizeResponse:
    """Force summarization of session conversation."""
    from uuid import UUID as UUIDType

    from api.services.token_aware_session import PostgresTokenAwareSession

    update_request_context(session_id=session_id)
    user_id = UUID(user.id)

    # Get session from database - verify ownership
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, model FROM sessions WHERE session_id = $1 AND user_id = $2",
            session_id,
            user_id,
        )

    if not row:
        raise SessionNotFoundError(session_id)

    session_uuid = UUIDType(str(row["id"]))
    model = row["model"]

    # Create token-aware session and load state
    session = PostgresTokenAwareSession(session_id, session_uuid, db, model=model)
    await session.load_token_state_from_db()

    tokens_before = session.total_tokens

    # Force summarization (bypass threshold check)
    summary = await session.summarize_with_agent(force=True)

    if not summary:
        return SummarizeResponse(
            success=False,
            message="Summarization skipped - not enough content or already summarized",
        )
    # Generate call_id for the tool card
    call_id = f"sum_{secrets.token_hex(4)}"

    # Persist summarization as tool_call to messages table
    args_json = json.dumps(
        {
            "tokens_before": tokens_before,
            "tokens_after": session.total_tokens,
        }
    )

    # Persist token count and message atomically
    async with db.acquire() as conn, conn.transaction():
        await conn.execute(
            """
                UPDATE sessions
                SET total_tokens = $1, accumulated_tool_tokens = $2
                WHERE id = $3
                """,
            session.total_tokens,
            session.accumulated_tool_tokens,
            session_uuid,
        )
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

    return SummarizeResponse(
        success=True,
        message="Conversation summarized successfully",
        summary=summary,
        tokens_before=tokens_before,
        tokens_after=session.total_tokens,
        tool_call_id=call_id,
    )
