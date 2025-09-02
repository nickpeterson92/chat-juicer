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

import sys
import json

# Import local modules
from logger import logger
from azure_client import setup_azure_client
from functions import TOOLS, FUNCTION_REGISTRY

# System instructions for the documentation bot
SYSTEM_INSTRUCTIONS = """You are a technical documentation automation assistant with file system access.

When asked to create documentation:
1. First use list_directory to explore available files
2. Use read_file to read ALL deliverables from the deliverables/ directory ONLY
3. Use load_template to load the requested template
4. Use generate_document to combine the template with deliverables content
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
        logger.info(f"User: {user_input}", extra={'file_message': file_msg})
        
        # For Responses API with previous_response_id, we maintain state server-side
        # Only need to send current user input
        input_list = [{
            "role": "user",
            "content": user_input
        }]
        
        # Build request parameters
        request_params = {
            "model": deployment_name,
            "input": input_list,
            "tools": tools,
            "stream": True,
            "store": True,
            "instructions": SYSTEM_INSTRUCTIONS
        }
        
        # Add previous_response_id if we have one (for conversation continuity)
        if previous_response_id:
            request_params["previous_response_id"] = previous_response_id
        
        # Get streaming response
        logger.info("AI: Starting response...", extra={'file_message': 'AI: Start'})
        stream = azure_client.responses.create(**request_params)

        tool_calls = []
        response_text = ""
        current_response_id = None
        
        # Process streaming events
        for event in stream:
            # Capture response ID from response.created event
            if event.type == 'response.created':
                if hasattr(event, 'response') and hasattr(event.response, 'id'):
                    current_response_id = event.response.id
        
            # Handle text delta events for clean output
            elif event.type == 'response.output_text.delta':
                # Send structured JSON message for each delta
                # Send start message only once per response
                if not response_text:
                    msg = json.dumps({"type": "assistant_start"})
                    print(f"__JSON__{msg}__JSON__", flush=True)
                # Send delta message
                msg = json.dumps({"type": "assistant_delta", "content": event.delta})
                print(f"__JSON__{msg}__JSON__", flush=True)
                response_text += event.delta
        
            # Handle function tool call completion
            elif event.type == 'response.output_item.done':
                if hasattr(event.item, 'type') and event.item.type == 'function_call':
                    tool_calls.append(event.item)
        
            # Check for response completion event
            elif event.type == 'response.done':
                # Send end message
                msg = json.dumps({"type": "assistant_end"})
                print(f"__JSON__{msg}__JSON__", flush=True)
                # Log response completion - full to console, truncated to file
                if response_text:
                    file_msg = f"AI: {response_text[:100]}{'...' if len(response_text) > 100 else ''}"
                    logger.info(f"AI: {response_text}", extra={'file_message': file_msg})
    
        # Update previous_response_id for next turn
        if current_response_id:
            previous_response_id = current_response_id
    
        # Initialize function context once, outside the loop
        function_context = [{
            "role": "user",
            "content": user_input
        }]
        
        # Process function calls in a loop until no more functions are called
        while tool_calls:
            # Add the new tool calls to the existing context
            for tool_call in tool_calls:
                function_context.append({
                    "type": "function_call",
                    "call_id": tool_call.call_id,
                    "name": tool_call.name,  
                    "arguments": tool_call.arguments
                })
            
            # Execute each tool call and add outputs
            for tool_call in tool_calls:
                # Execute the function from registry
                if tool_call.name in FUNCTION_REGISTRY:
                    args = json.loads(tool_call.arguments)
                    func = FUNCTION_REGISTRY[tool_call.name]
                    result = func(**args)
                    # Log the function call
                    logger.log_function_call(tool_call.name, args, result)
                else:
                    result = f"Error: Unknown function {tool_call.name}"
                
                # Add function call output (moved outside the else block)
                function_context.append({
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": result
                })
            
            # Make second request with function results
            # Use previous_response_id to maintain context
            
            final_request_params = {
                "model": deployment_name,
                "input": function_context,  # Use function_context with function results
                "tools": tools,
                "stream": True,
                "store": True,
                "instructions": SYSTEM_INSTRUCTIONS
            }
            
            # Add previous_response_id to maintain conversation context
            # Use the most recent response ID we have
            if previous_response_id:
                final_request_params["previous_response_id"] = previous_response_id
            
            final_response = azure_client.responses.create(**final_request_params)
            
            final_text = ""
            more_tool_calls = []
            
            for event in final_response:
                # Capture the new response ID
                if event.type == 'response.created':
                    if hasattr(event, 'response') and hasattr(event.response, 'id'):
                        previous_response_id = event.response.id
                        
                elif event.type == 'response.output_text.delta':
                    # Send start message on first delta
                    if not final_text and event.delta:
                        msg = json.dumps({"type": "assistant_start"})
                        print(f"__JSON__{msg}__JSON__", flush=True)
                    
                    if event.delta:  # Only send if there's actual content
                        msg = json.dumps({"type": "assistant_delta", "content": event.delta})
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        final_text += event.delta
                        
                # Check for additional function calls
                elif event.type == 'response.output_item.done':
                    if hasattr(event.item, 'type') and event.item.type == 'function_call':
                        more_tool_calls.append(event.item)
                        
                elif event.type == 'response.done':
                    # Only send end message if we actually sent content
                    if final_text:
                        msg = json.dumps({"type": "assistant_end"})
                        print(f"__JSON__{msg}__JSON__", flush=True)
                        # Log the follow-up response - full to console, truncated to file
                        file_msg = f"AI (post-func): {final_text[:100]}{'...' if len(final_text) > 100 else ''}"
                        logger.info(f"AI (after functions): {final_text}", extra={'file_message': file_msg})
            
            # Continue with more tool calls if any
            tool_calls = more_tool_calls
    
        # No longer needed - we log in real-time as events happen

    except KeyboardInterrupt:
        logger.info("Chat interrupted by user")
        break
    except Exception as e:
        logger.error(f"Error in chat loop: {e}", exc_info=True)
        print(f"\nError: {e}")