from __future__ import annotations

import os

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import asyncpg

from agents import set_default_openai_client, set_tracing_disabled
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, chat, config, files, health, messages, sessions
from api.websocket.manager import WebSocketManager
from core.constants import get_settings
from integrations.mcp_pool import initialize_mcp_pool
from integrations.sdk_token_tracker import patch_sdk_for_auto_tracking
from utils.client_factory import create_http_client, create_openai_client
from utils.logger import logger

# Load environment variables from src/.env at module load time
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(env_path)

settings = get_settings()


def _setup_openai_client() -> None:
    """Configure OpenAI/Azure client and register with agents SDK.

    This mirrors the setup from app/bootstrap.py to ensure the agents SDK
    has access to the correct API credentials.
    """
    if settings.api_provider == "azure":
        api_key = settings.azure_openai_api_key
        endpoint = settings.azure_endpoint_str
        logger.info(f"Configuring Azure OpenAI client (endpoint: {endpoint})")
        http_client = create_http_client(enable_logging=settings.http_request_logging)
        client = create_openai_client(api_key, base_url=endpoint, http_client=http_client)
    else:
        api_key = settings.openai_api_key
        logger.info("Configuring OpenAI client")
        http_client = create_http_client(enable_logging=settings.http_request_logging)
        client = create_openai_client(api_key, http_client=http_client)

    # Register as default client for agents SDK
    set_default_openai_client(client)

    # Disable tracing to avoid 401 errors with Azure
    set_tracing_disabled(True)

    logger.info("OpenAI client registered with agents SDK")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    # Initialize OpenAI client for agents SDK
    _setup_openai_client()

    # Enable SDK-level tool token tracking
    patch_sdk_for_auto_tracking()

    app.state.db_pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
    )

    # Initialize WebSocket manager on app.state for centralized connection tracking
    app.state.ws_manager = WebSocketManager()

    # Initialize MCP server pool on app.state for concurrent request handling
    # Pool pre-spawns server instances to avoid per-request overhead
    pool_size = 3  # Number of instances per server type
    app.state.mcp_pool = await initialize_mcp_pool(pool_size=pool_size)
    logger.info(f"MCP server pool initialized with {pool_size} instances per server type")

    try:
        yield
    finally:
        # Shutdown MCP pool (gracefully closes all pooled servers)
        if app.state.mcp_pool:
            await app.state.mcp_pool.shutdown()
            logger.info("MCP server pool shutdown complete")

        await app.state.db_pool.close()


app = FastAPI(
    title="Chat Juicer API",
    version="1.0.0-local",
    lifespan=lifespan,
)

# CORS for Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(messages.router, prefix="/api/sessions", tags=["messages"])
app.include_router(files.router, prefix="/api/sessions", tags=["files"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(chat.router, prefix="/ws", tags=["websocket"])


if __name__ == "__main__":
    import uvicorn

    # Only watch src/ directory - prevents reload when code interpreter writes to data/
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["src"],
    )
