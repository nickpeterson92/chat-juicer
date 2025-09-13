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

from agents import Agent, set_default_openai_client, set_tracing_disabled
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from constants import SYSTEM_INSTRUCTIONS
from functions import AGENT_TOOLS
from logger import logger
from session import TokenAwareSQLiteSession
from tool_patch import apply_tool_patch, patch_native_tools
from utils import estimate_tokens


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


# Event handler functions for different item types
def handle_message_output(item):
    """Handle message output items (assistant responses)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = getattr(raw, "content", []) or []  # Ensure we always have a list
        for content_item in content:
            text = getattr(content_item, "text", "")
            if text:
                return json.dumps({"type": "assistant_delta", "content": text}), 0
    return None, 0


def handle_tool_call(item, call_id_tracker):
    """Handle tool call items (function invocations)"""
    tool_name = "unknown"
    call_id = ""
    arguments = "{}"
    tokens = 0

    if hasattr(item, "raw_item"):
        raw = item.raw_item

        # Extract tool details
        tool_name = getattr(raw, "name", "unknown")
        arguments = getattr(raw, "arguments", "{}")

        # Get call_id with fallback to id
        call_id = getattr(raw, "call_id", getattr(raw, "id", ""))

        # Track active calls for matching with outputs
        if call_id:
            if "active_calls" not in call_id_tracker:
                call_id_tracker["active_calls"] = []
            call_id_tracker["active_calls"].append({"call_id": call_id, "tool_name": tool_name})

        # Count argument tokens
        tokens = estimate_tokens(arguments).get("exact_tokens", 0)

    return (
        json.dumps({"type": "function_detected", "name": tool_name, "call_id": call_id, "arguments": arguments}),
        tokens,
    )


def handle_reasoning(item):
    """Handle reasoning items (Sequential Thinking output)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = getattr(raw, "content", []) or []  # Ensure we always have a list
        for content_item in content:
            text = getattr(content_item, "text", "")
            if text:
                tokens = estimate_tokens(text).get("exact_tokens", 0)
                return json.dumps({"type": "assistant_delta", "content": f"[Thinking] {text}"}), tokens
    return None, 0


def handle_tool_output(item, call_id_tracker):
    """Handle tool call output items (function results)"""
    call_id = ""
    success = True
    tokens = 0

    # Match output with a call_id from tracker
    if call_id_tracker.get("active_calls"):
        call_info = call_id_tracker["active_calls"].pop(0)
        call_id = call_info["call_id"]

    # Get output and count tokens
    if hasattr(item, "output"):
        output = item.output
        # Convert to string for consistent token counting
        output_str = json.dumps(output) if isinstance(output, dict) else str(output)
        tokens = estimate_tokens(output_str).get("exact_tokens", 0)
    else:
        output_str = ""

    # Check for errors
    if hasattr(item, "raw_item") and isinstance(item.raw_item, dict) and item.raw_item.get("error"):
        success = False
        output_str = str(item.raw_item["error"])
        tokens = estimate_tokens(output_str).get("exact_tokens", 0)

    return (
        json.dumps({"type": "function_completed", "call_id": call_id, "success": success, "output": output_str}),
        tokens,
    )


