from __future__ import annotations

import asyncio

from typing import Any

import asyncpg

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from api.middleware.auth import get_current_user_from_token
from api.services.chat_service import ChatService
from api.services.file_service import LocalFileService
from api.websocket.manager import ws_manager
from core.constants import get_settings

router = APIRouter()


async def _get_user_for_websocket(token: str | None, db: asyncpg.Pool) -> Any | None:
    """Resolve user for WebSocket connections."""
    settings = get_settings()
    if token:
        user = await get_current_user_from_token(token, db)
        return user
    if settings.allow_localhost_noauth:
        return None
    raise WebSocketDisconnect(code=4401)


@router.websocket("/chat/{session_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
) -> None:
    """WebSocket endpoint for chat streaming."""
    db = websocket.app.state.db_pool
    mcp_servers = getattr(websocket.app.state, "mcp_servers", [])

    try:
        await _get_user_for_websocket(token, db)
    except WebSocketDisconnect:
        await websocket.close(code=4401)
        return

    await ws_manager.connect(websocket, session_id)

    chat_service = ChatService(db, mcp_servers, ws_manager, file_service=LocalFileService(pool=db))

    try:
        keepalive_task = asyncio.create_task(_keepalive(websocket))
        try:
            async for data in websocket.iter_json():
                await _handle_message(data, session_id, chat_service)
        finally:
            keepalive_task.cancel()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket, session_id)


async def _handle_message(
    data: dict[str, Any],
    session_id: str,
    chat_service: ChatService,
) -> None:
    """Handle incoming WebSocket message."""
    msg_type = data.get("type")

    if msg_type == "message":
        messages = data.get("messages", [])
        model = data.get("model")
        reasoning_effort = data.get("reasoning_effort")

        await chat_service.process_chat(
            session_id=session_id,
            messages=messages,
            model=model,
            reasoning_effort=reasoning_effort,
        )

    elif msg_type == "interrupt":
        await chat_service.interrupt(session_id)


async def _keepalive(websocket: WebSocket) -> None:
    """Send periodic ping frames."""
    while True:
        await asyncio.sleep(30)
        try:
            await websocket.send_json({"type": "ping"})
        except Exception:
            break
