"""
Chat Juicer - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid

from typing import Any

from agents import set_default_openai_client, set_tracing_disabled
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from core.agent import create_agent
from core.constants import (
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    MESSAGE_OUTPUT_ITEM,
    RUN_ITEM_STREAM_EVENT,
    SYSTEM_INSTRUCTIONS,
    get_settings,
)
from core.session import TokenAwareSQLiteSession
from integrations.event_handlers import CallTracker, build_event_handlers
from integrations.mcp_servers import setup_mcp_servers
from integrations.sdk_token_tracker import connect_session, disconnect_session, patch_sdk_for_auto_tracking
from models.event_models import UserInput
from models.sdk_models import StreamingEvent
from tools import AGENT_TOOLS
from utils.ipc import IPCManager
from utils.logger import logger


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

    # Create token-aware session built on SDK's SQLiteSession
    # Using in-memory database for session persistence during app lifetime
    session = TokenAwareSQLiteSession(
        session_id=f"chat_{uuid.uuid4().hex[:8]}",  # Unique session per app run
        db_path=None,  # In-memory database (use "chat_history.db" for persistence)
        agent=agent,
        model=deployment,
        threshold=CONVERSATION_SUMMARIZATION_THRESHOLD,
    )
    logger.info(f"Session created with id: {session.session_id}")

    # Connect session to SDK token tracker for automatic tracking
    connect_session(session)

    # Main chat loop
    # Session manages all conversation state internally
    while True:
        try:
            # Get user input (synchronously from stdin)
            raw_input = await asyncio.get_event_loop().run_in_executor(None, input)

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
            await process_user_input(session, user_input)

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
