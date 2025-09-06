#!/usr/bin/env python3
"""
Simple interactive chat with Azure OpenAI gpt-5-chat deployment using Responses API

Key architectural differences from Chat Completions API:

1. Responses API can be STATEFUL with `previous_response_id`:
   - Links responses together for conversation continuity
   - Server maintains context between turns
   - Only need to send current user input

2. Chat Completions API is STATELESS:
   - Must send full message history each time
   - No server-side conversation state
   - Requires client-side history management

3. For function calling:
   - Build temporary context with: user message → function call → function output
   - Use previous_response_id to maintain conversation after function execution

4. The `store: true` parameter enables response retrieval later
"""

import json
import sys

from azure_client import setup_azure_client
from functions import FUNCTION_REGISTRY, TOOLS

# Import local modules
from logger import logger
from utils import handle_rate_limit

# System instructions for the documentation bot
SYSTEM_INSTRUCTIONS = """You are a technical documentation automation assistant with file system access.

When asked to create documentation:
1. First use list_directory to explore available files
2. Use read_file to read ALL files from the sources/ directory ONLY
3. Use load_template to load the requested template
4. Use generate_document to combine the template with source content
5. Use write_document to save the generated document
6. Respond with a brief confirmation of what was created

Always complete the full workflow when creating documents."""

# Set up Azure client
try:
    azure_client, deployment_name = setup_azure_client()
except ValueError as e:
    print(f"Error: {e}")
    sys.exit(1)

# Tools are imported from functions module
tools = TOOLS

# Azure client and deployment are set up by azure_client module

# Log startup
logger.info(f"Chat Juicer starting - Deployment: {deployment_name}")

print("Connected to Azure OpenAI")
print(f"Using deployment: {deployment_name}")

# Track the previous response ID for conversation continuity
previous_response_id = None

