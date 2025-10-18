"""
Wishgate - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from datetime import datetime

# Force UTF-8 encoding for stdout/stdin on all platforms
# This must be done before any print() calls
if sys.stdout.encoding != "utf-8":
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

from dataclasses import dataclass
from typing import Any

from agents import set_default_openai_client, set_tracing_disabled
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, RateLimitError

from core.agent import create_agent
from core.constants import (
    CHAT_HISTORY_DB_PATH,
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    DEFAULT_SESSION_METADATA_PATH,
    LOG_PREVIEW_LENGTH,
    MAX_CONVERSATION_TURNS,
    MESSAGE_OUTPUT_ITEM,
    RUN_ITEM_STREAM_EVENT,
    get_settings,
)
from core.full_history import FullHistoryStore
from core.prompts import SYSTEM_INSTRUCTIONS
from core.session import TokenAwareSQLiteSession
from core.session_commands import handle_session_command
from core.session_manager import SessionManager
from integrations.event_handlers import CallTracker, build_event_handlers
from integrations.mcp_servers import setup_mcp_servers
from integrations.sdk_token_tracker import connect_session, disconnect_session, patch_sdk_for_auto_tracking
from models.event_models import UserInput
from models.sdk_models import StreamingEvent
from models.session_models import SessionUpdate
from tools import AGENT_TOOLS
from utils.client_factory import create_http_client, create_openai_client
from utils.file_utils import save_uploaded_file
from utils.ipc import IPCManager
from utils.logger import logger


@dataclass
class AppState:
    """Application state container - single source of truth for app-wide state.

    Replaces module-level globals with explicit state management.
    """

    session_manager: SessionManager | None = None
    current_session: TokenAwareSQLiteSession | None = None
    agent: Any | None = None  # agents.Agent from external SDK (untyped, opaque object)
    deployment: str = ""
    full_history_store: FullHistoryStore | None = None


# Module-level application state instance
_app_state = AppState()


async def handle_electron_ipc(event: StreamingEvent, tracker: CallTracker) -> str | None:
    """Convert Agent/Runner events to Electron IPC format using a typed registry."""
    handlers = build_event_handlers(tracker)
    handler = handlers.get(event.type)
    if handler:
        result: str | None = handler(event)
        return result
    return None


def handle_streaming_error(error: Exception) -> None:
    """Handle streaming errors with appropriate user messages

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


