from __future__ import annotations

import asyncio
import contextlib

from typing import Any

import asyncpg

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from api.dependencies import DATA_FILES_PATH
from api.middleware.auth import get_current_user_from_token
from api.middleware.request_context import create_websocket_context, get_request_id
from api.services.chat_service import ChatService
from api.services.file_service import LocalFileService
from api.websocket.errors import WSCloseCode, send_ws_error
from api.websocket.manager import WebSocketManager
from core.constants import get_settings
from models.error_models import ErrorCode
from utils.logger import logger

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
    ws_manager: WebSocketManager = websocket.app.state.ws_manager
    mcp_pool = websocket.app.state.mcp_pool

    # Initialize WebSocket request context for logging/tracking
    client_ip = websocket.client.host if websocket.client else None
    create_websocket_context(session_id=session_id, client_ip=client_ip)

    try:
        await _get_user_for_websocket(token, db)
    except WebSocketDisconnect:
        await websocket.close(code=WSCloseCode.AUTH_REQUIRED)
        return

    await ws_manager.connect(websocket, session_id)

    chat_service = ChatService(
        db,
        ws_manager,
        file_service=LocalFileService(base_path=DATA_FILES_PATH, pool=db),
        mcp_pool=mcp_pool,
    )

    # Track active chat task for this session
    active_chat_task: asyncio.Task[None] | None = None

    try:
        keepalive_task = asyncio.create_task(_keepalive(websocket))
        try:
            async for data in websocket.iter_json():
                # Update activity timestamp on any message
                await ws_manager.touch(websocket)
                msg_type = data.get("type")

                if msg_type == "message":
                    # If there's an existing task, interrupt it and wait for clean exit
                    if active_chat_task and not active_chat_task.done():
                        await chat_service.interrupt(session_id)
                        # Wait for task to exit cleanly (flag-based, no task.cancel needed)
                        try:
                            await asyncio.wait_for(active_chat_task, timeout=5.0)
                        except asyncio.TimeoutError:
                            logger.warning(f"Previous task didn't exit within timeout for {session_id}")
                            active_chat_task.cancel()
                            with contextlib.suppress(asyncio.CancelledError):
                                await active_chat_task

                    # Clear interrupt flag before starting new task
                    chat_service.clear_interrupt(session_id)

                    # Run chat processing as background task so we can receive interrupts
                    active_chat_task = asyncio.create_task(
                        _handle_chat_message(data, session_id, chat_service, websocket)
                    )

                elif msg_type == "interrupt":
                    logger.info(f"Interrupt message received for session {session_id}")
                    # Only interrupt if there's an active task
                    if active_chat_task and not active_chat_task.done():
                        # Set interrupt flag and send immediate feedback to frontend
                        # Stream loop will detect flag and exit cleanly, sending assistant_end
                        await chat_service.interrupt(session_id)
                        logger.info(f"Interrupt flag set for session {session_id}")
                    else:
                        logger.info(f"No active chat task to interrupt for session {session_id}")

        finally:
            keepalive_task.cancel()
            # Clean up any running chat task
            if active_chat_task and not active_chat_task.done():
                active_chat_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await active_chat_task
    except WebSocketDisconnect:
        pass  # Normal client disconnect
    except RuntimeError as e:
        # Handle "WebSocket is not connected" errors gracefully
        if "not connected" in str(e).lower():
            pass  # Client disconnected mid-request
        else:
            raise
    finally:
        await ws_manager.disconnect(websocket, session_id)


async def _handle_chat_message(
    data: dict[str, Any],
    session_id: str,
    chat_service: ChatService,
    websocket: WebSocket,
) -> None:
    """Handle chat message processing (runs as background task)."""
    messages = data.get("messages", [])
    model = data.get("model")
    reasoning_effort = data.get("reasoning_effort")

    try:
        await chat_service.process_chat(
            session_id=session_id,
            messages=messages,
            model=model,
            reasoning_effort=reasoning_effort,
        )
    except asyncio.CancelledError:
        raise  # Let cancellation propagate
    except Exception as e:
        # Log error with request context
        logger.error(
            f"Chat processing error: {e}",
            session_id=session_id,
            request_id=get_request_id(),
            exc_info=True,
        )
        # Send error to client via WebSocket
        await send_ws_error(
            websocket,
            code=ErrorCode.INTERNAL_ERROR,
            message=f"Chat processing failed: {type(e).__name__}",
            session_id=session_id,
            recoverable=True,
        )


async def _keepalive(websocket: WebSocket) -> None:
    """Send periodic ping frames."""
    while True:
        await asyncio.sleep(30)
        try:
            await websocket.send_json({"type": "ping"})
        except Exception:
            break