def handle_handoff_call(item):
    """Handle handoff call items (multi-agent requests)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    return json.dumps({"type": "handoff_started", "target_agent": target_agent}), 0


def handle_handoff_output(item):
    """Handle handoff output items (multi-agent results)"""
    source_agent = "unknown"
    tokens = 0

    if hasattr(item, "raw_item"):
        raw = item.raw_item
        source_agent = getattr(raw, "source", "unknown")

    # Get output and count tokens
    output = getattr(item, "output", "")
    output_str = str(output) if output else ""
    if output_str:
        tokens = estimate_tokens(output_str).get("exact_tokens", 0)

    return json.dumps({"type": "handoff_completed", "source_agent": source_agent, "result": output_str}), tokens


async def handle_electron_ipc(event, call_id_tracker=None):
    """Convert Agent/Runner events to Electron IPC format

    Args:
        event: The streaming event
        call_id_tracker: Dict to track call_ids between tool_call and tool_call_output events

    Returns:
        Tuple of (ipc_message, token_count)
    """
    if call_id_tracker is None:
        call_id_tracker = {}

    # Handle run item stream events
    if event.type == "run_item_stream_event":
        item = event.item

        # Map item types to handler functions
        handlers = {
            "message_output_item": lambda: handle_message_output(item),
            "tool_call_item": lambda: handle_tool_call(item, call_id_tracker),
            "reasoning_item": lambda: handle_reasoning(item),
            "tool_call_output_item": lambda: handle_tool_output(item, call_id_tracker),
            "handoff_call_item": lambda: handle_handoff_call(item),
            "handoff_output_item": lambda: handle_handoff_output(item),
        }

        # Get and execute the appropriate handler
        handler = handlers.get(item.type)
        if handler:
            return handler()

    # Handle agent updated events
    elif event.type == "agent_updated_stream_event":
        return json.dumps({"type": "agent_updated", "name": event.new_agent.name}), 0

    return None, 0


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
        error_msg = str(e).lower()

        # Check for specific error types in the message
        if "rs_" in error_msg or "fc_" in error_msg:
            return {"type": "error", "message": "The response was interrupted. Please try your request again."}
        else:
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
    msg = json.dumps(error_msg)
    print(f"__JSON__{msg}__JSON__", flush=True)

    # Send assistant_end to properly close the stream
    end_msg = json.dumps({"type": "assistant_end"})
    print(f"__JSON__{end_msg}__JSON__", flush=True)


async def process_user_input(session, user_input):
    """Process a single user input using token-aware SQLite session.

    Args:
        session: TokenAwareSQLiteSession instance
        user_input: User's message

    Returns:
        None (session manages all state internally)
    """

    # Send start message for Electron
    msg = json.dumps({"type": "assistant_start"})
    print(f"__JSON__{msg}__JSON__", flush=True)

    response_text = ""
    call_id_tracker = {}  # Track function call IDs
    tool_tokens = 0  # Track tokens from tool calls

    # No retry logic - fail fast on errors
    try:
        # Use the new session's convenience method that handles auto-summarization
        # This returns a RunResultStreaming object
        result = await session.run_with_auto_summary(session.agent, user_input, max_turns=50)

        # Stream the events
        async for event in result.stream_events():
            # Convert to Electron IPC format with call_id tracking
            ipc_msg, tokens = await handle_electron_ipc(event, call_id_tracker)
            tool_tokens += tokens  # Accumulate tool tokens
            if ipc_msg:
                print(f"__JSON__{ipc_msg}__JSON__", flush=True)

            # Accumulate response text for logging
            if (
                event.type == "run_item_stream_event"
                and hasattr(event, "item")
                and event.item
                and event.item.type == "message_output_item"
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
    msg = json.dumps({"type": "assistant_end"})
    print(f"__JSON__{msg}__JSON__", flush=True)

    # Log response
    if response_text:
        file_msg = f"AI: {response_text[:100]}{'...' if len(response_text) > 100 else ''}"
        logger.info(f"AI: {response_text}", extra={"file_message": file_msg})

    # Update token count in session after the run completes
    # First update conversation items tokens
    items = await session.get_items()
    session.total_tokens = session._calculate_total_tokens(items)

    # Then add tool tokens (they're not stored in items)
    if tool_tokens > 0:
        session.update_with_tool_tokens(tool_tokens)
    else:
        # Still log the current token usage even if no tools were used
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

    # Load environment variables
    load_dotenv()

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
            msg = json.dumps({"type": "error", "message": "An unexpected error occurred."})
            print(f"__JSON__{msg}__JSON__", flush=True)

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
