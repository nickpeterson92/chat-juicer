"""
Chat Juicer - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from agents import Agent, Runner, set_default_openai_client, set_tracing_disabled
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

# Import function tools for Agent/Runner
from functions import AGENT_TOOLS
from logger import logger
from tool_patch import apply_tool_patch, patch_native_tools

# System instructions for the documentation bot
SYSTEM_INSTRUCTIONS = """You are a technical documentation automation assistant.

Core Capabilities:
- File system access for reading and writing documents
- Document generation with template support
- Token-aware content optimization
- Sequential Thinking for complex problem-solving and structured reasoning

The Sequential Thinking tool helps you:
- Break down complex problems into manageable steps
- Revise thoughts as understanding deepens
- Branch into alternative reasoning paths
- Generate and verify solution hypotheses
- Maintain context across multiple reasoning steps

When asked to create documentation:
1. First use list_directory to explore available files
2. Then use read_file to examine source files from the sources/ directory
3. After all sources are read, use read_file to load the most relevant template from the templates/ directory
4. Generate comprehensive document content based on the template and source files
5. Use generate_document to save the completed document(s) to the output/ directory
6. If multiple documents are to be generated ensure ALL generated documents follow the template and are complete

Key points:
- Read ALL files of ALL extensions in the sources/ directory:
- .md, .txt, .docx, .doc, .pptx, .ppt, .xlsx, .xls, .pdf, .csv, .html, .htm, .xml, .json, .ipynb, etc.
- The read_file tool is safe to run in parallel with multiple sources
- Templates are markdown files in templates/ directory - use read_file to access them
- Load the most relevant template for the documentation type requested
- The generate_document function takes the complete document content and saves it
- Ensure that all sections of the template are filled with content relevant to the source files
- Ensure the content of the document is accurate and complete
- Ensure all requested Mermaid diagrams are generated accurately and with the correct syntax
- Ensure generated documents are produced with proper markdown formatting
- Always provide the full document content to generate_document, not a template with placeholders"""


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
    if hasattr(item, "raw_item") and hasattr(item.raw_item, "content") and item.raw_item.content:
        for content_item in item.raw_item.content:
            if hasattr(content_item, "text") and content_item.text:
                return json.dumps({"type": "assistant_delta", "content": content_item.text})
    return None


def handle_tool_call(item, call_id_tracker):
    """Handle tool call items (function invocations)"""
    tool_name = "unknown"
    call_id = ""
    arguments = "{}"

    if hasattr(item, "raw_item"):
        if hasattr(item.raw_item, "name"):
            tool_name = item.raw_item.name
        # Use call_id (not id) - this is what the UI expects
        if hasattr(item.raw_item, "call_id"):
            call_id = item.raw_item.call_id
            # Store call_id with tool name for parallel tracking
            if "active_calls" not in call_id_tracker:
                call_id_tracker["active_calls"] = []
            call_id_tracker["active_calls"].append({"call_id": call_id, "tool_name": tool_name})
        elif hasattr(item.raw_item, "id"):
            # Fallback to id if call_id not available
            call_id = item.raw_item.id
        if hasattr(item.raw_item, "arguments"):
            arguments = item.raw_item.arguments

    return json.dumps({"type": "function_detected", "name": tool_name, "call_id": call_id, "arguments": arguments})


def handle_reasoning(item):
    """Handle reasoning items (Sequential Thinking output)"""
    if hasattr(item, "raw_item") and hasattr(item.raw_item, "content") and item.raw_item.content:
        for content_item in item.raw_item.content:
            if hasattr(content_item, "text") and content_item.text:
                return json.dumps({"type": "assistant_delta", "content": f"[Thinking] {content_item.text}"})
    return None


def handle_tool_output(item, call_id_tracker):
    """Handle tool call output items (function results)"""
    output_text = ""
    call_id = ""
    success = True

    # Try to match this output with a call_id
    if call_id_tracker.get("active_calls"):
        # Pop the first active call (FIFO order)
        call_info = call_id_tracker["active_calls"].pop(0)
        call_id = call_info["call_id"]

    # Get output and check for errors
    if hasattr(item, "raw_item"):
        if hasattr(item.raw_item, "output"):
            output_text = str(item.raw_item.output)
        # Check for errors
        if hasattr(item.raw_item, "error") and item.raw_item.error:
            success = False
            output_text = str(item.raw_item.error)
    elif hasattr(item, "output"):
        output_text = str(item.output)

    # Truncate if too long
    if len(output_text) > 100:
        output_text = output_text[:100] + "..."

    return json.dumps({"type": "function_completed", "call_id": call_id, "success": success, "output": output_text})


def handle_handoff_call(item):
    """Handle handoff call items (multi-agent orchestration)"""
    target_agent = "unknown"
    if hasattr(item, "raw_item") and hasattr(item.raw_item, "target"):
        target_agent = item.raw_item.target
    return json.dumps({"type": "handoff_started", "target_agent": target_agent})


def handle_handoff_output(item):
    """Handle handoff output items (multi-agent results)"""
    source_agent = "unknown"
    result = ""
    if hasattr(item, "raw_item") and hasattr(item.raw_item, "source"):
        source_agent = item.raw_item.source
    if hasattr(item, "output"):
        result = str(item.output)[:100]  # Truncate if long
    return json.dumps({"type": "handoff_completed", "source_agent": source_agent, "result": result})


async def handle_electron_ipc(event, call_id_tracker=None):
    """Convert Agent/Runner events to Electron IPC format

    Args:
        event: The streaming event
        call_id_tracker: Dict to track call_ids between tool_call and tool_call_output events
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
        return json.dumps({"type": "agent_updated", "name": event.new_agent.name})

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


