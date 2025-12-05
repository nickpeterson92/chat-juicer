"""Application initialization and configuration for Chat Juicer.

This module handles all bootstrap operations required before entering the main
event loop: environment loading, settings validation, client creation, MCP
server initialization, and session manager setup.
"""

from __future__ import annotations

import os
import sys

from agents import set_default_openai_client, set_tracing_disabled
from dotenv import load_dotenv

from app.state import AppState
from core.agent import create_agent
from core.constants import CHAT_HISTORY_DB_PATH, DEFAULT_MODEL, DEFAULT_SESSION_METADATA_PATH, get_settings
from core.full_history import FullHistoryStore
from core.prompts import SYSTEM_INSTRUCTIONS
from core.session_manager import SessionManager
from integrations.mcp_registry import initialize_all_mcp_servers
from integrations.sdk_token_tracker import patch_sdk_for_auto_tracking
from tools import AGENT_TOOLS
from utils.client_factory import create_http_client, create_openai_client
from utils.logger import logger


async def initialize_application() -> AppState:
    """Initialize Chat Juicer application and return populated state.

    This function performs all bootstrap operations required before entering
    the main event loop:
    0. Increase file descriptor limit (prevent file handle exhaustion)
    1. Load environment variables and validate configuration
    2. Create OpenAI client (Azure or OpenAI provider)
    3. Configure Agent/Runner framework defaults
    4. Initialize MCP servers (global pool)
    5. Create initial agent with all tools and MCP servers
    6. Set up persistence layers (full history store, session manager)
    7. Validate session integrity and cleanup empty sessions

    Returns:
        AppState: Fully initialized application state ready for main loop

    Raises:
        SystemExit: If configuration validation fails (prints helpful error message)
    """
    # Increase file descriptor limit early to prevent "Too many open files" errors
    try:
        import resource

        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        # Try to increase to 4096 (or max allowed by system)
        new_limit = min(4096, hard)
        resource.setrlimit(resource.RLIMIT_NOFILE, (new_limit, hard))
        logger.info(f"File descriptor limit increased: {soft} → {new_limit}")
    except Exception as e:
        # Windows doesn't support resource module, or permission issue - continue anyway
        logger.warning(f"Could not increase file descriptor limit: {e}")

    # Load environment variables from src/.env
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    load_dotenv(env_path)

    # Load and validate settings at startup
    try:
        settings = get_settings()

        # Configure client based on API provider
        if settings.api_provider == "azure":
            # Azure OpenAI configuration
            api_key = settings.azure_openai_api_key
            endpoint = settings.azure_endpoint_str
            deployment = DEFAULT_MODEL  # Use default, sessions will override per-session

            logger.info(f"Settings loaded successfully for Azure (default deployment: {deployment})")

            http_client = create_http_client(enable_logging=settings.http_request_logging)
            if http_client:
                logger.info("HTTP request/response logging enabled")
            client = create_openai_client(api_key, base_url=endpoint, http_client=http_client)

        elif settings.api_provider == "openai":
            # Base OpenAI configuration
            api_key = settings.openai_api_key
            deployment = settings.openai_model

            logger.info(f"Settings loaded successfully for OpenAI model: {deployment}")

            http_client = create_http_client(enable_logging=settings.http_request_logging)
            if http_client:
                logger.info("HTTP request/response logging enabled")
            client = create_openai_client(api_key, http_client=http_client)

        else:
            raise ValueError(f"Unknown API provider: {settings.api_provider}")

    except Exception as e:
        # Use stderr for error messages (stdout is reserved for binary protocol)
        sys.stderr.write(f"Error: Configuration validation failed: {e}\n")
        sys.stderr.write("Please check your .env file has required variables:\n")
        # Try to access settings, but if it's undefined, show default Azure instructions
        try:
            if settings.api_provider == "openai":
                sys.stderr.write("API_PROVIDER=openai\n")
                sys.stderr.write("OPENAI_API_KEY\n")
                sys.stderr.write("OPENAI_MODEL\n")
            else:
                sys.stderr.write("API_PROVIDER=azure (default)\n")
                sys.stderr.write("AZURE_OPENAI_API_KEY\n")
                sys.stderr.write("AZURE_OPENAI_ENDPOINT\n")
                sys.stderr.write("AZURE_OPENAI_DEPLOYMENT\n")
        except (NameError, UnboundLocalError):
            # If settings is not defined, show default Azure instructions
            sys.stderr.write("API_PROVIDER=azure (default)\n")
            sys.stderr.write("AZURE_OPENAI_API_KEY\n")
            sys.stderr.write("AZURE_OPENAI_ENDPOINT\n")
            sys.stderr.write("AZURE_OPENAI_DEPLOYMENT\n")
        sys.exit(1)

    # Set as default client for Agent/Runner
    set_default_openai_client(client)

    # Disable tracing to avoid 401 errors with Azure
    set_tracing_disabled(True)

    # Enable SDK-level automatic token tracking
    if patch_sdk_for_auto_tracking():
        logger.info("SDK-level token tracking enabled")
    else:
        logger.warning("SDK-level token tracking not available, using manual tracking")

    # Set up MCP servers (initialize all available servers into a global pool)
    mcp_servers_dict = await initialize_all_mcp_servers()

    # Create initial agent with all MCP servers for global context
    all_mcp_servers = list(mcp_servers_dict.values())
    agent = create_agent(deployment, SYSTEM_INSTRUCTIONS, AGENT_TOOLS, all_mcp_servers)

    # Display connection info based on provider (use stderr for status messages)
    if settings.api_provider == "azure":
        sys.stderr.write("Connected to Azure OpenAI\n")
        sys.stderr.write(f"Using deployment: {deployment}\n")
    else:
        sys.stderr.write("Connected to OpenAI\n")
        sys.stderr.write(f"Using model: {deployment}\n")

    if mcp_servers_dict:
        server_names = ", ".join(mcp_servers_dict.keys())
        sys.stderr.write(f"MCP Servers: {server_names}\n")

    # Initialize full history store for layered persistence
    full_history_store = FullHistoryStore(db_path=CHAT_HISTORY_DB_PATH)
    logger.info("Full history store initialized")

    # Initialize session manager
    session_manager = SessionManager(metadata_path=DEFAULT_SESSION_METADATA_PATH)
    logger.info("Session manager initialized")

    # CRITICAL: Sync metadata with database BEFORE cleanup to prevent desync bugs
    # This fixes any stale metadata from previous sessions before deletion logic runs
    synced_count = session_manager.sync_metadata_with_database()
    if synced_count > 0:
        logger.info(f"Startup sync: updated {synced_count} sessions with correct message counts")

    # Cleanup empty sessions on startup (prevent orphaned sessions from file uploads)
    deleted_count = session_manager.cleanup_empty_sessions(max_age_hours=24)
    if deleted_count > 0:
        logger.info(f"Startup cleanup: removed {deleted_count} empty sessions")

    # LAZY INITIALIZATION: No session created on startup
    # Session will be created on first user message or when switching to existing session
    logger.info("App initialized - session will be created on first message")

    # Return populated application state
    return AppState(
        session_manager=session_manager,
        current_session=None,  # Lazy initialization
        agent=agent,
        deployment=deployment,
        full_history_store=full_history_store,
        mcp_servers=mcp_servers_dict,
    )