# Main chat loop
while True:
    try:
        # Get user input (no prompt since we're in GUI mode)
        user_input = input().strip()

        # Skip empty input
        if not user_input:
            continue

        # Log user input - full to console, truncated to file
        file_msg = f"User: {user_input[:100]}{'...' if len(user_input) > 100 else ''}"
        logger.info(f"User: {user_input}", extra={"file_message": file_msg})

        # For Responses API with previous_response_id, we maintain state server-side
        # Only need to send current user input
        input_list = [{
            "role": "user",
            "content": user_input,
        }]

        # Build request parameters
        request_params = {
            "model": deployment_name,
            "input": input_list,
            "tools": tools,
            "stream": True,
            "store": True,
            "instructions": SYSTEM_INSTRUCTIONS,
        }

        # Add previous_response_id if we have one (for conversation continuity)
        if previous_response_id:
            request_params["previous_response_id"] = previous_response_id

        # Get streaming response with rate limit handling
        logger.info("AI: Starting response...", extra={"file_message": "AI: Start"})
        stream = handle_rate_limit(azure_client.responses.create, logger=logger, **request_params)

        tool_calls = []
        response_text = ""
        current_response_id = None

        # Process streaming events
        for event in stream:
            # Debug: Log event type to understand what's available
            if hasattr(event, "type"):
                logger.debug(f"Stream event type: {event.type}")

            # Capture response ID from response.created event
            if event.type == "response.created":
                if hasattr(event, "response") and hasattr(event.response, "id"):
                    current_response_id = event.response.id

            # Handle text delta events for clean output
            elif event.type == "response.output_text.delta":
                # Send start message only once per response
                if not response_text:
                    msg = json.dumps({"type": "assistant_start"})
                    print(f"__JSON__{msg}__JSON__", flush=True)
                # Send delta message
                msg = json.dumps({"type": "assistant_delta", "content": event.delta})
                print(f"__JSON__{msg}__JSON__", flush=True)
                response_text += event.delta

            # Handle function tool call completion
            elif event.type == "response.output_item.done":
                if hasattr(event.item, "type") and event.item.type == "function_call":
                    tool_calls.append(event.item)
                    # Send function detected event
                    msg = json.dumps({
                        "type": "function_detected",
                        "name": event.item.name,
                        "call_id": event.item.call_id,
                        "arguments": event.item.arguments,
                    })
                    print(f"__JSON__{msg}__JSON__", flush=True)
                    logger.info(f"Function detected: {event.item.name}")

            # Check for response completion event
            elif event.type == "response.done":
                # Send end message
                msg = json.dumps({"type": "assistant_end"})
                print(f"__JSON__{msg}__JSON__", flush=True)
                # Log response completion - full to console, truncated to file
                if response_text:
                    file_msg = f"AI: {response_text[:100]}{'...' if len(response_text) > 100 else ''}"
                    logger.info(f"AI: {response_text}", extra={"file_message": file_msg})

        # Update previous_response_id for next turn
        if current_response_id:
            previous_response_id = current_response_id

        # Initialize function context once, outside the loop
        function_context = [{
            "role": "user",
            "content": user_input,
        }]

        # Process function calls in a loop until no more functions are called
        while tool_calls:
            # Add the new tool calls to the existing context
            for tool_call in tool_calls:
                function_context.append({
                    "type": "function_call",
                    "call_id": tool_call.call_id,
                    "name": tool_call.name,
                    "arguments": tool_call.arguments,
                })

            # Execute each tool call and add outputs
            for i, tool_call in enumerate(tool_calls):
                # Send function execution start event
                msg = json.dumps({
                    "type": "function_executing",
                    "name": tool_call.name,
                    "call_id": tool_call.call_id,
                    "arguments": tool_call.arguments,
                })
                print(f"__JSON__{msg}__JSON__", flush=True)
                logger.info(f"Executing function: {tool_call.name}")

                # Initialize result variable
                result = None
                args = {}

                # Execute the function from registry
                if tool_call.name in FUNCTION_REGISTRY:
                    try:
                        # Try to parse the arguments JSON
                        args = json.loads(tool_call.arguments)
                        func = FUNCTION_REGISTRY[tool_call.name]
                        result = func(**args)

                        # Send success event
                        msg = json.dumps({
                            "type": "function_completed",
                            "name": tool_call.name,
                            "call_id": tool_call.call_id,
                            "success": True,
                        })
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        logger.info(f"Function completed: {tool_call.name}")

                    except json.JSONDecodeError as je:
                        # Handle malformed JSON from the AI
                        result = f"Error: Invalid JSON in function arguments - {je!s}"
                        logger.error(f"JSON decode error for {tool_call.name}: {je!s}")
                        logger.debug(f"Raw arguments that failed to parse: {tool_call.arguments}")

                        # Send error event
                        msg = json.dumps({
                            "type": "function_completed",
                            "name": tool_call.name,
                            "call_id": tool_call.call_id,
                            "success": False,
                            "error": f"Invalid JSON arguments: {je!s}",
                        })
                        print(f"__JSON__{msg}__JSON__", flush=True)

                    except Exception as e:
                        # Handle function execution errors
                        result = f"Error: {e!s}"
                        # Send error event
                        msg = json.dumps({
                            "type": "function_completed",
                            "name": tool_call.name,
                            "call_id": tool_call.call_id,
                            "success": False,
                            "error": str(e),
                        })
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        logger.error(f"Function error: {tool_call.name} - {e!s}")

                    # Log the function call (only if we have args)
                    if args:
                        logger.log_function_call(tool_call.name, args, result)

                else:
                    # Unknown function
                    result = f"Error: Unknown function {tool_call.name}"
                    # Send error event for unknown function
                    msg = json.dumps({
                        "type": "function_completed",
                        "name": tool_call.name,
                        "call_id": tool_call.call_id,
                        "success": False,
                        "error": "Unknown function",
                    })
                    print(f"__JSON__{msg}__JSON__", flush=True)
                    logger.error(f"Unknown function: {tool_call.name}")

                # ALWAYS add function call output, regardless of success/failure
                function_context.append({
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": result if result is not None else "Error: No output generated",
                })

            # Make second request with function results
            # Use previous_response_id to maintain context

            final_request_params = {
                "model": deployment_name,
                "input": function_context,  # Use function_context with function results
                "tools": tools,
                "stream": True,
                "store": True,
                "instructions": SYSTEM_INSTRUCTIONS,
            }

            # Add previous_response_id to maintain conversation context
            # Use the most recent response ID we have
            if previous_response_id:
                final_request_params["previous_response_id"] = previous_response_id

            # Make the follow-up request with function results
            final_response = handle_rate_limit(azure_client.responses.create, logger=logger, **final_request_params)

            final_text = ""
            more_tool_calls = []

            for event in final_response:
                # Debug: Log event type
                if hasattr(event, "type"):
                    logger.debug(f"Final response event type: {event.type}")

                # Capture the new response ID
                if event.type == "response.created":
                    if hasattr(event, "response") and hasattr(event.response, "id"):
                        previous_response_id = event.response.id

                elif event.type == "response.output_text.delta":
                    # Send start message on first delta
                    if not final_text and event.delta:
                        msg = json.dumps({"type": "assistant_start"})
                        print(f"__JSON__{msg}__JSON__", flush=True)

                    if event.delta:  # Only send if there's actual content
                        msg = json.dumps({"type": "assistant_delta", "content": event.delta})
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        final_text += event.delta

                # Check for additional function calls
                elif event.type == "response.output_item.done":
                    if hasattr(event.item, "type") and event.item.type == "function_call":
                        more_tool_calls.append(event.item)
                        # Send function detected event for UI
                        msg = json.dumps({
                            "type": "function_detected",
                            "name": event.item.name,
                            "call_id": event.item.call_id,
                            "arguments": event.item.arguments,
                        })
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        logger.info(f"Additional function detected: {event.item.name}")

                elif event.type == "response.done":
                    # Only send end message if we actually sent content
                    if final_text:
                        msg = json.dumps({"type": "assistant_end"})
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        # Log the follow-up response - full to console, truncated to file
                        file_msg = f"AI (post-func): {final_text[:100]}{'...' if len(final_text) > 100 else ''}"
                        logger.info(f"AI (after functions): {final_text}", extra={"file_message": file_msg})

            # Continue with more tool calls if any
            tool_calls = more_tool_calls

        # No longer needed - we log in real-time as events happen

    except KeyboardInterrupt:
        logger.info("Chat interrupted by user")
        break
    except Exception as e:
        logger.error(f"Error in chat loop: {e}", exc_info=True)
        print(f"\nError: {e}")
