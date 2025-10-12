"""
Chat Juicer - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration
"""

from __future__ import annotations

import asyncio
import os
import sys

# Force UTF-8 encoding for stdout/stdin on all platforms (especially Windows)
# This must be done before any print() calls
if sys.stdout.encoding != "utf-8":
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from agents import set_default_openai_client, set_tracing_disabled
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from core.agent import create_agent
from core.constants import (
    CHAT_HISTORY_DB_PATH,
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    MESSAGE_OUTPUT_ITEM,
    RUN_ITEM_STREAM_EVENT,
    get_settings,
)
from core.full_history import FullHistoryStore
from core.prompts import SYSTEM_INSTRUCTIONS
from core.session import TokenAwareSQLiteSession
from core.session_manager import SessionManager
from integrations.event_handlers import CallTracker, build_event_handlers
from integrations.mcp_servers import setup_mcp_servers
from integrations.sdk_token_tracker import connect_session, disconnect_session, patch_sdk_for_auto_tracking
from models.event_models import UserInput
from models.sdk_models import StreamingEvent
from models.session_models import (
    CreateSessionCommand,
    DeleteSessionCommand,
    ListSessionsCommand,
    SummarizeSessionCommand,
    SwitchSessionCommand,
    parse_session_command,
)
from tools import AGENT_TOOLS
from utils.ipc import IPCManager
from utils.logger import logger


@dataclass
class AppState:
    """Application state container - single source of truth for app-wide state.

    Replaces module-level globals with explicit state management.
    """

    session_manager: SessionManager | None = None
    current_session: TokenAwareSQLiteSession | None = None
    agent: Any | None = None
    deployment: str = ""
    full_history_store: FullHistoryStore | None = None


# Module-level application state instance
_app_state = AppState()


def _session_error(message: str) -> dict[str, str]:
    """Create standardized session error response.

    Args:
        message: Error message describing the issue

    Returns:
        Dictionary with error key for IPC response
    """
    return {"error": message}


async def create_new_session(title: str | None = None) -> dict[str, Any]:
    """Create a new session and switch to it.

    Args:
        title: Title for the new session (defaults to datetime format)

    Returns:
        Session metadata dictionary
    """
    if not _app_state.session_manager:
        return _session_error("Session manager not initialized")

    # Create new session metadata (title defaults to datetime in create_session)
    session_meta = _app_state.session_manager.create_session(title)

    # Switch to the new session
    await switch_to_session(session_meta.session_id)

    result: dict[str, Any] = session_meta.model_dump()
    return result


async def switch_to_session(session_id: str) -> dict[str, Any]:
    """Switch to a different session.

    Args:
        session_id: ID of session to switch to

    Returns:
        Session info with conversation history (both layers)
    """
    if not _app_state.session_manager:
        return _session_error("Session manager not initialized")

    session_meta = _app_state.session_manager.get_session(session_id)
    if not session_meta:
        return _session_error(f"Session {session_id} not found")

    # Disconnect old session from token tracker
    if _app_state.current_session:
        disconnect_session()

    # Create new session object with persistent storage and full history
    _app_state.current_session = TokenAwareSQLiteSession(
        session_id=session_id,
        db_path=CHAT_HISTORY_DB_PATH,
        agent=_app_state.agent,
        model=_app_state.deployment,
        threshold=CONVERSATION_SUMMARIZATION_THRESHOLD,
        full_history_store=_app_state.full_history_store,
    )

    # Restore token counts from stored items (Layer 1 - LLM context)
    items = await _app_state.current_session.get_items()
    if items:
        items_tokens = _app_state.current_session._calculate_total_tokens(items)
        # Restore accumulated tool tokens from session metadata
        _app_state.current_session.accumulated_tool_tokens = session_meta.accumulated_tool_tokens
        _app_state.current_session.total_tokens = items_tokens + session_meta.accumulated_tool_tokens
        logger.info(
            f"Restored session {session_id}: {len(items)} items, {items_tokens} conversation tokens, "
            f"{session_meta.accumulated_tool_tokens} tool tokens, {_app_state.current_session.total_tokens} total tokens"
        )

    # Get full history for UI display (Layer 2)
    full_messages = []
    message_count = len(items)  # Default to Layer 1 count
    if _app_state.full_history_store:
        full_messages = _app_state.full_history_store.get_messages(session_id)
        message_count = len(full_messages)  # Use Layer 2 count for accurate metadata
        logger.info(f"Loaded {len(full_messages)} messages from full_history for session {session_id}")

    # Connect new session to token tracker
    connect_session(_app_state.current_session)

    # Update metadata with accurate message count from full_history
    _app_state.session_manager.set_current_session(session_id)
    _app_state.session_manager.update_session(
        session_id,
        last_used=datetime.now().isoformat(),
        message_count=message_count,
        accumulated_tool_tokens=_app_state.current_session.accumulated_tool_tokens,
    )

    # Return session info (only include full_history for UI, not raw messages)
    # Frontend only needs Layer 2 (full_history) for display
    # Layer 1 (messages) includes SDK internals and can be huge (causing pipe buffer overflow)
    return {
        "session": session_meta.model_dump(),
        "message_count": message_count,
        "tokens": _app_state.current_session.total_tokens,
        "full_history": full_messages,  # Layer 2: Complete history for UI display
    }


