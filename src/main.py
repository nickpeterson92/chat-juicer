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
from typing import Any, Callable, ClassVar, cast

from agents import Agent, set_default_openai_client, set_tracing_disabled
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from constants import (
    AGENT_UPDATED_STREAM_EVENT,
    CONVERSATION_SUMMARIZATION_THRESHOLD,
    HANDOFF_CALL_ITEM,
    HANDOFF_OUTPUT_ITEM,
    MESSAGE_OUTPUT_ITEM,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    SYSTEM_INSTRUCTIONS,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
    get_settings,
)
from functions import AGENT_TOOLS
from logger import logger
from models import (
    AgentUpdateMessage,
    AssistantMessage,
    ErrorNotification,
    HandoffMessage,
    ToolCallNotification,
    ToolResultNotification,
    UserInput,
)
from sdk_models import (
    AgentUpdatedStreamEvent,
    ContentLike,
    EventHandler,
    RawHandoffLike,
    RawMessageLike,
    RawToolCallLike,
    RunItem,
    RunItemStreamEvent,
    StreamingEvent,
)
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
        "assistant_start": AssistantMessage(type="assistant_start").to_json(),
        "assistant_end": AssistantMessage(type="assistant_end").to_json(),
    }

    @staticmethod
    def send(message: dict[str, Any]) -> None:
        """Send a message to the Electron frontend via IPC."""
        msg = _json_builder(message)
        print(f"{IPCManager.DELIMITER}{msg}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def send_raw(message: str) -> None:
        """Send a raw JSON string message (for backwards compatibility)."""
        print(f"{IPCManager.DELIMITER}{message}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def send_error(message: str, code: str | None = None, details: dict[str, Any] | None = None) -> None:
        """Send an error message to the frontend with validation."""
        # Use Pydantic model for validation, but maintain backward compatibility
        error_msg = ErrorNotification(type="error", message=message, code=code, details=details)
        # Convert to dict and send using existing method to maintain format
        IPCManager.send(error_msg.model_dump(exclude_none=True))

    @staticmethod
    def send_assistant_start() -> None:
        """Send assistant start signal."""
        IPCManager.send_raw(IPCManager._TEMPLATES["assistant_start"])

    @staticmethod
    def send_assistant_end() -> None:
        """Send assistant end signal."""
        IPCManager.send_raw(IPCManager._TEMPLATES["assistant_end"])


async def setup_mcp_servers() -> list[Any]:
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
def handle_message_output(item: RunItem) -> str | None:
    """Handle message output items (assistant responses)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type="assistant_delta", content=text)
                return msg.to_json()
    return None


def handle_tool_call(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call items (function invocations) with validation."""
    tool_name = "unknown"
    call_id = ""
    arguments = "{}"

    if hasattr(item, "raw_item"):
        raw = item.raw_item

        if isinstance(raw, RawToolCallLike):
            tool_name = raw.name
            arguments = raw.arguments
            call_id = raw.call_id or (raw.id or "")
        else:
            # Extract tool details
            tool_name = getattr(raw, "name", "unknown")
            arguments = getattr(raw, "arguments", "{}")

            # Get call_id with fallback to id
            call_id = getattr(raw, "call_id", getattr(raw, "id", ""))

        # Track active calls for matching with outputs
        tracker.add_call(call_id, tool_name)

    # Use Pydantic model for validation
    tool_msg = ToolCallNotification(
        type="function_detected",  # Keep existing type for backward compatibility
        name=tool_name,
        arguments=arguments,
        call_id=call_id if call_id else None,
    )
    return _json_builder(tool_msg.model_dump(exclude_none=True))


def handle_reasoning(item: RunItem) -> str | None:
    """Handle reasoning items (Sequential Thinking output)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type="assistant_delta", content=f"[Thinking] {text}")
                return msg.to_json()
    return None


def handle_tool_output(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call output items (function results) with validation."""
    call_id = ""
    success = True
    tool_name = "unknown"

    # Match output with a call_id from tracker
    call_info = tracker.pop_call()
    if call_info:
        call_id = call_info["call_id"]
        tool_name = call_info.get("tool_name", "unknown")

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

    # Use Pydantic model for validation
    result_msg = ToolResultNotification(
        type="function_completed",  # Keep existing type for backward compatibility
        name=tool_name,
        result=output_str,
        call_id=call_id if call_id else None,
        success=success,
    )
    return _json_builder(result_msg.model_dump(exclude_none=True))


def handle_handoff_call(item: RunItem) -> str | None:
    """Handle handoff call items (multi-agent requests)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = raw.target or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    msg = HandoffMessage(type="handoff_started", target_agent=target_agent)
    return msg.to_json()


def handle_handoff_output(item: RunItem) -> str | None:
    """Handle handoff output items (multi-agent results)"""
    source_agent = "unknown"

    if hasattr(item, "raw_item"):
        raw = item.raw_item
        source_agent = raw.source or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "source", "unknown")

    # Get output
    output = getattr(item, "output", "")
    output_str = str(output) if output else ""

    msg = HandoffMessage(type="handoff_completed", source_agent=source_agent, result=output_str)
    return msg.to_json()


def _build_event_handlers(tracker: CallTracker) -> dict[str, EventHandler]:
    """Create a registry of event handlers keyed by event type.

    Uses closures to capture `tracker` while conforming to EventHandler.
    """

    def handle_run_item_event(event: StreamingEvent) -> str | None:
        # Guard by event type, then cast for attribute access
        if getattr(event, "type", None) != RUN_ITEM_STREAM_EVENT:
            return None
        rie = cast(RunItemStreamEvent, event)
        item: RunItem = rie.item

        item_handlers: dict[str, Callable[[], str | None]] = {
            MESSAGE_OUTPUT_ITEM: lambda: handle_message_output(item),
            TOOL_CALL_ITEM: lambda: handle_tool_call(item, tracker),
            REASONING_ITEM: lambda: handle_reasoning(item),
            TOOL_CALL_OUTPUT_ITEM: lambda: handle_tool_output(item, tracker),
            HANDOFF_CALL_ITEM: lambda: handle_handoff_call(item),
            HANDOFF_OUTPUT_ITEM: lambda: handle_handoff_output(item),
        }

        ih = item_handlers.get(item.type)
        return ih() if ih else None

    def handle_agent_updated_event(event: StreamingEvent) -> str | None:
        if getattr(event, "type", None) != AGENT_UPDATED_STREAM_EVENT:
            return None
        aue = cast(AgentUpdatedStreamEvent, event)
        msg = AgentUpdateMessage(type="agent_updated", name=aue.new_agent.name)
        return msg.to_json()

    return {
        RUN_ITEM_STREAM_EVENT: handle_run_item_event,
        AGENT_UPDATED_STREAM_EVENT: handle_agent_updated_event,
    }


async def handle_electron_ipc(event: StreamingEvent, tracker: CallTracker) -> str | None:
    """Convert Agent/Runner events to Electron IPC format using a typed registry."""

    handlers = _build_event_handlers(tracker)
    handler = handlers.get(event.type)
    if handler:
        return handler(event)
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
