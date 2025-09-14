"""
Chat Juicer - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid

from collections import deque
from dataclasses import dataclass, field
from functools import partial
from typing import ClassVar

from agents import Agent, set_default_openai_client, set_tracing_disabled
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from constants import (
    AGENT_UPDATED_STREAM_EVENT,
    HANDOFF_CALL_ITEM,
    HANDOFF_OUTPUT_ITEM,
    MESSAGE_OUTPUT_ITEM,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    SYSTEM_INSTRUCTIONS,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
)
from functions import AGENT_TOOLS
from logger import logger
from sdk_token_tracker import connect_session, disconnect_session, patch_sdk_for_auto_tracking
from session import TokenAwareSQLiteSession
from tool_patch import apply_tool_patch, patch_native_tools


@dataclass
class CallTracker:
    """Tracks tool call IDs for matching outputs with their calls."""

    active_calls: deque[dict[str, str]] = field(default_factory=deque)

    def add_call(self, call_id: str, tool_name: str) -> None:
        """Add a new tool call to track."""
        if call_id:
            self.active_calls.append({"call_id": call_id, "tool_name": tool_name})

    def pop_call(self) -> dict[str, str] | None:
        """Get and remove the oldest tracked call."""
        return self.active_calls.popleft() if self.active_calls else None


class IPCManager:
    """Manages IPC communication with clean abstraction."""

    DELIMITER: ClassVar[str] = "__JSON__"

    # Pre-create common JSON templates to avoid repeated serialization
    _TEMPLATES: ClassVar[dict[str, str]] = {
        "assistant_start": '{"type": "assistant_start"}',
        "assistant_end": '{"type": "assistant_end"}',
    }

    @staticmethod
    def send(message: dict) -> None:
        """Send a message to the Electron frontend via IPC."""
        msg = _json_builder(message)
        print(f"{IPCManager.DELIMITER}{msg}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def send_raw(message: str) -> None:
        """Send a raw JSON string message (for backwards compatibility)."""
        print(f"{IPCManager.DELIMITER}{message}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def send_error(message: str) -> None:
        """Send an error message to the frontend."""
        IPCManager.send({"type": "error", "message": message})

    @staticmethod
    def send_assistant_start() -> None:
        """Send assistant start signal."""
        IPCManager.send_raw(IPCManager._TEMPLATES["assistant_start"])

    @staticmethod
    def send_assistant_end() -> None:
        """Send assistant end signal."""
        IPCManager.send_raw(IPCManager._TEMPLATES["assistant_end"])


async def setup_mcp_servers():
    """Configure and initialize MCP servers"""
    servers = []

    # Apply the MCP patch to mitigate race conditions
    apply_tool_patch()

    # Sequential Thinking Server - our primary reasoning tool
    try:
        seq_thinking = MCPServerStdio(
            params={
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
            }
        )
        await seq_thinking.__aenter__()
        servers.append(seq_thinking)
        logger.info("Sequential Thinking MCP server initialized")
    except Exception as e:
        logger.warning(f"Sequential Thinking server not available: {e}")

    return servers


# Pre-create partial JSON builders for common patterns
_json_builder = partial(json.dumps, separators=(",", ":"))  # Compact JSON


# Event handler functions for different item types
def handle_message_output(item):
    """Handle message output items (assistant responses)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = getattr(raw, "content", []) or []  # Ensure we always have a list
        for content_item in content:
            text = getattr(content_item, "text", "")
            if text:
                return _json_builder({"type": "assistant_delta", "content": text})
    return None


def handle_tool_call(item, tracker: CallTracker):
    """Handle tool call items (function invocations)"""
    tool_name = "unknown"
    call_id = ""
    arguments = "{}"

    if hasattr(item, "raw_item"):
        raw = item.raw_item

        # Extract tool details
        tool_name = getattr(raw, "name", "unknown")
        arguments = getattr(raw, "arguments", "{}")

        # Get call_id with fallback to id
        call_id = getattr(raw, "call_id", getattr(raw, "id", ""))

        # Track active calls for matching with outputs
        tracker.add_call(call_id, tool_name)

    return _json_builder({"type": "function_detected", "name": tool_name, "call_id": call_id, "arguments": arguments})