async def process_user_input(agent, messages, user_input, previous_response_id=None):
    """Process a single user input and return updated messages

    Args:
        agent: The AI agent instance
        messages: Conversation history (kept for logging, not sent to API)
        user_input: User's message
        previous_response_id: ID from previous response for conversation continuity

    Returns:
        Tuple of (messages, response_id) for next turn
    """

    # Add user message to our local history (for logging)
    messages.append({"role": "user", "content": user_input})

    # Send start message for Electron
    msg = json.dumps({"type": "assistant_start"})
    print(f"__JSON__{msg}__JSON__", flush=True)

    response_text = ""
    call_id_tracker = {}  # Track function call IDs
    result = None  # Store result for response_id extraction

    # No retry logic - fail fast on errors
    try:
        # Run agent with streaming
        # Use conversation_id for persistent conversation state across turns
        conversation_id = getattr(agent, "_conversation_id", None)

        result = Runner.run_streamed(
            agent,
            input=user_input,  # Always pass string input, let Agent manage context
            previous_response_id=previous_response_id,  # For continuing conversation
            conversation_id=conversation_id,  # For persistent conversation storage
            max_turns=20,  # Reasonable limit for turns
        )

        async for event in result.stream_events():
            # Convert to Electron IPC format with call_id tracking
            ipc_msg = await handle_electron_ipc(event, call_id_tracker)
            if ipc_msg:
                print(f"__JSON__{ipc_msg}__JSON__", flush=True)

            # Accumulate response text for logging
            if (
                event.type == "run_item_stream_event"
                and hasattr(event, "item")
                and event.item
                and event.item.type == "message_output_item"
                and hasattr(event.item, "raw_item")
                and hasattr(event.item.raw_item, "content")
                and event.item.raw_item.content
            ):
                for content_item in event.item.raw_item.content:
                    if hasattr(content_item, "text") and content_item.text:
                        response_text += content_item.text

    except Exception as e:
        handle_streaming_error(e)
        return messages, None

    # For streaming, we accumulate the response text during streaming
    # and add it to history once streaming is complete
    if response_text:
        messages.append({"role": "assistant", "content": response_text})

    # Send end message
    msg = json.dumps({"type": "assistant_end"})
    print(f"__JSON__{msg}__JSON__", flush=True)

    # Log response
    if response_text:
        file_msg = f"AI: {response_text[:100]}{'...' if len(response_text) > 100 else ''}"
        logger.info(f"AI: {response_text}", extra={"file_message": file_msg})

    # Extract response_id from result for next turn
    response_id = None
    if result:
        try:
            # The RunResultStreaming has last_response_id attribute
            if hasattr(result, "last_response_id"):
                response_id = result.last_response_id
                logger.info(f"Response ID extracted for next turn: {response_id}")
            else:
                logger.warning("Result has no last_response_id attribute")

            # Store conversation_id on the agent for future turns if available
            # Note: RunResultStreaming doesn't have conversation_id, that's handled internally
        except Exception as e:
            logger.warning(f"Could not extract response_id: {e}")

    return messages, response_id


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

    # Runner class is used directly (static methods)

    # Log startup
    logger.info(f"Chat Juicer starting - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(patched_tools)} tools and {len(mcp_servers)} MCP servers")

    print("Connected to Azure OpenAI")
    print(f"Using deployment: {deployment}")
    if mcp_servers:
        print("MCP Servers: Sequential Thinking enabled")

    # Conversation history and response tracking
    messages = []
    previous_response_id = None  # Track response_id for conversation continuity

    # Main chat loop
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

            # Process user input (no retry - fail fast)
            messages, previous_response_id = await process_user_input(agent, messages, user_input, previous_response_id)

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
