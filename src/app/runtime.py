"""Core runtime operations for Chat Juicer.

This module contains all business logic executed during the main event loop:
event handling, session management, message processing, and command/file handling.
All functions receive AppState as an explicit parameter to avoid hidden global state.
"""

from __future__ import annotations

import asyncio
import json

from datetime import datetime
from typing import Any, cast

from agents import RunConfig, Runner
from openai import APIConnectionError, APIStatusError, RateLimitError
from openai.types.responses import EasyInputMessageParam

from app.state import AppState
from core.constants import (
    CHAT_HISTORY_DB_PATH,
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    LOG_PREVIEW_LENGTH,
    MAX_CONVERSATION_TURNS,
    MSG_TYPE_FUNCTION_COMPLETED,
    MSG_TYPE_FUNCTION_EXECUTING,
    RAW_RESPONSE_EVENT,
    SESSION_NAMING_TRIGGER_MESSAGES,
)
from core.prompts import SYSTEM_INSTRUCTIONS
from core.session import PersistenceError, TokenAwareSQLiteSession
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


def save_tool_call_to_history(
    app_state: AppState,
    session: TokenAwareSQLiteSession,
    ipc_msg: str,
) -> None:
    """Save tool call event to Layer 2 (full_history) for session restoration.

    Tool calls are saved with role="tool_call" and metadata containing:
    - call_id: Unique identifier for the tool call
    - name: Tool/function name
    - arguments: Tool arguments (from function_executing, which has complete args)
    - result: Tool output (for function_completed)
    - status: "detected" or "completed"
    - success: Boolean for completed calls
    - timestamp: ISO timestamp

    NOTE: We save function_executing (not function_detected) because early detection
    emits function_detected with empty args "{}". The function_executing event fires
    when arguments are complete, providing the data needed for session restoration.

    Args:
        app_state: Application state with full_history_store
        session: Current session for session_id
        ipc_msg: The IPC message JSON string containing tool call data
    """
    if not app_state.full_history_store:
        return

    try:
        parsed = json.loads(ipc_msg)
        msg_type = parsed.get("type")

        if msg_type == MSG_TYPE_FUNCTION_EXECUTING:
            # Tool executing - save with complete arguments
            # NOTE: We save function_executing (not function_detected) because early detection
            # has empty args "{}". function_executing fires when args are complete.
            message = {
                "role": "tool_call",
                "content": parsed.get("name", "unknown"),
                "call_id": parsed.get("call_id"),
                "name": parsed.get("name"),
                "arguments": parsed.get("arguments"),
                "status": "detected",  # Use "detected" for frontend merge logic compatibility
                "timestamp": datetime.now().isoformat(),
            }
            app_state.full_history_store.save_message(session.session_id, message)
            logger.debug(f"Saved tool call executing to Layer 2: {parsed.get('name')}")

        elif msg_type == MSG_TYPE_FUNCTION_COMPLETED:
            # Tool call completed - save result data
            message = {
                "role": "tool_call",
                "content": parsed.get("name", "unknown"),
                "call_id": parsed.get("call_id"),
                "name": parsed.get("name"),
                "result": parsed.get("result"),
                "status": "completed",
                "success": parsed.get("success", True),
                "timestamp": datetime.now().isoformat(),
            }
            app_state.full_history_store.save_message(session.session_id, message)
            logger.debug(f"Saved tool call result to Layer 2: {parsed.get('name')}")

    except json.JSONDecodeError:
        logger.warning("Failed to parse IPC message for tool call persistence")
    except Exception as e:
        # Don't fail the request for Layer 2 issues
        logger.warning(f"Failed to save tool call to Layer 2: {e}")