async def list_all_sessions() -> dict[str, Any]:
    """List all available sessions.

    Returns:
        Dictionary with sessions list and current session ID
    """
    if not _app_state.session_manager:
        return _session_error("Session manager not initialized")

    sessions = _app_state.session_manager.list_sessions()
    return {
        "sessions": [s.model_dump() for s in sessions],
        "current_session_id": _app_state.session_manager.current_session_id,
    }


async def delete_session_by_id(session_id: str) -> dict[str, Any]:
    """Delete a session and clean up all persistence layers.

    If deleting the current session, it will be disconnected from token tracking
    before deletion. The caller should switch to another session afterward.

    Args:
        session_id: ID of session to delete

    Returns:
        Success status
    """
    if not _app_state.session_manager:
        return _session_error("Session manager not initialized")

    # If deleting current session, disconnect from token tracker
    if _app_state.current_session and _app_state.current_session.session_id == session_id:
        disconnect_session()
        _app_state.current_session = None
        logger.info(f"Disconnected current session before deletion: {session_id}")

    # Delete Layer 2 (full history) first
    layer2_success = True
    if _app_state.full_history_store:
        layer2_success = _app_state.full_history_store.clear_session(session_id)
        if layer2_success:
            logger.info(f"Cleared full_history (Layer 2) for session {session_id}")
        # Continue with deletion - Layer 2 is best-effort

    # Delete Layer 1 (LLM context) via session abstraction
    temp_session = TokenAwareSQLiteSession(
        session_id=session_id, db_path=CHAT_HISTORY_DB_PATH, agent=None, model="gpt-5-mini"
    )
    layer1_success = await temp_session.delete_storage()
    if layer1_success:
        logger.info(f"Cleared LLM context (Layer 1) for session {session_id}")

    # Delete metadata (sessions.json)
    metadata_success = _app_state.session_manager.delete_session(session_id)

    # Return comprehensive status
    return {
        "success": metadata_success,  # Overall success based on metadata deletion
        "layer1_cleaned": layer1_success,
        "layer2_cleaned": layer2_success,
    }


async def summarize_current_session() -> dict[str, Any]:
    """Manually trigger summarization for current session.

    Returns:
        Success status with summary info
    """
    if not _app_state.current_session:
        return _session_error("No active session")

    if not _app_state.current_session.agent:
        return _session_error("Agent not available for summarization")

    items = await _app_state.current_session.get_items()
    if len(items) < 3:
        return _session_error("Not enough messages to summarize (need at least 3)")

    # Trigger manual summarization with force=True to bypass threshold check
    summary = await _app_state.current_session.summarize_with_agent(force=True)

    if summary:
        return {
            "success": True,
            "message": "Conversation summarized successfully",
            "tokens": _app_state.current_session.total_tokens,
        }
    else:
        return _session_error("Summarization failed or not needed")