def handle_reasoning(item):
    """Handle reasoning items (Sequential Thinking output)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = getattr(raw, "content", []) or []  # Ensure we always have a list
        for content_item in content:
            text = getattr(content_item, "text", "")
            if text:
                return _json_builder({"type": "assistant_delta", "content": f"[Thinking] {text}"})
    return None


def handle_tool_output(item, tracker: CallTracker):
    """Handle tool call output items (function results)"""
    call_id = ""
    success = True

    # Match output with a call_id from tracker
    call_info = tracker.pop_call()
    if call_info:
        call_id = call_info["call_id"]

    # Get output
    if hasattr(item, "output"):
        output = item.output
        # Convert to string for consistent handling
        output_str = _json_builder(output) if isinstance(output, dict) else str(output)
    else:
        output_str = ""

    # Check for errors
    if hasattr(item, "raw_item") and isinstance(item.raw_item, dict) and item.raw_item.get("error"):
        success = False
        output_str = str(item.raw_item["error"])

    return _json_builder({"type": "function_completed", "call_id": call_id, "success": success, "output": output_str})


def handle_handoff_call(item):
    """Handle handoff call items (multi-agent requests)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    return _json_builder({"type": "handoff_started", "target_agent": target_agent})


def handle_handoff_output(item):
    """Handle handoff output items (multi-agent results)"""
    source_agent = "unknown"

    if hasattr(item, "raw_item"):
        raw = item.raw_item
        source_agent = getattr(raw, "source", "unknown")

    # Get output
    output = getattr(item, "output", "")
    output_str = str(output) if output else ""

    return _json_builder({"type": "handoff_completed", "source_agent": source_agent, "result": output_str})


async def handle_electron_ipc(event, tracker: CallTracker):
    """Convert Agent/Runner events to Electron IPC format

    Args:
        event: The streaming event
        tracker: CallTracker instance to track call_ids between tool_call and tool_call_output events

    Returns:
        The IPC message JSON string or None
    """
    # Handle run item stream events
    if event.type == RUN_ITEM_STREAM_EVENT:
        item = event.item

        # Map item types to handler functions
        handlers = {
            MESSAGE_OUTPUT_ITEM: lambda: handle_message_output(item),
            TOOL_CALL_ITEM: lambda: handle_tool_call(item, tracker),
            REASONING_ITEM: lambda: handle_reasoning(item),
            TOOL_CALL_OUTPUT_ITEM: lambda: handle_tool_output(item, tracker),
            HANDOFF_CALL_ITEM: lambda: handle_handoff_call(item),
            HANDOFF_OUTPUT_ITEM: lambda: handle_handoff_output(item),
        }

        # Get and execute the appropriate handler
        handler = handlers.get(item.type)
        if handler:
            return handler()

    # Handle agent updated events
    elif event.type == AGENT_UPDATED_STREAM_EVENT:
        return _json_builder({"type": "agent_updated", "name": event.new_agent.name})

    return None


def handle_streaming_error(error):
    """Handle streaming errors with appropriate user messages

    Args:
        error: The exception that occurred during streaming
    """

    # Define error handlers for different exception types
    def handle_rate_limit(e):
        logger.error(f"Rate limit error during streaming: {e}")
        return {"type": "error", "message": "Rate limit reached. Please wait a moment and try your request again."}

    def handle_connection_error(e):
        logger.error(f"Connection error during streaming: {e}")
        return {"type": "error", "message": "Connection interrupted. Please try your request again."}

    def handle_api_status(e):
        logger.error(f"API status error during streaming: {e}")
        return {"type": "error", "message": f"API error (status {e.status_code}). Please try your request again."}

    def handle_generic(e):
        logger.error(f"Unexpected error during streaming: {e}")
        return {"type": "error", "message": "An error occurred. Please try your request again."}

    # Map exception types to handlers
    error_handlers = {
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


async def process_user_input(session, user_input):
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


async def main():
    """Main entry point for Chat Juicer with Agent/Runner pattern"""

    # Load environment variables from src/.env
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)

    # Get Azure configuration
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-mini")

    if not api_key or not endpoint:
        print("Error: Missing required environment variables:")
        print("AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be set")
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

    # Patch native tools to add delays (must be done before passing to Agent)
    patched_tools = patch_native_tools(AGENT_TOOLS)

    # Create agent with tools and MCP servers
    agent = Agent(
        name="Chat Juicer",
        model=deployment,
        instructions=SYSTEM_INSTRUCTIONS,
        tools=patched_tools,  # Use patched function tools
        mcp_servers=mcp_servers,
    )

    # Log startup
    logger.info(f"Chat Juicer starting - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(patched_tools)} tools and {len(mcp_servers)} MCP servers")

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
        threshold=0.8,
    )
    logger.info(f"Session created with id: {session.session_id}")

    # Connect session to SDK token tracker for automatic tracking
    connect_session(session)

    # Main chat loop
    # Session manages all conversation state internally
    while True:
        try:
            # Get user input (synchronously from stdin)
            user_input = await asyncio.get_event_loop().run_in_executor(None, input)
            user_input = user_input.strip()

            # Skip empty input
            if not user_input:
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