def handle_streaming_error(error: Exception) -> None:
    """Handle streaming errors with appropriate user messages.

    Logs the error and sends user-friendly error message to UI via IPC.
    Note: The caller's finally block handles sending assistant_end.

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

    # Send error message to UI (finally block handles assistant_end)
    IPCManager.send(error_msg)


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
    logger.info(f"Created {len(session_tools)} tools for session: {session_meta.session_id}")

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


async def process_messages(app_state: AppState, session: TokenAwareSQLiteSession, messages: list[str]) -> None:
    """Process user messages (single or batch) with cancellation support.

    All user messages are sent to the agent in a single request, producing
    one combined response. Works uniformly for single messages or batches.

    Supports stream interruption with deferred tool handling:
    - Immediate cancellation during token streaming
    - Deferred cancellation during tool execution (waits for completion)
    - Conditional persistence based on whether tools completed

    CRITICAL: This function ALWAYS updates session metadata via try/finally,
    even if streaming errors occur. This prevents session metadata desync bugs.

    Args:
        app_state: Application state container
        session: TokenAwareSQLiteSession instance
        messages: List of user message strings (single or multiple)

    Returns:
        None (session manages all state internally)

    Raises:
        asyncio.CancelledError: Re-raised after handling to maintain proper task state
    """
    if not messages:
        return

    # Convert messages to SDK format (list of EasyInputMessageParam dicts)
    batch_input: list[EasyInputMessageParam] = [
        cast(EasyInputMessageParam, {"role": "user", "content": msg, "type": "message"}) for msg in messages
    ]

    logger.info(f"Processing {len(messages)} user message(s)")

    # Track cancellation state for deferred tool handling
    tool_in_progress = False
    cancel_requested = False
    tools_completed = False

    # Send start message for Electron
    IPCManager.send_assistant_start()

    response_text = ""
    tracker = CallTracker()

    try:
        try:
            # Use batch input directly with run_streamed
            # The SDK accepts list[TResponseInputItem] as input

            # Session input callback for merging batch messages with history
            # Simply appends new messages to the existing session history
            def merge_batch_input(history: list[Any], new_input: list[Any]) -> list[Any]:
                return history + new_input

            # Create run config with session input callback for list inputs
            run_config = RunConfig(session_input_callback=merge_batch_input)

            result = Runner.run_streamed(
                session.agent,
                input=batch_input,  # type: ignore[arg-type]  # SDK accepts list[EasyInputMessageParam]
                session=session,
                max_turns=MAX_CONVERSATION_TURNS,
                run_config=run_config,
            )

            # Stream the events with cancellation support
            async for event in result.stream_events():
                # Track tool execution state for deferred cancellation
                if event.type == "run_item_stream_event":
                    if event.item.type == "tool_call_item":
                        tool_in_progress = True
                        tool_name = getattr(event.item, "name", "unknown")
                        logger.debug(f"Tool starting: {tool_name}")
                    elif event.item.type == "tool_call_output_item":
                        tool_in_progress = False
                        tools_completed = True
                        logger.debug("Tool completed")

                        # Execute deferred cancellation after tool completion
                        if cancel_requested:
                            logger.info("Deferred cancellation executing - tool completed")
                            break

                # Immediate cancellation when safe (no tool in progress)
                if cancel_requested and not tool_in_progress:
                    logger.info("Immediate cancellation - no tool in progress")
                    break

                # Normal event processing
                ipc_msg = await handle_electron_ipc(event, tracker)
                if ipc_msg:
                    IPCManager.send_raw(ipc_msg)
                    save_tool_call_to_history(app_state, session, ipc_msg)

                # Accumulate response text for logging
                if (
                    event.type == RAW_RESPONSE_EVENT
                    and hasattr(event, "data")
                    and event.data
                    and getattr(event.data, "type", None) == "response.output_text.delta"
                ):
                    delta = getattr(event.data, "delta", None)
                    if delta:
                        response_text += delta

            # After streaming loop ends, check if we were cancelled
            # SDK may suppress CancelledError and exit gracefully
            current_task = asyncio.current_task()
            if current_task and current_task.cancelled():
                cancel_requested = True
                logger.info("Stream cancelled by user (detected via task.cancelled())")

        except asyncio.CancelledError:
            cancel_requested = True
            logger.info("Stream cancelled by user (CancelledError caught)")
            raise  # Re-raise for proper task state

        except PersistenceError as e:
            logger.error(f"Persistence failure during message processing: {e}")
            error_msg = {
                "type": "error",
                "message": "Failed to save conversation history. Please try again.",
                "code": "persistence_error",
            }
            IPCManager.send(error_msg)
            # Note: send_assistant_end is handled by the finally block
            return

        except Exception as e:
            handle_streaming_error(e)
            return

        # Log response (only for successful completion)
        if response_text:
            file_msg = (
                f"AI: {response_text[:LOG_PREVIEW_LENGTH]}{'...' if len(response_text) > LOG_PREVIEW_LENGTH else ''}"
            )
            logger.info(f"AI: {response_text}", extra={"file_message": file_msg})

        # Update token counts (only for successful completion)
        items = await session.get_items()
        items_tokens = session.calculate_items_tokens(items)
        session.total_tokens = items_tokens + session.accumulated_tool_tokens

        logger.info(
            f"Token usage: {session.total_tokens}/{session.trigger_tokens} "
            f"({int(session.total_tokens / session.trigger_tokens * 100)}%)"
        )

        # Check for post-run summarization (only for successful completion)
        if await session.should_summarize():
            logger.info(f"Post-run summarization triggered: {session.total_tokens}/{session.trigger_tokens} tokens")
            await session.summarize_with_agent()
            logger.info(
                f"Token usage after summarization: {session.total_tokens}/{session.trigger_tokens} "
                f"({int(session.total_tokens / session.trigger_tokens * 100)}%)"
            )

    finally:
        # Always send assistant_end to close the stream
        logger.debug("Finally block - sending assistant_end")
        IPCManager.send_assistant_end()
        logger.debug("assistant_end message sent")

        # Save partial response to Layer 2 if cancelled with content
        # Use app_state.interrupt_requested since SDK may suppress CancelledError
        was_interrupted = cancel_requested or app_state.interrupt_requested
        if app_state.interrupt_requested:
            logger.debug("Interrupt detected via app_state flag")
        if was_interrupted and response_text.strip() and app_state.full_history_store:
            try:
                app_state.full_history_store.save_message(
                    session.session_id,
                    {
                        "role": "assistant",
                        "content": response_text,
                        "partial": True,
                        "interrupted_at": datetime.now().isoformat(),
                    },
                )
                logger.info(
                    f"Saved partial response ({len(response_text)} chars) to Layer 2 for session {session.session_id}"
                )
            except Exception as e:
                logger.warning(f"Failed to save partial response to Layer 2: {e}")

        # Conditional persistence based on cancellation state
        # - Always persist for normal completion (was_interrupted=False)
        # - Always persist for errors (PersistenceError, Exception handlers return early)
        # - For cancellation: only persist if tools completed (side effects happened)
        if not was_interrupted or tools_completed:
            if was_interrupted and tools_completed:
                logger.info("Persisting session - tools completed before cancel")
            else:
                logger.debug(f"Updating session metadata for {session.session_id}")
            await update_session_metadata(app_state, session)
        else:
            logger.info("Skipping persistence - cancelled with no tool completion")


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
    # V2 binary protocol sends 'content' field, not 'data'
    result = save_uploaded_file(filename=upload_data["filename"], data=upload_data["content"], session_id=session_id)

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
            # Non-blocking background task with error handling
            import asyncio

            async def generate_title_with_error_handling(sid: str, messages: list[dict[str, Any]]) -> None:
                """Background task wrapper that catches and logs errors."""
                try:
                    await app_state.session_manager.generate_session_title(sid, messages)
                    logger.info(f"Background title generation completed for session {sid}")
                except Exception as e:
                    logger.error(f"Background title generation failed for session {sid}: {e}", exc_info=True)
                    # Don't re-raise - this is a background task that shouldn't crash the app

            # Fire-and-forget: RUF006 suppressed because error handling is inside the task wrapper.
            # The task self-completes and logs its own errors - no external monitoring needed.
            asyncio.create_task(generate_title_with_error_handling(session.session_id, items))  # noqa: RUF006


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
        # Send full session metadata including model and reasoning_effort
        IPCManager.send({"type": "session_created", "session": session_meta.model_dump()})
        logger.info(f"Sent session_created event for {session_id} after first message")
