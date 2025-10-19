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
    INITIAL_SESSION_CHUNK_SIZE,
)
from core.session import SessionBuilder
from integrations.sdk_token_tracker import connect_session, disconnect_session
from models.session_models import (
    AppStateProtocol,
    ClearSessionCommand,
    CreateSessionCommand,
    DeleteSessionCommand,
    ListSessionsCommand,
    LoadMoreMessagesCommand,
    RenameSessionCommand,
    SessionUpdate,
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

    # Create session-specific agent with workspace-isolated tools
    from core.agent import create_agent
    from core.prompts import SYSTEM_INSTRUCTIONS
    from tools.wrappers import create_session_aware_tools

    # Create session-aware tools that inject session_id for workspace isolation
    session_tools = create_session_aware_tools(session_id)
    logger.info(f"Created {len(session_tools)} session-aware tools for session switch: {session_id}")

    # Create session-specific agent with isolated tools (instructions are global, tools are session-specific)
    # Use MCP servers from app_state (passed to each session-specific agent)
    session_agent = create_agent(app_state.deployment, SYSTEM_INSTRUCTIONS, session_tools, app_state.mcp_servers)
    logger.info(f"Created session-specific agent with workspace isolation for switch: {session_id}")

    # Create new session object with persistent storage and full history (using Builder pattern)
    app_state.current_session = (
        SessionBuilder(session_id)
        .with_persistent_storage(CHAT_HISTORY_DB_PATH)
        .with_agent(session_agent)
        .with_model(app_state.deployment)
        .with_threshold(CONVERSATION_SUMMARIZATION_THRESHOLD)
        .with_full_history(app_state.full_history_store)
        .with_session_manager(app_state.session_manager)
        .build()
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

    # Get full history for UI display (Layer 2) - chunked loading for large sessions
    # Fallback to Layer 1 for old sessions without full_history tables
    full_messages = []
    message_count = 0
    has_more = False

    if app_state.full_history_store:
        # Get total count first (fast query)
        message_count = app_state.full_history_store.get_message_count(session_id)

        if message_count > 0:
            # Layer 2 exists - use it with chunked loading
            full_messages = app_state.full_history_store.get_messages(
                session_id, limit=INITIAL_SESSION_CHUNK_SIZE, offset=0
            )

            has_more = message_count > INITIAL_SESSION_CHUNK_SIZE

            logger.info(
                f"Loaded initial {len(full_messages)}/{message_count} messages from Layer 2 for session {session_id}"
                + (f" (has_more={has_more})" if has_more else "")
            )
        else:
            # Layer 2 empty/missing - fallback to Layer 1 (old sessions)
            logger.warning(f"No Layer 2 data for session {session_id}, falling back to Layer 1 (agent_messages)")

            # Convert Layer 1 items to message format (filter SDK internals)
            for item in items:
                role = item.get("role")
                content = item.get("content")

                # Only include user/assistant/system/tool messages (skip SDK internals)
                if role in ["user", "assistant", "system", "tool"] and content:
                    full_messages.append({"role": role, "content": content})

            message_count = len(full_messages)
            has_more = False  # All messages loaded from Layer 1

            logger.info(f"Loaded {message_count} messages from Layer 1 (fallback) for session {session_id}")

    # Connect new session to token tracker
    connect_session(app_state.current_session)

    # Update metadata with accurate message count from full_history
    app_state.session_manager.set_current_session(session_id)
    updates = SessionUpdate(
        last_used=datetime.now().isoformat(),
        message_count=message_count,
        accumulated_tool_tokens=app_state.current_session.accumulated_tool_tokens,
    )
    app_state.session_manager.update_session(session_id, updates)

    # Return session info with pagination metadata
    # Frontend only needs Layer 2 (full_history) for display
    # Layer 1 (messages) includes SDK internals and can be huge (causing pipe buffer overflow)
    return {
        "session": session_meta.model_dump(),
        "message_count": message_count,
        "tokens": app_state.current_session.total_tokens,
        "full_history": full_messages,  # Initial chunk only
        "has_more": has_more,  # Pagination flag for frontend
        "loaded_count": len(full_messages),  # Messages in this response
    }


async def load_more_messages(
    app_state: AppStateProtocol,
    session_id: str,
    offset: int,
    limit: int = INITIAL_SESSION_CHUNK_SIZE,
) -> dict[str, Any]:
    """Load additional messages for pagination.

    Used for progressive loading of large sessions to avoid IPC buffer overflow.
    Frontend calls this repeatedly to load remaining messages after initial session load.

    Args:
        app_state: Application state containing full_history_store
        session_id: Session to load messages from
        offset: Starting position (0-based index)
        limit: Number of messages to load (capped at MAX_MESSAGES_PER_CHUNK)

    Returns:
        Chunk of messages with pagination metadata
    """
    if not app_state.full_history_store:
        return {
            "messages": [],
            "offset": offset,
            "loaded_count": 0,
            "total_count": 0,
            "has_more": False,
        }

    # Cap limit to prevent excessively large payloads
    from core.constants import MAX_MESSAGES_PER_CHUNK

    capped_limit = min(limit, MAX_MESSAGES_PER_CHUNK)

    # Load message chunk
    messages = app_state.full_history_store.get_messages(
        session_id,
        limit=capped_limit,
        offset=offset,
    )

    # Get total count for has_more calculation
    total_count = app_state.full_history_store.get_message_count(session_id)

    loaded_count = len(messages)
    has_more = (offset + loaded_count) < total_count

    logger.info(
        f"Loaded messages {offset}-{offset + loaded_count} of {total_count} "
        f"for session {session_id} (has_more={has_more})"
    )

    return {
        "messages": messages,
        "offset": offset,
        "loaded_count": loaded_count,
        "total_count": total_count,
        "has_more": has_more,
    }


async def list_all_sessions(app_state: AppStateProtocol, offset: int = 0, limit: int | None = None) -> dict[str, Any]:
    """List all available sessions with optional pagination.

    Args:
        app_state: Application state containing session manager
        offset: Start index for pagination (default: 0)
        limit: Maximum number of sessions to return (default: None = all)

    Returns:
        Dictionary with paginated sessions list, current session ID, and total count
    """
    if not app_state.session_manager:
        return _session_error(ERROR_SESSION_MANAGER_NOT_INITIALIZED)

    all_sessions = app_state.session_manager.list_sessions()
    total_count = len(all_sessions)

    # Apply pagination
    paginated_sessions = all_sessions[offset : offset + limit] if limit is not None else all_sessions[offset:]

    return {
        "sessions": [s.model_dump() for s in paginated_sessions],
        "current_session_id": app_state.session_manager.current_session_id,
        "total_count": total_count,
        "offset": offset,
        "limit": limit,
        "has_more": (offset + len(paginated_sessions)) < total_count,
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

    # Delete Layer 1 (LLM context) via session abstraction (using Builder pattern)
    temp_session = (
        SessionBuilder(session_id).with_persistent_storage(CHAT_HISTORY_DB_PATH).with_model(DEFAULT_MODEL).build()
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


async def clear_current_session(app_state: AppStateProtocol) -> dict[str, Any]:
    """Clear current session for lazy initialization pattern.

    Clears the current session without creating a new one immediately.
    Next user message will trigger fresh session creation via lazy initialization.

    This is used for "New chat" functionality where we want to show the welcome page
    and defer session creation until the user sends their first message.

    Args:
        app_state: Application state containing current session

    Returns:
        Success status
    """
    # Disconnect from token tracker if there's an active session
    if app_state.current_session:
        disconnect_session()
        logger.info(f"Clearing current session: {app_state.current_session.session_id}")
        app_state.current_session = None

    # Clear current session ID in session manager
    if app_state.session_manager:
        app_state.session_manager.current_session_id = None

    logger.info("Current session cleared - next message will create new session")

    return {
        "success": True,
        "message": "Session cleared successfully",
    }


async def rename_session(app_state: AppStateProtocol, session_id: str, title: str) -> dict[str, Any]:
    """Rename a session with a new title.

    Args:
        app_state: Application state containing session manager
        session_id: Session to rename
        title: New title for the session

    Returns:
        Updated session info
    """
    if not app_state.session_manager:
        return _session_error(ERROR_SESSION_MANAGER_NOT_INITIALIZED)

    session_meta = app_state.session_manager.get_session(session_id)
    if not session_meta:
        return _session_error(ERROR_SESSION_NOT_FOUND.format(session_id=session_id))

    # Update session with new title and mark as manually named
    updates = SessionUpdate(title=title)
    success = app_state.session_manager.update_session(session_id, updates)

    if not success:
        return _session_error("Failed to rename session")

    # Mark as manually named (prevent auto-naming from overwriting)
    # Using model property access after update for consistency
    updated_session = app_state.session_manager.get_session(session_id)
    if updated_session:
        updated_session.is_named = True
        app_state.session_manager._save_metadata()

    logger.info(f"Renamed session {session_id} to: {title}")

    # Return updated session info
    return {
        "success": True,
        "message": "Session renamed successfully",
        "session_id": session_id,
        "session": session_meta.model_dump(),
    }


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
        ListSessionsCommand: lambda cmd: list_all_sessions(app_state, cmd.offset, cmd.limit),
        DeleteSessionCommand: lambda cmd: delete_session_by_id(app_state, cmd.session_id),
        SummarizeSessionCommand: lambda _: summarize_current_session(app_state),
        ClearSessionCommand: lambda _: clear_current_session(app_state),
        LoadMoreMessagesCommand: lambda cmd: load_more_messages(app_state, cmd.session_id, cmd.offset, cmd.limit),
        RenameSessionCommand: lambda cmd: rename_session(app_state, cmd.session_id, cmd.title),
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
