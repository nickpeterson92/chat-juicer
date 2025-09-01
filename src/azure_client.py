"""
Azure OpenAI client setup and configuration.
Handles all Azure-specific initialization and client management.
"""
import os
from openai import AzureOpenAI
from dotenv import load_dotenv


def setup_azure_client():
    """
    Initialize and configure Azure OpenAI client.
    
    Returns:
        tuple: (client, model) - Configured client and model name
        
    Raises:
        ValueError: If required environment variables are missing
    """
    # Load environment variables
    load_dotenv()
    
    # Validate required environment variables
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-mini")
    
    if not api_key or not endpoint:
        raise ValueError(
            "Missing required environment variables: "
            "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be set"
        )
    
    # Initialize Azure OpenAI client (using base OpenAI client for Responses API)
    from openai import OpenAI
    client = OpenAI(
        api_key=api_key,
        base_url=endpoint
    )
    
    # Set up agents module if available
    try:
        from agents import (
            set_default_openai_client, 
            set_default_openai_api,
            set_tracing_disabled
        )
        set_default_openai_client(client)
        set_default_openai_api('responses')
        set_tracing_disabled(True)
    except ImportError:
        # agents module not available, continue without it
        pass
    
    return client, deployment