"""
Session management command handlers.
Handles all session operations (create, switch, delete, list, summarize).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from core.constants import (
    CHAT_HISTORY_DB_PATH,
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    DEFAULT_MODEL,
    ERROR_AGENT_NOT_AVAILABLE,
    ERROR_INSUFFICIENT_MESSAGES,
    ERROR_NO_ACTIVE_SESSION,
    ERROR_SESSION_MANAGER_NOT_INITIALIZED,
    ERROR_SESSION_NOT_FOUND,
)
from core.session import TokenAwareSQLiteSession
from integrations.sdk_token_tracker import connect_session, disconnect_session
from models.session_models import (
    AppStateProtocol,
    CreateSessionCommand,
    DeleteSessionCommand,
    ListSessionsCommand,
    SummarizeSessionCommand,
    SwitchSessionCommand,
    parse_session_command,
)
from utils.logger import logger


def _session_error(message: str) -> dict[str, str]:
    """Create standardized session error response.

    Args:
        message: Error message describing the issue

    Returns:
        Dictionary with error key for IPC response
    """
    return {"error": message}


async def create_new_session(app_state: AppStateProtocol, title: str | None = None) -> dict[str, Any]:
    """Create a new session and switch to it.

    Args:
        app_state: Application state containing session manager
        title: Title for the new session (defaults to datetime format)

    Returns:
        Session metadata dictionary
    """
    if not app_state.session_manager:
        return _session_error(ERROR_SESSION_MANAGER_NOT_INITIALIZED)

    # Create new session metadata (title defaults to datetime in create_session)
    session_meta = app_state.session_manager.create_session(title)

    # Switch to the new session
    await switch_to_session(app_state, session_meta.session_id)

    result: dict[str, Any] = session_meta.model_dump()
    return result


async def switch_to_session(app_state: AppStateProtocol, session_id: str) -> dict[str, Any]:
    """Switch to a different session.

    Args:
        app_state: Application state containing session manager
        session_id: ID of session to switch to

    Returns:
        Session info with conversation history (both layers)
    """
    if not app_state.session_manager:
        return _session_error(ERROR_SESSION_MANAGER_NOT_INITIALIZED)

    session_meta = app_state.session_manager.get_session(session_id)
    if not session_meta:
        return _session_error(ERROR_SESSION_NOT_FOUND.format(session_id=session_id))

    # Disconnect old session from token tracker
    if app_state.current_session:
        disconnect_session()

    # Create new session object with persistent storage and full history
    app_state.current_session = TokenAwareSQLiteSession(
        session_id=session_id,
        db_path=CHAT_HISTORY_DB_PATH,
        agent=app_state.agent,
        model=app_state.deployment,
        threshold=CONVERSATION_SUMMARIZATION_THRESHOLD,
        full_history_store=app_state.full_history_store,
        session_manager=app_state.session_manager,
    )

    # Restore token counts from stored items (Layer 1 - LLM context)
    items = await app_state.current_session.get_items()
    if items:
        items_tokens = app_state.current_session._calculate_total_tokens(items)
        # Restore accumulated tool tokens from session metadata
        app_state.current_session.accumulated_tool_tokens = session_meta.accumulated_tool_tokens
        app_state.current_session.total_tokens = items_tokens + session_meta.accumulated_tool_tokens
        logger.info(
            f"Restored session {session_id}: {len(items)} items, {items_tokens} conversation tokens, "
            f"{session_meta.accumulated_tool_tokens} tool tokens, {app_state.current_session.total_tokens} total tokens"
        )

    # Get full history for UI display (Layer 2)
    full_messages = []
    message_count = len(items)  # Default to Layer 1 count
    if app_state.full_history_store:
        full_messages = app_state.full_history_store.get_messages(session_id)
        message_count = len(full_messages)  # Use Layer 2 count for accurate metadata
        logger.info(f"Loaded {len(full_messages)} messages from full_history for session {session_id}")

    # Connect new session to token tracker
    connect_session(app_state.current_session)

    # Update metadata with accurate message count from full_history
    app_state.session_manager.set_current_session(session_id)
    app_state.session_manager.update_session(
        session_id,
        last_used=datetime.now().isoformat(),
        message_count=message_count,
        accumulated_tool_tokens=app_state.current_session.accumulated_tool_tokens,
    )

    # Return session info (only include full_history for UI, not raw messages)
    # Frontend only needs Layer 2 (full_history) for display
    # Layer 1 (messages) includes SDK internals and can be huge (causing pipe buffer overflow)
    return {
        "session": session_meta.model_dump(),
        "message_count": message_count,
        "tokens": app_state.current_session.total_tokens,
        "full_history": full_messages,  # Layer 2: Complete history for UI display
    }


async def list_all_sessions(app_state: AppStateProtocol) -> dict[str, Any]:
    """List all available sessions.

    Args:
        app_state: Application state containing session manager

    Returns:
        Dictionary with sessions list and current session ID
    """
    if not app_state.session_manager:
        return _session_error(ERROR_SESSION_MANAGER_NOT_INITIALIZED)

    sessions = app_state.session_manager.list_sessions()
    return {
        "sessions": [s.model_dump() for s in sessions],
        "current_session_id": app_state.session_manager.current_session_id,
    }


async def delete_session_by_id(app_state: AppStateProtocol, session_id: str) -> dict[str, Any]:
    """Delete a session and clean up all persistence layers.

    If deleting the current session, it will be disconnected from token tracking
    before deletion. The caller should switch to another session afterward.

    Args:
        app_state: Application state containing session manager
        session_id: ID of session to delete

    Returns:
        Success status
    """
    if not app_state.session_manager:
        return _session_error(ERROR_SESSION_MANAGER_NOT_INITIALIZED)

    # If deleting current session, disconnect from token tracker
    if app_state.current_session and app_state.current_session.session_id == session_id:
        disconnect_session()
        app_state.current_session = None
        logger.info(f"Disconnected current session before deletion: {session_id}")

    # Delete Layer 2 (full history) first
    layer2_success = True
    if app_state.full_history_store:
        layer2_success = app_state.full_history_store.clear_session(session_id)
        if layer2_success:
            logger.info(f"Cleared full_history (Layer 2) for session {session_id}")
        # Continue with deletion - Layer 2 is best-effort

    # Delete Layer 1 (LLM context) via session abstraction
    temp_session = TokenAwareSQLiteSession(
        session_id=session_id, db_path=CHAT_HISTORY_DB_PATH, agent=None, model=DEFAULT_MODEL
    )
    layer1_success = await temp_session.delete_storage()
    if layer1_success:
        logger.info(f"Cleared LLM context (Layer 1) for session {session_id}")

    # Delete metadata (sessions.json)
    metadata_success = app_state.session_manager.delete_session(session_id)

    # Return comprehensive status
    return {
        "success": metadata_success,  # Overall success based on metadata deletion
        "layer1_cleaned": layer1_success,
        "layer2_cleaned": layer2_success,
    }


async def summarize_current_session(app_state: AppStateProtocol) -> dict[str, Any]:
    """Manually trigger summarization for current session.

    Args:
        app_state: Application state containing current session

    Returns:
        Success status with summary info
    """
    if not app_state.current_session:
        return _session_error(ERROR_NO_ACTIVE_SESSION)

    if not app_state.current_session.agent:
        return _session_error(ERROR_AGENT_NOT_AVAILABLE)

    items = await app_state.current_session.get_items()
    if len(items) < 3:
        return _session_error(ERROR_INSUFFICIENT_MESSAGES)

    # Trigger manual summarization with force=True to bypass threshold check
    summary = await app_state.current_session.summarize_with_agent(force=True)

    if summary:
        return {
            "success": True,
            "message": "Conversation summarized successfully",
            "tokens": app_state.current_session.total_tokens,
        }
    else:
        return _session_error("Summarization failed or not needed")


async def handle_session_command(app_state: AppStateProtocol, command: str, data: dict[str, Any]) -> dict[str, Any]:
    """Handle session management commands from IPC with Pydantic validation.

    Args:
        app_state: Application state containing session manager
        command: Command type (new, switch, list, delete)
        data: Command data

    Returns:
        Command result
    """
    result: dict[str, Any]

    # Command dispatch registry mapping command types to handlers
    command_handlers: dict[type, Any] = {
        CreateSessionCommand: lambda cmd: create_new_session(app_state, cmd.title),
        SwitchSessionCommand: lambda cmd: switch_to_session(app_state, cmd.session_id),
        ListSessionsCommand: lambda _: list_all_sessions(app_state),
        DeleteSessionCommand: lambda cmd: delete_session_by_id(app_state, cmd.session_id),
        SummarizeSessionCommand: lambda _: summarize_current_session(app_state),
    }

    try:
        # Add command type to data if not present
        if "command" not in data:
            data["command"] = command

        # Parse and validate command using Pydantic
        cmd = parse_session_command(data)

        # Get handler from registry
        handler = command_handlers.get(type(cmd))
        if handler:
            result = await handler(cmd)
        else:
            result = _session_error(f"Unknown command type: {type(cmd)}")

    except ValueError as e:
        # Pydantic validation errors or value errors
        logger.error(f"Validation error in session command {command}: {e}", exc_info=True)
        result = _session_error(f"Invalid command: {e}")
    except Exception as e:
        logger.error(f"Error handling session command {command}: {e}", exc_info=True)
        result = _session_error(str(e))

    return result
