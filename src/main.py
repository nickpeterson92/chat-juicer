#!/usr/bin/env python3
"""
Simple interactive chat with Azure OpenAI gpt-5-chat deployment using Responses API
"""

import os
import sys
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

set_default_openai_client(azure_client)
set_default_openai_api("responses")

deployment_name = "gpt-5-chat"

print(f"Connected to {azure_endpoint}")
print(f"Using deployment: {deployment_name}")
print("Type 'quit' or 'exit' to end the conversation")
print("=" * 60)

# Main chat loop
while True:
    try:
        # Get user input
        user_input = input("\nYou: ").strip()
        
        # Check for exit commands
        if user_input.lower() in ['quit', 'exit', 'q']:
            print("Goodbye!")
            break
        
        # Skip empty input
        if not user_input:
            continue
        
        # Get response using Responses API
        response = azure_client.responses.create(
            model=deployment_name,
            input=user_input
        )
        
        # Display response
        # Extract text from the response structure
        if response.output and len(response.output) > 0:
            message = response.output[0]  # Get first ResponseOutputMessage
            if message.content and len(message.content) > 0:
                text_content = message.content[0]  # Get first ResponseOutputText
                assistant_response = text_content.text
            else:
                assistant_response = ""
        else:
            assistant_response = ""
        
        print(f"\nAssistant: {assistant_response}")
        
    except KeyboardInterrupt:
        print("\n\nInterrupted. Goodbye!")
        break
    except Exception as e:
        print(f"\nError: {e}")
        print("Please try again or type 'quit' to exit.")