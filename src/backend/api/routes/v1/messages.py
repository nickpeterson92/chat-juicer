"""
Message pagination endpoints (v1).

Provides paginated message retrieval for sessions with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

import contextlib
import json

from typing import Annotated

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel, ConfigDict, Field

from api.dependencies import DB
from api.middleware.exception_handlers import SessionNotFoundError
from api.middleware.request_context import update_request_context
from api.services.message_utils import _extract_display_content, calculate_tool_status
from models.schemas.base import PaginationMeta
from models.schemas.sessions import MessageResponse

router = APIRouter()


# =============================================================================
# Response Models
# =============================================================================


class MessageListResponse(BaseModel):
    """Paginated message list."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "messages": [
                    {
                        "id": "msg_123",
                        "role": "user",
                        "content": "Hello!",
                        "created_at": "2025-01-15T10:30:00Z",
                    },
                    {
                        "id": "msg_124",
                        "role": "assistant",
                        "content": "Hi there!",
                        "created_at": "2025-01-15T10:30:05Z",
                    },
                ],
                "pagination": {
                    "total_count": 24,
                    "offset": 0,
                    "limit": 50,
                    "has_more": False,
                },
            }
        }
    )

    messages: list[MessageResponse] = Field(
        ...,
        description="List of messages",
    )
    pagination: PaginationMeta = Field(
        ...,
        description="Pagination metadata",
    )


# =============================================================================
# Path Parameter Types
# =============================================================================

SessionIdPath = Annotated[
    str,
    Path(
        ...,
        description="Session identifier",
        examples=["sess_abc123"],
    ),
]


# =============================================================================
# Endpoints
# =============================================================================


@router.get(
    "/{session_id}/messages",
    response_model=MessageListResponse,
    summary="List messages",
    description="Retrieve paginated messages for a session. Uses offset/limit for pagination. Messages are returned in chronological order (oldest first within the batch).",
    responses={
        200: {
            "description": "Messages retrieved successfully",
            "content": {
                "application/json": {
                    "example": {
                        "messages": [{"id": "msg_1", "role": "user", "content": "Hello"}],
                        "pagination": {
                            "total_count": 24,
                            "offset": 0,
                            "limit": 50,
                            "has_more": False,
                        },
                    }
                }
            },
        },
        404: {"description": "Session not found"},
    },
)
async def list_messages(
    session_id: SessionIdPath,
    db: DB,
    offset: Annotated[
        int,
        Query(ge=0, description="Number of messages to skip (from oldest)", examples=[0]),
    ] = 0,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Maximum messages to return", examples=[50]),
    ] = 50,
) -> MessageListResponse:
    """List messages with offset/limit pagination."""
    update_request_context(session_id=session_id)

    async with db.acquire() as conn:
        # Get session UUID
        session_row = await conn.fetchrow(
            "SELECT id FROM sessions WHERE session_id = $1",
            session_id,
        )

        if not session_row:
            raise SessionNotFoundError(session_id)

        session_uuid = session_row["id"]

        # Get total count
        total_count = await conn.fetchval(
            "SELECT COUNT(*) FROM messages WHERE session_id = $1",
            session_uuid,
        )

        # Get paginated messages (chronological order with offset from oldest)
        rows = await conn.fetch(
            """
            SELECT id, role, content, created_at,
                   tool_call_id, tool_name, tool_arguments, tool_result, tool_success, metadata
            FROM messages
            WHERE session_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
            """,
            session_uuid,
            limit,
            offset,
        )

    messages = []
    for row in rows:  # Already in chronological order
        # Parse tool_arguments if stored as JSON-encoded string
        args = row["tool_arguments"]
        if isinstance(args, str):
            with contextlib.suppress(json.JSONDecodeError):
                args = json.loads(args)

        # Parse metadata column
        metadata = row.get("metadata")
        if isinstance(metadata, str):
            with contextlib.suppress(json.JSONDecodeError):
                metadata = json.loads(metadata)
        metadata = metadata or {}

        # Determine status, favoring interrupted if present in metadata
        status = None
        if row["tool_call_id"]:
            status = calculate_tool_status(metadata, row["tool_success"])

        messages.append(
            MessageResponse(
                id=str(row["id"]),
                role=row["role"],
                content=_extract_display_content(row["content"]),
                created_at=row["created_at"].isoformat() if row["created_at"] else None,
                tool_call_id=row["tool_call_id"],
                tool_name=row["tool_name"],
                tool_arguments=args,
                tool_result=row["tool_result"],
                tool_success=row["tool_success"],
                status=status,
                metadata=metadata,
            )
        )

    return MessageListResponse(
        messages=messages,
        pagination=PaginationMeta(
            total_count=total_count,
            offset=offset,
            limit=limit,
            has_more=offset + limit < total_count,
        ),
    )
