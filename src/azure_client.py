"""
Azure OpenAI client setup and configuration.
Handles all Azure-specific initialization and client management.
"""
import os

from dotenv import load_dotenv
from openai import OpenAI

# Optional agents helpers
try:
    from agents import (
        set_default_openai_api,
        set_default_openai_client,
        set_tracing_disabled,
    )
except ImportError:  # agents module not available
    set_default_openai_api = None  # type: ignore
    set_default_openai_client = None  # type: ignore
    set_tracing_disabled = None  # type: ignore


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
            "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be set",
        )

    # Initialize Azure OpenAI client (using base OpenAI client for Responses API)
    client = OpenAI(
        api_key=api_key,
        base_url=endpoint,
    )

    # Set up agents module if available
    if set_default_openai_client and set_default_openai_api and set_tracing_disabled:
        set_default_openai_client(client)
        set_default_openai_api("responses")
        set_tracing_disabled(True)

    return client, deployment
