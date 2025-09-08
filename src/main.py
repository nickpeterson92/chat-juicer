"""
Chat Juicer - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

import httpx

from agents import Agent, Runner, set_default_openai_client, set_tracing_disabled
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from constants import MAX_RETRIES, RETRY_BACKOFF_BASE, RETRYABLE_ERROR_PATTERNS

# Import function tools for Agent/Runner
from functions import AGENT_TOOLS
from logger import logger

# System instructions for the documentation bot
SYSTEM_INSTRUCTIONS = """You are a technical documentation automation assistant with advanced reasoning capabilities.

Core Capabilities:
- Sequential Thinking for complex problem-solving and structured reasoning
- File system access for reading and writing documents
- Document generation with template support
- Token-aware content optimization

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
4. Generate comprehensive document(s) content based on the template and source files
5. Use generate_document to save the completed document(s) to the output/ directory
6. If multiple documents are to be generated ensure ALL generated documents follow the template and are complete

Key points:
- Read ALL files of ALL extensions in the sources/ directory:
- .md, .txt, .docx, .doc, .pptx, .ppt, .xlsx, .xls, .pdf, .csv, .html, .htm, .xml, .json, .ipynb, etc.
- The read_file tool is safe to run in parallel with multiple sources
- Templates are markdown files in templates/ directory - use read_file to access them
- Load the most relevant template for the documentation type requested
- The generate_document function takes the complete document content and saves it
- Ensure that all sections of the template are filled with the content of the source files
- Ensure the content of the document is accurate and complete
- Ensure all requested Mermaid diagrams are generated accurately and with the correct syntax
- Consider each section of the template carefully and ensure it is filled with the content of the source files
- Always provide the full document content to generate_document, not a template with placeholders"""


async def setup_mcp_servers():
    """Configure and initialize MCP servers"""
    servers = []

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
        logger.info("✅ Sequential Thinking MCP server initialized")
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


async def process_user_input_with_retry(
    agent, messages, user_input, previous_response_id=None, max_retries=MAX_RETRIES
):
    """Process user input with retry logic for transient errors

    Args:
        agent: The AI agent instance
        messages: Conversation history
        user_input: User's message
        previous_response_id: ID from previous response for conversation continuity
        max_retries: Maximum number of retry attempts

    Returns:
        Tuple of (messages, response_id) for next turn
    """

    for attempt in range(max_retries + 1):
        try:
            return await process_user_input(agent, messages, user_input, previous_response_id)
        except (RateLimitError, APIConnectionError) as e:
            # These are always retryable
            if attempt < max_retries:
                wait_time = (2**attempt) * RETRY_BACKOFF_BASE  # Exponential backoff
                logger.warning(f"Retryable error on attempt {attempt + 1}/{max_retries + 1}: {e}")
                logger.info(f"Retrying in {wait_time} seconds...")

                # Send retry notification to UI
                msg = json.dumps(
                    {
                        "type": "retry",
                        "attempt": attempt + 1,
                        "max_attempts": max_retries + 1,
                        "wait_time": wait_time,
                        "reason": "Temporary error - retrying automatically",
                    }
                )
                print(f"__JSON__{msg}__JSON__", flush=True)

                await asyncio.sleep(wait_time)
                continue
            else:
                logger.error(f"Max retries ({max_retries}) exceeded for error: {e}")
                raise

        except APIStatusError as e:
            # Check if this is an RS_ error (shouldn't happen as they're caught in streaming)
            error_msg = str(e)
            if e.status_code == 400 and ("rs_" in error_msg or "fc_" in error_msg) and "not found" in error_msg.lower():
                # RS_ (reasoning) and FC_ (function call) errors are benign streaming state issues - don't retry
                logger.warning(f"Streaming state error handled: {error_msg}")

                # Send a completion message to UI so it doesn't hang
                msg = json.dumps(
                    {
                        "type": "assistant_end",
                        "warning": "Response interrupted due to temporary streaming issue. Please try again if needed.",
                    }
                )
                print(f"__JSON__{msg}__JSON__", flush=True)

                return messages, None  # Return with any accumulated messages, no response_id on error

            # Check if it's another retryable status code
            retryable_status_codes = [429, 500, 502, 503, 504]  # Rate limit and server errors
            if e.status_code in retryable_status_codes and attempt < max_retries:
                wait_time = (2**attempt) * RETRY_BACKOFF_BASE
                logger.warning(f"Retryable status {e.status_code} on attempt {attempt + 1}/{max_retries + 1}: {e}")
                logger.info(f"Retrying in {wait_time} seconds...")

                msg = json.dumps(
                    {
                        "type": "retry",
                        "attempt": attempt + 1,
                        "max_attempts": max_retries + 1,
                        "wait_time": wait_time,
                        "reason": f"HTTP {e.status_code} error - retrying",
                    }
                )
                print(f"__JSON__{msg}__JSON__", flush=True)

                await asyncio.sleep(wait_time)
                continue
            else:
                # Non-retryable status code or max retries exceeded
                if attempt == max_retries:
                    logger.error(f"Max retries ({max_retries}) exceeded for status {e.status_code}: {e}")
                raise

        except Exception as e:
            # Non-API errors - check if pattern matches retryable
            error_msg = str(e).lower()

            is_retryable = any(pattern in error_msg for pattern in RETRYABLE_ERROR_PATTERNS)

            if is_retryable and attempt < max_retries:
                wait_time = (2**attempt) * RETRY_BACKOFF_BASE
                logger.warning(f"Retryable error on attempt {attempt + 1}/{max_retries + 1}: {e}")
                logger.info(f"Retrying in {wait_time} seconds...")

                msg = json.dumps(
                    {
                        "type": "retry",
                        "attempt": attempt + 1,
                        "max_attempts": max_retries + 1,
                        "wait_time": wait_time,
                        "reason": "Temporary error - retrying automatically",
                    }
                )
                print(f"__JSON__{msg}__JSON__", flush=True)

                await asyncio.sleep(wait_time)
                continue
            else:
                # Not retryable or max retries reached
                if attempt == max_retries and is_retryable:
                    logger.error(f"Max retries ({max_retries}) exceeded for error: {e}")
                raise

    # Should never reach here
    raise Exception("Max retries exceeded")


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
    rs_error_encountered = False  # Track if we hit RS_ errors

    retries = 0
    while retries <= MAX_RETRIES:
        try:
            # Run agent with streaming
            # Use conversation_id for persistent conversation state across turns
            # If we don't have a conversation_id yet, let OpenAI create one
            conversation_id = getattr(agent, "_conversation_id", None)

            result = Runner.run_streamed(
                agent,
                input=user_input if previous_response_id else messages,  # Pass full history on first turn
                previous_response_id=previous_response_id,  # For continuing conversation
                conversation_id=conversation_id,  # For persistent conversation storage
                max_turns=20,  # Reasonable limit for turns
            )

            async for event in result.stream_events():
                try:
                    # Debug: log event types
                    if hasattr(event, "item") and event.item:
                        logger.debug(f"Event type: {event.type}, Item type: {event.item.type}")
                    else:
                        logger.debug(f"Event type: {event.type}, No item")

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

                except APIStatusError as e:
                    # Check if this is an RS_ error during streaming
                    error_msg = str(e)
                    if (
                        e.status_code == 400
                        and ("rs_" in error_msg or "fc_" in error_msg)
                        and "not found" in error_msg.lower()
                    ):
                        # RS_ (reasoning) and FC_ (function call) errors - internal streaming state management issues
                        # Continue streaming to preserve content
                        logger.warning(f"Streaming state error during streaming (continuing): {error_msg}")
                        rs_error_encountered = True
                        continue
                    else:
                        # Other API errors should break the stream
                        raise
                except Exception as e:
                    # Log but continue for RS_/FC_ pattern in any exception
                    error_msg = str(e)
                    if ("rs_" in error_msg or "fc_" in error_msg) and "not found" in error_msg.lower():
                        logger.warning(f"Streaming state error during streaming (continuing): {error_msg}")
                        rs_error_encountered = True
                        continue
                    else:
                        # Other exceptions should break the stream
                        raise

            # If we successfully complete streaming, break out of retry loop
            # Debug: log what's available on the result object
            logger.debug(f"Result type: {type(result)}")
            logger.debug(f"Result attributes: {dir(result)}")
            if hasattr(result, "raw_responses"):
                logger.debug(f"Raw responses count: {len(result.raw_responses) if result.raw_responses else 0}")
            break

        except (httpx.ReadError, httpx.ConnectError, httpx.TimeoutException) as e:
            # Network errors - retry with exponential backoff
            retries += 1
            if retries > MAX_RETRIES:
                logger.error(f"Network error after {MAX_RETRIES} retries: {e}")
                msg = json.dumps({"type": "error", "message": "Network connection lost. Please try again."})
                print(f"__JSON__{msg}__JSON__", flush=True)
                raise

            wait_time = RETRY_BACKOFF_BASE * (2 ** (retries - 1))
            logger.warning(f"Network error (attempt {retries}/{MAX_RETRIES}): {e}. Retrying in {wait_time}s...")
            msg = json.dumps(
                {"type": "info", "message": f"Connection interrupted. Retrying... (attempt {retries}/{MAX_RETRIES})"}
            )
            print(f"__JSON__{msg}__JSON__", flush=True)
            await asyncio.sleep(wait_time)
            continue

        except (RateLimitError, APIConnectionError) as e:
            # OpenAI-specific network/rate errors - retry with backoff
            retries += 1
            if retries > MAX_RETRIES:
                logger.error(f"API error after {MAX_RETRIES} retries: {e}")
                error_type = "Rate limit" if isinstance(e, RateLimitError) else "Connection"
                msg = json.dumps(
                    {"type": "error", "message": f"{error_type} error. Please wait a moment and try again."}
                )
                print(f"__JSON__{msg}__JSON__", flush=True)
                raise

            wait_time = RETRY_BACKOFF_BASE * (2 ** (retries - 1))
            logger.warning(f"API error (attempt {retries}/{MAX_RETRIES}): {e}. Retrying in {wait_time}s...")
            msg = json.dumps({"type": "info", "message": f"API error. Retrying... (attempt {retries}/{MAX_RETRIES})"})
            print(f"__JSON__{msg}__JSON__", flush=True)
            await asyncio.sleep(wait_time)
            continue

        except APIStatusError as e:
            error_msg = str(e)

            # Check if it's a rate limit error (429)
            if e.status_code == 429:
                retries += 1
                if retries > MAX_RETRIES:
                    logger.error(f"Rate limit persisted after {MAX_RETRIES} retries")
                    # Don't send error message here, let the wrapper handle it
                    # Re-raise the original error so wrapper can retry
                    raise

                # Extract wait time from error message if available
                wait_time = 2.0  # Default wait time
                if "Try again in" in error_msg:
                    try:
                        # Extract seconds from message like "Try again in 2 seconds"
                        match = re.search(r"Try again in (\d+(?:\.\d+)?)", error_msg)
                        if match:
                            wait_time = float(match.group(1))
                    except Exception:
                        pass

                logger.warning(f"Rate limit hit (attempt {retries}/{MAX_RETRIES}). Waiting {wait_time}s...")
                msg = json.dumps(
                    {
                        "type": "info",
                        "message": f"Rate limit reached. Waiting {wait_time}s... (attempt {retries}/{MAX_RETRIES})",
                    }
                )
                print(f"__JSON__{msg}__JSON__", flush=True)
                await asyncio.sleep(wait_time)
                continue

            # Other API status errors (including RS_/FC_ errors outside streaming)
            # RS_/FC_ errors are transient streaming issues - if they happen here, send end message
            elif ("rs_" in error_msg or "fc_" in error_msg) and "not found" in error_msg.lower():
                logger.warning(f"Streaming state error outside streaming context: {error_msg}")
                # Send end message to prevent UI hang
                msg = json.dumps({"type": "assistant_end", "warning": "Response interrupted. Please try again."})
                print(f"__JSON__{msg}__JSON__", flush=True)
                # Return current messages without raising - this is a benign error
                return messages, None  # No response_id on error
            else:
                logger.error(f"API status error: {e}")
                msg = json.dumps({"type": "error", "message": f"API error: {e.status_code}"})
                print(f"__JSON__{msg}__JSON__", flush=True)
                raise

        except Exception as e:
            # Check if this is a rate limit error that should be retryable
            error_msg = str(e).lower()
            if "rate limit" in error_msg:
                # Re-raise the original exception to be caught by retry wrapper
                # The wrapper already handles RateLimitError properly
                raise

            # Unexpected errors
            logger.error(f"Unexpected streaming error: {e}")
            msg = json.dumps({"type": "error", "message": "An unexpected error occurred."})
            print(f"__JSON__{msg}__JSON__", flush=True)
            raise

    # For streaming, we accumulate the response text during streaming
    # and add it to history once streaming is complete
    if response_text:
        messages.append({"role": "assistant", "content": response_text})

    # Send end message with warning if RS_ errors occurred
    if rs_error_encountered:
        logger.warning("Response completed despite RS_ streaming errors")
        msg = json.dumps(
            {"type": "assistant_end", "warning": "Minor streaming errors occurred but response should be complete"}
        )
    else:
        msg = json.dumps({"type": "assistant_end"})
    print(f"__JSON__{msg}__JSON__", flush=True)

    # Log response
    if response_text:
        file_msg = f"AI: {response_text[:100]}{'...' if len(response_text) > 100 else ''}"
        logger.info(f"AI: {response_text}", extra={"file_message": file_msg})

    # Extract response_id and conversation_id from result for next turn
    response_id = None
    try:
        # Try to get response_id from raw_responses
        if hasattr(result, "raw_responses") and result.raw_responses:
            # Get the last response's ID
            last_response = result.raw_responses[-1]
            if hasattr(last_response, "id"):
                response_id = last_response.id
                logger.debug(f"Response ID for next turn: {response_id}")
            elif hasattr(last_response, "response_id"):
                response_id = last_response.response_id
                logger.debug(f"Response ID for next turn: {response_id}")

        # Store conversation_id on the agent for future turns
        if hasattr(result, "conversation_id") and result.conversation_id:
            agent._conversation_id = result.conversation_id
            logger.debug(f"Conversation ID stored: {result.conversation_id}")
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

    # Create agent with tools and MCP servers
    agent = Agent(
        name="Chat Juicer",
        model=deployment,
        instructions=SYSTEM_INSTRUCTIONS,
        tools=AGENT_TOOLS,  # Use properly wrapped function tools
        mcp_servers=mcp_servers,
    )

    # Runner class is used directly (static methods)

    # Log startup
    logger.info(f"Chat Juicer starting - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(AGENT_TOOLS)} tools and {len(mcp_servers)} MCP servers")

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

            # Process user input with retry logic
            messages, previous_response_id = await process_user_input_with_retry(
                agent, messages, user_input, previous_response_id
            )

        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
            break
        except EOFError:
            # Handle EOF from Electron
            logger.info("EOF received, shutting down")
            break
        except (RateLimitError, APIConnectionError) as e:
            # Rate limit or connection errors after all retries exhausted
            logger.error(f"API error in main loop after retries: {e}")
            msg = json.dumps({"type": "error", "message": "Rate limit exceeded. Please wait a moment and try again."})
            print(f"__JSON__{msg}__JSON__", flush=True)
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
            msg = json.dumps({"type": "error", "message": str(e)})
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