async def ensure_session_exists(app_state: AppState) -> TokenAwareSQLiteSession:
    """Ensure a session exists, creating one if needed (lazy initialization).

    Args:
        app_state: Application state container

    Returns:
        Active TokenAwareSQLiteSession instance
    """
    if app_state.current_session is not None:
        return app_state.current_session

    logger.info("No active session - creating new session on first message")

    # Type guard: session_manager must exist
    if app_state.session_manager is None:
        raise RuntimeError("Session manager not initialized")

    # Create new session metadata
    session_meta = app_state.session_manager.create_session()
    logger.info(f"Created new session: {session_meta.session_id} - {session_meta.title}")

    # Create token-aware session with persistent storage and full history
    app_state.current_session = TokenAwareSQLiteSession(
        session_id=session_meta.session_id,
        db_path=CHAT_HISTORY_DB_PATH,
        agent=app_state.agent,
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

    # Send session creation event to frontend
    IPCManager.send({"type": "session_created", "session_id": session_meta.session_id, "title": session_meta.title})

    return app_state.current_session


async def process_user_input(session: TokenAwareSQLiteSession, user_input: str) -> None:
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


async def main() -> None:
    """Main entry point for Wishgate with Agent/Runner pattern"""

    # Load environment variables from src/.env
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)

    # Load and validate settings at startup
    try:
        settings = get_settings()

        # Configure client based on API provider
        if settings.api_provider == "azure":
            # Azure OpenAI configuration
            api_key = settings.azure_openai_api_key
            endpoint = settings.azure_endpoint_str
            deployment = settings.azure_openai_deployment

            logger.info(f"Settings loaded successfully for Azure deployment: {deployment}")

            http_client = create_http_client(enable_logging=settings.http_request_logging)
            if http_client:
                logger.info("HTTP request/response logging enabled")
            client = create_openai_client(api_key, base_url=endpoint, http_client=http_client)

        elif settings.api_provider == "openai":
            # Base OpenAI configuration
            api_key = settings.openai_api_key
            deployment = settings.openai_model

            logger.info(f"Settings loaded successfully for OpenAI model: {deployment}")

            http_client = create_http_client(enable_logging=settings.http_request_logging)
            if http_client:
                logger.info("HTTP request/response logging enabled")
            client = create_openai_client(api_key, http_client=http_client)

        else:
            raise ValueError(f"Unknown API provider: {settings.api_provider}")

    except Exception as e:
        print(f"Error: Configuration validation failed: {e}")
        print("Please check your .env file has required variables:")
        if hasattr(settings, "api_provider") and settings.api_provider == "openai":
            print("  API_PROVIDER=openai")
            print("  OPENAI_API_KEY")
            print("  OPENAI_MODEL")
        else:
            print("  API_PROVIDER=azure (default)")
            print("  AZURE_OPENAI_API_KEY")
            print("  AZURE_OPENAI_ENDPOINT")
            print("  AZURE_OPENAI_DEPLOYMENT")
        sys.exit(1)

    # Set as default client for Agent/Runner
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

    # Display connection info based on provider
    if settings.api_provider == "azure":
        print("Connected to Azure OpenAI")
        print(f"Using deployment: {deployment}")
    else:
        print("Connected to OpenAI")
        print(f"Using model: {deployment}")

    if mcp_servers:
        print("MCP Servers: Sequential Thinking enabled")

    # Initialize application state for session management
    _app_state.agent = agent
    _app_state.deployment = deployment

    # Initialize full history store for layered persistence
    _app_state.full_history_store = FullHistoryStore(db_path=CHAT_HISTORY_DB_PATH)
    logger.info("Full history store initialized")

    # Initialize session manager
    _app_state.session_manager = SessionManager(metadata_path=DEFAULT_SESSION_METADATA_PATH)
    logger.info("Session manager initialized")

    # LAZY INITIALIZATION: No session created on startup
    # Session will be created on first user message or when switching to existing session
    _app_state.current_session = None
    logger.info("App initialized - session will be created on first message")

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
                        result = await handle_session_command(_app_state, command, data)
                        logger.info(f"Session command result keys: {result.keys()}")
                        IPCManager.send_session_response(result)
                        logger.info(f"Session response sent for command: {command}")
                    else:
                        IPCManager.send_session_response({"error": "Invalid session command format"})
                except Exception as e:
                    logger.error(f"Error handling session command: {e}", exc_info=True)
                    IPCManager.send_session_response({"error": str(e)})
                continue

            # Handle file upload commands
            if raw_input.startswith("__UPLOAD__"):
                try:
                    # Parse upload command: __UPLOAD__<json>__
                    json_start = raw_input.index("__UPLOAD__") + len("__UPLOAD__")
                    json_end = raw_input.index("__", json_start)
                    upload_json = raw_input[json_start:json_end]
                    upload_data = json.loads(upload_json)

                    logger.info(f"Processing file upload: {upload_data.get('filename')}")

                    # Ensure session exists before file upload (handles welcome screen uploads)
                    session = await ensure_session_exists(_app_state)
                    logger.info(f"Session ensured for file upload: {session.session_id}")

                    # Process upload
                    result = save_uploaded_file(filename=upload_data["filename"], data=upload_data["data"])

                    # Send response back to Electron
                    response_msg = {"type": "upload_response", "data": result}
                    IPCManager.send(response_msg)
                    logger.info(f"Upload response sent: {result.get('success')}")

                except Exception as e:
                    logger.error(f"Upload command error: {e}", exc_info=True)
                    error_msg = {"type": "upload_response", "data": {"success": False, "error": str(e)}}
                    IPCManager.send(error_msg)
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
            file_msg = f"User: {user_input[:LOG_PREVIEW_LENGTH]}{'...' if len(user_input) > LOG_PREVIEW_LENGTH else ''}"
            logger.info(f"User: {user_input}", extra={"file_message": file_msg})

            # Ensure session exists (lazy initialization on first message)
            session = await ensure_session_exists(_app_state)

            # Process user input through session (handles summarization automatically)
            await process_user_input(session, user_input)

            # Update session metadata after each message
            # At this point, both session_manager and current_session are guaranteed to exist
            # (ensure_session_exists would have raised otherwise)
            # Using the session variable from ensure_session_exists for type safety
            items = await session.get_items()
            updates = SessionUpdate(
                last_used=datetime.now().isoformat(),
                message_count=len(items),
                accumulated_tool_tokens=session.accumulated_tool_tokens,
            )
            # Type narrowing: we know session_manager exists from ensure_session_exists
            if _app_state.session_manager is not None:
                _app_state.session_manager.update_session(session.session_id, updates)

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

    logger.info("Wishgate shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
