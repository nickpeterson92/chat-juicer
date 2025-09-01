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

import os
import sys
import json
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI
from agents import set_default_openai_client, set_default_openai_api, set_tracing_disabled

# Load environment variables
load_dotenv()

azure_key = os.getenv("AZURE_OPENAI_API_KEY")
azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")

if not azure_key or not azure_endpoint:
    print("Error: Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables")
    sys.exit(1)

# Set up for Azure with Responses API
set_tracing_disabled(True)  # Disable tracing for Azure

azure_client = OpenAI(
    api_key=azure_key,
    base_url=azure_endpoint
)

tools = [{
    "type": "function",
    "name": "get_weather",
    "description": "Get current temperature for a given location.",
    "parameters": {
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "City and country e.g. Bogotá, Colombia"
            }
        },
        "required": [
            "location"
        ],
        "additionalProperties": False
    }
}]

def get_weather(location):
    return f"The temperature in {location} is 20 degrees Celsius."

def log_function_call(function_name, args, result):
    """Log function calls to a file instead of printing to console"""
    timestamp = datetime.now().isoformat()
    log_entry = {
        "timestamp": timestamp,
        "function": function_name,
        "arguments": args,
        "result": result
    }
    
    # Append to log file
    with open("function_calls.log", "a") as f:
        f.write(json.dumps(log_entry) + "\n")

set_default_openai_client(azure_client)
set_default_openai_api("responses")

deployment_name = "gpt-5-mini"

print(f"Connected to {azure_endpoint}")
print(f"Using deployment: {deployment_name}")
print("Type 'quit' or 'exit' to end the conversation")
print("=" * 60)

# Track the previous response ID for conversation continuity
previous_response_id = None

# Main chat loop
while True:
    try:
        # Get user input (no prompt since we're in GUI mode)
        user_input = input().strip()
        
        # Check for exit commands
        if user_input.lower() in ['quit', 'exit', 'q']:
            print("Goodbye!")
            break
        
        # Skip empty input
        if not user_input:
            continue
        
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
            "instructions": "You are a helpful assistant. Remember information the user tells you about themselves."
        }
        
        # Add previous_response_id if we have one (for conversation continuity)
        if previous_response_id:
            request_params["previous_response_id"] = previous_response_id
            # Debug: log when using previous_response_id
            # print(f"[DEBUG: Using previous_response_id: {previous_response_id}]", flush=True)
        
        # Get streaming response
        stream = azure_client.responses.create(**request_params)

        tool_calls = []
        response_text = ""
        current_response_id = None
        # Track if we've started sending assistant messages
        
        # Process streaming events
        for event in stream:
            # Debug: log all event types (comment out after testing)
            # print(f"\n[DEBUG: Event type: {event.type}]", flush=True)
            
            # Capture response ID from response.created event
            if event.type == 'response.created':
                if hasattr(event, 'response') and hasattr(event.response, 'id'):
                    current_response_id = event.response.id
                    # Debug: log response ID tracking
                    # print(f"\n[DEBUG: Got response ID: {current_response_id}]", flush=True)
            
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
        
        # Update previous_response_id for next turn
        if current_response_id:
            previous_response_id = current_response_id
        
        # If there were tool calls, execute them and get final response
        if tool_calls:
            
            # Build a fresh input_list with just what's needed for function calling
            # Start with the original user message
            function_context = [{
                "role": "user",
                "content": user_input
            }]
            
            # Add the tool calls
            for tool_call in tool_calls:
                function_context.append({
                    "type": "function_call",
                    "call_id": tool_call.call_id,
                    "name": tool_call.name,
                    "arguments": tool_call.arguments
                })
            
            # Execute each tool call and add outputs
            for tool_call in tool_calls:
                # Execute the function
                if tool_call.name == 'get_weather':
                    args = json.loads(tool_call.arguments)
                    result = get_weather(args['location'])
                    
                    # Log the function call to file
                    log_function_call(tool_call.name, args, result)
                    
                    # Add function call output
                    function_context.append({
                        "type": "function_call_output",
                        "call_id": tool_call.call_id,
                        "output": result
                    })
            
            # Make second request with function results
            # Use previous_response_id to maintain context
            msg = json.dumps({"type": "assistant_start"})
            print(f"__JSON__{msg}__JSON__", flush=True)
            
            final_request_params = {
                "model": deployment_name,
                "input": function_context,  # Use function_context with function results
                "tools": tools,
                "stream": True,
                "store": True
            }
            
            # Add previous_response_id to maintain conversation context
            if current_response_id:
                final_request_params["previous_response_id"] = current_response_id
            
            final_response = azure_client.responses.create(**final_request_params)
            
            final_text = ""
            for event in final_response:
                # Capture the new response ID
                if event.type == 'response.created':
                    if hasattr(event, 'response') and hasattr(event.response, 'id'):
                        previous_response_id = event.response.id
                        
                elif event.type == 'response.output_text.delta':
                    msg = json.dumps({"type": "assistant_delta", "content": event.delta})
                    print(f"__JSON__{msg}__JSON__", flush=True)
                    final_text += event.delta
                elif event.type == 'response.done':
                    msg = json.dumps({"type": "assistant_end"})
                    print(f"__JSON__{msg}__JSON__", flush=True)
        
        # Response complete

    except KeyboardInterrupt:
        print("\n\nInterrupted. Goodbye!")
        break
    except Exception as e:
        print(f"\nError: {e}")
        print("Please try again or type 'quit' to exit.")