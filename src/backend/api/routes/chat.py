from __future__ import annotations

import asyncio
import contextlib

from typing import Any

import asyncpg

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from api.dependencies import DATA_FILES_PATH
from api.middleware.auth import get_current_user_from_token
from api.middleware.request_context import create_websocket_context, get_request_id
from api.services.auth_service import AuthService
from api.services.chat_service import ChatService
from api.services.file_service import LocalFileService
from api.websocket.errors import WSCloseCode, send_ws_error
from api.websocket.manager import WebSocketManager
from api.websocket.task_manager import CancellationToken
from core.constants import get_settings
from models.api_models import UserInfo
from models.error_models import ErrorCode
from utils.logger import logger
from utils.metrics import ws_messages_total

router = APIRouter()


async def _get_user_for_websocket(token: str | None, db: asyncpg.Pool, client_ip: str | None) -> UserInfo | None:
    """Resolve user for WebSocket connections."""
    settings = get_settings()

    if token:
        user = await get_current_user_from_token(token, db)
        return user

    # Allow localhost connections without auth (for local development)
    if settings.allow_localhost_noauth and client_ip in {"127.0.0.1", "localhost", "::1"}:
        auth = AuthService(db)
        default_user = await auth.get_default_user()
        if default_user:
            return UserInfo(**auth.user_payload(default_user))

    raise WebSocketDisconnect(code=4401)


@router.websocket("/chat/{session_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
) -> None:
    """WebSocket endpoint for chat streaming."""
    logger.info(f"WebSocket upgrade request received for session {session_id}")
    db = websocket.app.state.db_pool
    ws_manager: WebSocketManager = websocket.app.state.ws_manager
    mcp_manager = websocket.app.state.mcp_manager

    # Initialize WebSocket request context for logging/tracking
    client_ip = websocket.client.host if websocket.client else None
    create_websocket_context(session_id=session_id, client_ip=client_ip)

    # Authenticate user
    try:
        user = await _get_user_for_websocket(token, db, client_ip)
    except WebSocketDisconnect:
        await websocket.close(code=WSCloseCode.AUTH_REQUIRED)
        return

    if not user:
        await websocket.close(code=WSCloseCode.AUTH_REQUIRED)
        return

    # Verify session belongs to user
    from uuid import UUID

    user_id = UUID(user.id)
    async with db.acquire() as conn:
        session_owner = await conn.fetchval(
            "SELECT user_id FROM sessions WHERE session_id = $1",
            session_id,
        )

    if not session_owner:
        await websocket.close(code=4404, reason="Session not found")
        return

    if session_owner != user_id:
        await websocket.close(code=4403, reason="Access denied")
        return

    # Connect with limits checking - returns False if connection rejected
    if not await ws_manager.connect(websocket, session_id):
        # Connection was rejected (limits exceeded or shutting down)
        # Note: WebSocket is not yet accepted, so we need to accept then close with proper code
        await websocket.accept()
        await websocket.close(code=4503, reason="Service unavailable - connection limit reached")
        return

    # Ensure files are synced from S3 (Rehydration)
    # This prevents missing files if the session idled out and was cleaned up
    try:
        s3_sync = getattr(websocket.app.state, "s3_sync", None)
        if s3_sync:
            await s3_sync.sync_from_s3(session_id)
    except Exception as e:
        logger.warning(f"Failed to sync S3 files on connect for {session_id}: {e}")

    chat_service = ChatService(
        db,
        ws_manager,
        file_service=LocalFileService(base_path=DATA_FILES_PATH, pool=db, s3_sync=s3_sync),
        mcp_manager=mcp_manager,
    )

    # Track active chat task and its cancellation token for this session
    active_chat_task: asyncio.Task[None] | None = None
    active_cancellation_token: CancellationToken | None = None

    try:
        keepalive_task = asyncio.create_task(_keepalive(websocket))
        try:
            async for data in websocket.iter_json():
                # Update activity timestamp on any message
                await ws_manager.touch(websocket)
                ws_messages_total.labels(direction="inbound").inc()
                msg_type = data.get("type")

                if msg_type == "message":
                    # If there's an existing task, cancel it cooperatively
                    if active_chat_task and not active_chat_task.done():
                        if active_cancellation_token:
                            # Signal cooperative cancellation
                            await active_cancellation_token.cancel(reason="New message received")

                        # Wait for task to exit cleanly
                        try:
                            await asyncio.wait_for(active_chat_task, timeout=5.0)
                        except asyncio.TimeoutError:
                            logger.warning(f"Previous task didn't exit within timeout for {session_id}")
                            active_chat_task.cancel()
                            with contextlib.suppress(asyncio.CancelledError):
                                await active_chat_task

                    # Create fresh cancellation token for new task
                    active_cancellation_token = CancellationToken()

                    # Run chat processing as background task so we can receive interrupts
                    active_chat_task = asyncio.create_task(
                        _handle_chat_message(data, session_id, chat_service, websocket, active_cancellation_token)
                    )

                elif msg_type == "interrupt":
                    logger.info(f"Interrupt message received for session {session_id}")
                    # Only interrupt if there's an active task
                    if active_chat_task and not active_chat_task.done():
                        # First: Use SDK's stream.cancel() for proper cleanup
                        # This cancels internal tasks, clears queues, and discards incomplete turns
                        await chat_service.interrupt(session_id)

                        # Wait briefly for SDK cancel to propagate, then fall back to token
                        await asyncio.sleep(0.1)
                        if active_cancellation_token and not active_chat_task.done():
                            # Cooperative cancellation fallback
                            await active_cancellation_token.cancel(reason="User interrupt")
                            logger.info(f"Cancellation token triggered (fallback) for {session_id}")
                    else:
                        logger.info(f"No active chat task to interrupt for session {session_id}")

        finally:
            keepalive_task.cancel()
            # Clean up any running chat task
            if active_chat_task and not active_chat_task.done():
                if active_cancellation_token:
                    await active_cancellation_token.cancel(reason="Connection closing")
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
    cancellation_token: CancellationToken,
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
            cancellation_token=cancellation_token,
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