async def handle_session_command(command: str, data: dict[str, Any]) -> dict[str, Any]:
    """Handle session management commands from IPC with Pydantic validation.

    Args:
        command: Command type (new, switch, list, delete)
        data: Command data

    Returns:
        Command result
    """
    result: dict[str, Any]

    # Command dispatch registry mapping command types to handlers
    command_handlers: dict[type, Any] = {
        CreateSessionCommand: lambda cmd: create_new_session(cmd.title),
        SwitchSessionCommand: lambda cmd: switch_to_session(cmd.session_id),
        ListSessionsCommand: lambda _: list_all_sessions(),
        DeleteSessionCommand: lambda cmd: delete_session_by_id(cmd.session_id),
        SummarizeSessionCommand: lambda _: summarize_current_session(),
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


async def handle_electron_ipc(event: StreamingEvent, tracker: CallTracker) -> str | None:
    """Convert Agent/Runner events to Electron IPC format using a typed registry."""
    handlers = build_event_handlers(tracker)
    handler = handlers.get(event.type)
    if handler:
        result: str | None = handler(event)
        return result
    return None


def handle_streaming_error(error: Any) -> None:
    """Handle streaming errors with appropriate user messages

    Args:
        error: The exception that occurred during streaming
    """

    # Define error handlers for different exception types
    def handle_rate_limit(e: Any) -> dict[str, str]:
        logger.error(f"Rate limit error during streaming: {e}")
        return {"type": "error", "message": "Rate limit reached. Please wait a moment and try your request again."}

    def handle_connection_error(e: Any) -> dict[str, str]:
        logger.error(f"Connection error during streaming: {e}")
        return {"type": "error", "message": "Connection interrupted. Please try your request again."}

    def handle_api_status(e: Any) -> dict[str, str]:
        logger.error(f"API status error during streaming: {e}")
        return {"type": "error", "message": f"API error (status {e.status_code}). Please try your request again."}

    def handle_generic(e: Any) -> dict[str, str]:
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


async def process_user_input(session: Any, user_input: str) -> None:
    """Process a single user input using token-aware SQLite session.

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
        result = await session.run_with_auto_summary(session.agent, user_input, max_turns=50)

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
        file_msg = f"AI: {response_text[:100]}{'...' if len(response_text) > 100 else ''}"
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


async def main() -> None:
    """Main entry point for Chat Juicer with Agent/Runner pattern"""

    # Load environment variables from src/.env
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)

    # Load and validate settings at startup
    try:
        settings = get_settings()

        # Use validated settings
        api_key = settings.azure_openai_api_key
        endpoint = settings.azure_endpoint_str
        deployment = settings.azure_openai_deployment

        logger.info(f"Settings loaded successfully for deployment: {deployment}")
    except Exception as e:
        print(f"Error: Configuration validation failed: {e}")
        print("Please check your .env file has required variables:")
        print("  AZURE_OPENAI_API_KEY")
        print("  AZURE_OPENAI_ENDPOINT")
        sys.exit(1)

    # Create Azure OpenAI client and set as default for Agent/Runner
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=endpoint,
    )
    set_default_openai_client(client)

    # Disable tracing to avoid 401 errors with Azure
    set_tracing_disabled(True)

    # Enable SDK-level automatic token tracking
    if patch_sdk_for_auto_tracking():
        logger.info("SDK-level token tracking enabled")
    else:
        logger.warning("SDK-level token tracking not available, using manual tracking")

    # Set up MCP servers
    mcp_servers = await setup_mcp_servers()

    # Create agent with tools and MCP servers
    agent = create_agent(deployment, SYSTEM_INSTRUCTIONS, AGENT_TOOLS, mcp_servers)

    print("Connected to Azure OpenAI")
    print(f"Using deployment: {deployment}")
    if mcp_servers:
        print("MCP Servers: Sequential Thinking enabled")

    # Initialize application state for session management
    _app_state.agent = agent
    _app_state.deployment = deployment

    # Initialize full history store for layered persistence
    _app_state.full_history_store = FullHistoryStore(db_path=CHAT_HISTORY_DB_PATH)
    logger.info("Full history store initialized")

    # Initialize session manager
    _app_state.session_manager = SessionManager(metadata_path="data/sessions.json")
    logger.info("Session manager initialized")

    # Always create fresh session on startup
    session_meta = _app_state.session_manager.create_session()
    logger.info(f"Started new session: {session_meta.session_id} - {session_meta.title}")

    # Create token-aware session with persistent storage and full history
    _app_state.current_session = TokenAwareSQLiteSession(
        session_id=session_meta.session_id,
        db_path=CHAT_HISTORY_DB_PATH,  # Persistent file-based storage
        agent=agent,
        model=deployment,
        threshold=CONVERSATION_SUMMARIZATION_THRESHOLD,
        full_history_store=_app_state.full_history_store,
    )

    # Restore token counts from stored items
    items = await _app_state.current_session.get_items()
    if items:
        _app_state.current_session.total_tokens = _app_state.current_session._calculate_total_tokens(items)
        logger.info(f"Restored session with {len(items)} items, {_app_state.current_session.total_tokens} tokens")

    logger.info(f"Session created with id: {_app_state.current_session.session_id}")

    # Connect session to SDK token tracker for automatic tracking
    connect_session(_app_state.current_session)

    # Main chat loop
    # Session manages all conversation state internally
    while True:
        try:
            # Get user input (synchronously from stdin)
            raw_input = await asyncio.get_event_loop().run_in_executor(None, input)

            # Check for session management commands
            if IPCManager.is_session_command(raw_input):
                try:
                    parsed = IPCManager.parse_session_command(raw_input)
                    if parsed:
                        command, data = parsed
                        logger.info(f"Processing session command: {command}")
                        result = await handle_session_command(command, data)
                        logger.info(f"Session command result keys: {result.keys()}")
                        IPCManager.send_session_response(result)
                        logger.info(f"Session response sent for command: {command}")
                    else:
                        IPCManager.send_session_response(_session_error("Invalid session command format"))
                except Exception as e:
                    logger.error(f"Error handling session command: {e}", exc_info=True)
                    IPCManager.send_session_response(_session_error(str(e)))
                continue

            # Validate user input with Pydantic
            try:
                validated_input = UserInput(content=raw_input)
                user_input = validated_input.content
            except ValueError:
                # Skip invalid input (empty after stripping)
                continue

            # Handle quit command
            if user_input.lower() in ["quit", "exit"]:
                logger.info("Quit command received, shutting down gracefully")
                break

            # Log user input
            file_msg = f"User: {user_input[:100]}{'...' if len(user_input) > 100 else ''}"
            logger.info(f"User: {user_input}", extra={"file_message": file_msg})

            # Process user input through session (handles summarization automatically)
            await process_user_input(_app_state.current_session, user_input)

            # Update session metadata after each message
            if _app_state.session_manager and _app_state.current_session:
                from datetime import datetime

                items = await _app_state.current_session.get_items()
                _app_state.session_manager.update_session(
                    _app_state.current_session.session_id,
                    last_used=datetime.now().isoformat(),
                    message_count=len(items),
                    accumulated_tool_tokens=_app_state.current_session.accumulated_tool_tokens,
                )

        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
            break
        except EOFError:
            # Handle EOF from Electron
            logger.info("EOF received, shutting down")
            break
        except Exception as e:
            # This should rarely happen since process_user_input handles errors
            logger.error(f"Unexpected error in main loop: {e}")
            IPCManager.send_error("An unexpected error occurred.")

    # Disconnect SDK token tracker
    disconnect_session()

    # Clean up MCP servers
    for server in mcp_servers:
        try:
            # Use asyncio.wait_for with a timeout to prevent hanging
            await asyncio.wait_for(server.__aexit__(None, None, None), timeout=2.0)
        except asyncio.TimeoutError:
            logger.warning("Timeout while closing MCP server")
        except asyncio.CancelledError:
            logger.warning("MCP server cleanup cancelled")
        except Exception as e:
            logger.warning(f"Error closing MCP server: {e}")

    logger.info("Chat Juicer shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
