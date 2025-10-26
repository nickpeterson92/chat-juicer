"""Core runtime operations for Wishgate.

This module contains all business logic executed during the main event loop:
event handling, session management, message processing, and command/file handling.
All functions receive AppState as an explicit parameter to avoid hidden global state.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from openai import APIConnectionError, APIStatusError, RateLimitError

from app.state import AppState
from core.constants import (
    CHAT_HISTORY_DB_PATH,
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    LOG_PREVIEW_LENGTH,
    MAX_CONVERSATION_TURNS,
    MESSAGE_OUTPUT_ITEM,
    RUN_ITEM_STREAM_EVENT,
    SESSION_NAMING_TRIGGER_MESSAGES,
)
from core.prompts import SYSTEM_INSTRUCTIONS
from core.session import TokenAwareSQLiteSession
from core.session_commands import handle_session_command
from integrations.event_handlers import CallTracker, build_event_handlers
from integrations.mcp_registry import filter_mcp_servers
from integrations.sdk_token_tracker import connect_session
from models.ipc_models import UploadResult
from models.sdk_models import StreamEvent
from models.session_models import SessionUpdate
from tools.wrappers import create_session_aware_tools
from utils.file_utils import save_uploaded_file
from utils.ipc import IPCManager
from utils.logger import logger


async def handle_electron_ipc(event: StreamEvent, tracker: CallTracker) -> str | None:
    """Convert Agent/Runner events to Electron IPC format using a typed registry.

    Args:
        event: StreamEvent from Agent/Runner framework
        tracker: CallTracker for function call ID management

    Returns:
        IPC message string or None if no handler for event type
    """
    handlers = build_event_handlers(tracker)
    handler = handlers.get(event.type)
    if handler:
        result: str | None = handler(event)
        return result
    return None


def handle_streaming_error(error: Exception) -> None:
    """Handle streaming errors with appropriate user messages.

    Logs the error and sends user-friendly error message to UI via IPC.
    Automatically closes the stream with assistant_end message.

    Args:
        error: The exception that occurred during streaming
    """

    # Define error handlers for different exception types
    def handle_rate_limit(e: RateLimitError) -> dict[str, str]:
        logger.error(f"Rate limit error during streaming: {e}")
        return {"type": "error", "message": "Rate limit reached. Please wait a moment and try your request again."}

    def handle_connection_error(e: APIConnectionError) -> dict[str, str]:
        logger.error(f"Connection error during streaming: {e}")
        return {"type": "error", "message": "Connection interrupted. Please try your request again."}

    def handle_api_status(e: APIStatusError) -> dict[str, str]:
        logger.error(f"API status error during streaming: {e}")
        return {"type": "error", "message": f"API error (status {e.status_code}). Please try your request again."}

    def handle_generic(e: Exception) -> dict[str, str]:
        logger.error(f"Unexpected error during streaming: {e}")
        return {"type": "error", "message": "An error occurred. Please try your request again."}

    # Map exception types to handlers
    error_handlers: dict[type[Exception], Any] = {
        RateLimitError: handle_rate_limit,
        APIConnectionError: handle_connection_error,
        APIStatusError: handle_api_status,
    }

    # Get the appropriate handler or use generic
    handler = error_handlers.get(type(error), handle_generic)
    error_msg = handler(error)

    # Send error message to UI
    IPCManager.send(error_msg)

    # Send assistant_end to properly close the stream
    IPCManager.send_assistant_end()


async def ensure_session_exists(app_state: AppState) -> tuple[TokenAwareSQLiteSession, bool]:
    """Ensure a session exists, creating one if needed (lazy initialization).

    Creates session-aware tools with workspace isolation and filters MCP servers
    based on session configuration. Connects session to SDK token tracker for
    automatic token counting.

    Args:
        app_state: Application state container

    Returns:
        Tuple of (Active TokenAwareSQLiteSession instance, is_new_session flag)

    Raises:
        RuntimeError: If session_manager is not initialized
    """
    if app_state.current_session is not None:
        return app_state.current_session, False

    logger.info("No active session - creating new session on first message")

    # Type guard: session_manager must exist
    if app_state.session_manager is None:
        raise RuntimeError("Session manager not initialized")

    # Create new session metadata
    session_meta = app_state.session_manager.create_session()
    logger.info(f"Created new session: {session_meta.session_id} - {session_meta.title}")

    # Create session-aware tools that inject session_id for workspace isolation
    session_tools = create_session_aware_tools(session_meta.session_id)
    logger.info(f"Created {len(session_tools)} session-aware tools for session: {session_meta.session_id}")

    # Use MCP servers from app_state, filtered by session's mcp_config
    # Create new agent with isolated tools (instructions are global, tools are session-specific)
    session_mcp_servers = filter_mcp_servers(app_state.mcp_servers, session_meta.mcp_config)

    # Import here to avoid circular dependency
    from core.agent import create_agent

    session_agent = create_agent(app_state.deployment, SYSTEM_INSTRUCTIONS, session_tools, session_mcp_servers)
    logger.info(f"Session agent created with {len(session_mcp_servers)} MCP servers: {session_meta.mcp_config}")
    logger.info(f"Created session-specific agent with workspace isolation for: {session_meta.session_id}")

    # Create token-aware session with persistent storage and full history
    app_state.current_session = TokenAwareSQLiteSession(
        session_id=session_meta.session_id,
        db_path=CHAT_HISTORY_DB_PATH,
        agent=session_agent,
        model=app_state.deployment,
        threshold=CONVERSATION_SUMMARIZATION_THRESHOLD,
        full_history_store=app_state.full_history_store,
        session_manager=app_state.session_manager,
    )

    # Restore token counts from stored items (if any)
    items = await app_state.current_session.get_items()
    if items:
        app_state.current_session.total_tokens = app_state.current_session._calculate_total_tokens(items)
        logger.info(f"Restored session with {len(items)} items, {app_state.current_session.total_tokens} tokens")

    logger.info(f"Session ready with id: {app_state.current_session.session_id}")

    # Connect session to SDK token tracker for automatic tracking
    connect_session(app_state.current_session)

    # Return session and flag indicating this is a newly created session
    # Session creation event will be sent AFTER first message completes
    return app_state.current_session, True


async def process_user_input(session: TokenAwareSQLiteSession, user_input: str) -> None:
    """Process a single user input using token-aware SQLite session.

    Streams Agent/Runner events, converts to Electron IPC format, handles errors,
    and manages automatic summarization when token thresholds are reached.

    Args:
        session: TokenAwareSQLiteSession instance
        user_input: User's message

    Returns:
        None (session manages all state internally)
    """

    # Send start message for Electron
    IPCManager.send_assistant_start()

    response_text = ""
    tracker = CallTracker()  # Track function call IDs

    # No retry logic - fail fast on errors
    try:
        # Use the new session's convenience method that handles auto-summarization
        # This returns a RunResultStreaming object
        result = await session.run_with_auto_summary(session.agent, user_input, max_turns=MAX_CONVERSATION_TURNS)

        # Stream the events (SDK tracker handles token counting automatically)
        async for event in result.stream_events():
            # Convert to Electron IPC format with call_id tracking
            ipc_msg = await handle_electron_ipc(event, tracker)
            if ipc_msg:
                IPCManager.send_raw(ipc_msg)

            # Accumulate response text for logging
            if (
                event.type == RUN_ITEM_STREAM_EVENT
                and hasattr(event, "item")
                and event.item
                and event.item.type == MESSAGE_OUTPUT_ITEM
                and hasattr(event.item, "raw_item")
            ):
                content = getattr(event.item.raw_item, "content", []) or []  # Ensure we always have a list
                for content_item in content:
                    text = getattr(content_item, "text", "")
                    if text:
                        response_text += text

    except Exception as e:
        handle_streaming_error(e)
        return

    # Send end message
    IPCManager.send_assistant_end()

    # Log response
    if response_text:
        file_msg = f"AI: {response_text[:LOG_PREVIEW_LENGTH]}{'...' if len(response_text) > LOG_PREVIEW_LENGTH else ''}"
        logger.info(f"AI: {response_text}", extra={"file_message": file_msg})

    # SDK token tracker handles all token updates automatically
    # Just update conversation tokens from items
    items = await session.get_items()
    items_tokens = session.calculate_items_tokens(items)
    session.total_tokens = items_tokens + session.accumulated_tool_tokens

    # Log current token usage (SDK tracker already updated tool tokens)
    logger.info(
        f"Token usage: {session.total_tokens}/{session.trigger_tokens} "
        f"({int(session.total_tokens / session.trigger_tokens * 100)}%)"
    )

    # CRITICAL FIX: Check if we need to summarize AFTER the run
    # This catches cases where tool tokens pushed us over the threshold
    if await session.should_summarize():
        logger.info(f"Post-run summarization triggered: {session.total_tokens}/{session.trigger_tokens} tokens")
        await session.summarize_with_agent()

        # Log new token count after summarization
        logger.info(
            f"Token usage after summarization: {session.total_tokens}/{session.trigger_tokens} "
            f"({int(session.total_tokens / session.trigger_tokens * 100)}%)"
        )


async def handle_session_command_wrapper(app_state: AppState, command: str, data: dict[str, Any]) -> dict[str, Any]:
    """Handle session management commands (create, switch, delete, list).

    Wrapper around core.session_commands.handle_session_command that provides
    AppState context.

    Args:
        app_state: Application state container
        command: Session command name
        data: Command payload

    Returns:
        Command result dictionary
    """
    return cast(dict[str, Any], await handle_session_command(app_state, command, data))


async def handle_file_upload(app_state: AppState, upload_data: dict[str, Any]) -> UploadResult:
    """Handle file upload with session workspace isolation.

    Ensures a session exists (creating if needed), processes the upload with
    session_id for workspace isolation, and sends session creation event to
    frontend if this is a new session.

    Args:
        app_state: Application state container
        upload_data: Upload payload with filename and data

    Returns:
        UploadResult with success status and file metadata or error
    """
    logger.info(f"Processing file upload: {upload_data.get('filename')}")

    # Ensure session exists (create if needed)
    _session, is_new = await ensure_session_exists(app_state)
    session_id = app_state.session_manager.current_session_id if app_state.session_manager else None

    # Process upload with session_id
    result = save_uploaded_file(filename=upload_data["filename"], data=upload_data["data"], session_id=session_id)

    # If this is a new session, send session info to frontend
    if is_new and session_id and app_state.session_manager:
        session_meta = app_state.session_manager.get_session(session_id)
        if session_meta:
            session_info = {"type": "session_created", "session": session_meta.model_dump()}
            IPCManager.send(session_info)
            logger.info(f"New session created for upload: {session_id}")

    return result


async def update_session_metadata(app_state: AppState, session: TokenAwareSQLiteSession) -> None:
    """Update session metadata after processing a message.

    Updates last_used timestamp, message count, and accumulated tool tokens.
    Triggers automatic session title generation after N user messages.

    Args:
        app_state: Application state container
        session: Current TokenAwareSQLiteSession
    """
    if app_state.session_manager is None:
        return

    # Update session metadata after each message
    items = await session.get_items()
    updates = SessionUpdate(
        last_used=datetime.now().isoformat(),
        message_count=len(items),
        accumulated_tool_tokens=session.accumulated_tool_tokens,
    )
    app_state.session_manager.update_session(session.session_id, updates)

    # Auto-generate session title after N user messages (non-blocking)
    session_meta = app_state.session_manager.get_session(session.session_id)
    if session_meta and not session_meta.is_named:
        # Count only USER messages (not assistant responses)
        user_message_count = sum(1 for item in items if item.get("role") == "user")

        if user_message_count == SESSION_NAMING_TRIGGER_MESSAGES:
            logger.info(
                f"Naming trigger reached for session {session.session_id} "
                f"({user_message_count} user messages) - starting background title generation"
            )
            # Pass ALL items to Agent/Runner (SDK handles filtering)
            # This ensures tool calls/results have proper context
            # Fire and forget - non-blocking background task
            import asyncio

            asyncio.create_task(  # noqa: RUF006
                app_state.session_manager.generate_session_title(session.session_id, items)
            )


def send_session_created_event(app_state: AppState, session_id: str) -> None:
    """Send session creation event to frontend after first message completes.

    Args:
        app_state: Application state container
        session_id: ID of newly created session
    """
    if app_state.session_manager is None:
        return

    session_meta = app_state.session_manager.get_session(session_id)
    if session_meta:
        IPCManager.send({"type": "session_created", "session_id": session_meta.session_id, "title": session_meta.title})
        logger.info(f"Sent session_created event for {session_id} after first message")
