from __future__ import annotations

import asyncio

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from agents import set_default_openai_client, set_tracing_disabled
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.middleware.exception_handlers import register_exception_handlers
from api.middleware.rate_limiter import RateLimitMiddleware, get_rate_limiter
from api.middleware.request_context import RequestContextMiddleware
from api.middleware.request_limits import RequestSizeLimitMiddleware
from api.middleware.security_headers import SecurityHeadersMiddleware
from api.routes import chat
from api.routes.v1 import router as v1_router
from api.websocket.manager import WebSocketManager
from core.constants import get_settings
from integrations.mcp_manager import initialize_mcp_manager
from integrations.sdk_token_tracker import patch_sdk_for_auto_tracking
from utils.client_factory import create_http_client, create_openai_client
from utils.db_utils import check_pool_health, create_database_pool, graceful_pool_close
from utils.logger import configure_uvicorn_logging, logger

# Settings are loaded via Pydantic Settings with environment-specific file support
# (.env, .env.{APP_ENV}, .env.local) - no manual dotenv loading needed
settings = get_settings()

# Log loaded settings in debug mode
if settings.debug:
    from core.constants import _get_env_files

    logger.info(f"Env files: {[f.name for f in _get_env_files()]}")
    logger.info(
        f"Settings: app_env={settings.app_env}, " f"db_pool=[{settings.db_pool_min_size},{settings.db_pool_max_size}]"
    )

# Configure uvicorn logging at module level to ensure workers use it
configure_uvicorn_logging()


def _setup_openai_client() -> None:
    """Configure OpenAI/Azure client and register with agents SDK.

    This mirrors the setup from app/bootstrap.py to ensure the agents SDK
    has access to the correct API credentials.
    """
    if settings.api_provider == "azure":
        api_key = settings.azure_openai_api_key
        endpoint = settings.azure_endpoint_str
        logger.info(f"Configuring Azure OpenAI client (endpoint: {endpoint})")
        http_client = create_http_client(
            enable_logging=settings.http_request_logging,
            read_timeout=settings.http_read_timeout,
        )
        client = create_openai_client(api_key, base_url=endpoint, http_client=http_client)
    else:
        api_key = settings.openai_api_key
        logger.info("Configuring OpenAI client")
        http_client = create_http_client(
            enable_logging=settings.http_request_logging,
            read_timeout=settings.http_read_timeout,
        )
        client = create_openai_client(api_key, http_client=http_client)

    # Register as default client for agents SDK
    set_default_openai_client(client)

    # Disable tracing to avoid 401 errors with Azure
    set_tracing_disabled(True)

    logger.info("OpenAI client registered with agents SDK")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown with graceful handling."""
    # Track shutdown state
    shutdown_event = asyncio.Event()
    app.state.shutdown_event = shutdown_event
    app.state.background_tasks = set()

    # Initialize OpenAI client for agents SDK
    _setup_openai_client()

    # Enable SDK-level tool token tracking
    patch_sdk_for_auto_tracking()

    # Create database pool with production configuration
    app.state.db_pool = await create_database_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        command_timeout=settings.db_command_timeout,
        connection_timeout=settings.db_connection_timeout,
        statement_cache_size=settings.db_statement_cache_size,
        max_inactive_connection_lifetime=settings.db_max_inactive_connection_lifetime,
    )

    # Verify database connectivity
    health = await check_pool_health(app.state.db_pool)
    if not health["healthy"]:
        logger.error("Database health check failed during startup")
        raise RuntimeError("Database connection failed")
    logger.info(f"Database pool healthy: {health}")

    # Create S3 sync service if S3 storage is enabled
    s3_sync = None
    if settings.file_storage == "s3":
        from api.services.s3_sync_service import S3SyncService
        from core.constants import DATA_FILES_PATH

        s3_sync = S3SyncService(
            settings=settings,
            local_base_path=DATA_FILES_PATH,
        )
        # Ensure bucket exists on startup (best effort)
        try:
            await s3_sync.ensure_bucket_exists()
            logger.info(f"S3 sync enabled (bucket: {settings.s3_bucket})")
        except Exception as e:
            logger.error(f"Failed to initialize S3 bucket: {e}. S3 sync may not work.")

    # Store S3 sync service in app state for access elsewhere
    app.state.s3_sync = s3_sync

    # Create cleanup callback for S3 mode
    def on_session_disconnect(session_id: str) -> None:
        logger.info(f"Cleanup callback triggered for session {session_id}")
        if s3_sync:
            # Run cleanup in background task to avoid blocking the event loop
            # cleanup_session_files does blocking I/O (shutil.rmtree)
            async def _cleanup() -> None:
                try:
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, s3_sync.cleanup_session_files, session_id)
                except Exception as e:
                    logger.error(f"Background cleanup failed for session {session_id}: {e}")
                finally:
                    # Note: 'task' is captured by closure - Python late binding means
                    # it's resolved at runtime when finally executes, not at definition
                    app.state.background_tasks.discard(task)

            task = asyncio.create_task(_cleanup())
            app.state.background_tasks.add(task)

    # Initialize WebSocket manager with connection limits
    app.state.ws_manager = WebSocketManager(
        idle_timeout_seconds=settings.ws_idle_timeout,
        max_connections=settings.ws_max_connections,
        max_connections_per_session=settings.ws_max_connections_per_session,
        on_session_disconnect=on_session_disconnect if s3_sync else None,
    )
    await app.state.ws_manager.start_idle_checker()

    # Initialize MCP server manager
    app.state.mcp_manager = await initialize_mcp_manager(
        acquire_timeout=settings.mcp_acquire_timeout,
    )

    # Initialize sandbox pool
    from tools.code_interpreter import get_sandbox_pool

    pool = get_sandbox_pool(pool_size=settings.sandbox_pool_size)
    await pool.initialize()
    app.state.sandbox_pool = pool

    # Start rate limiter cleanup task
    rate_limiter = get_rate_limiter()
    await rate_limiter.start()
    app.state.rate_limiter = rate_limiter

    try:
        yield
    finally:
        logger.info("Initiating graceful shutdown sequence")

        # Signal shutdown to any waiting tasks
        shutdown_event.set()

        # Phase 1: Stop accepting new WebSocket connections and drain existing
        if app.state.ws_manager:
            await app.state.ws_manager.graceful_shutdown(timeout=settings.shutdown_connection_drain_timeout)

        # Phase 2: Shutdown MCP server manager
        if hasattr(app.state, "mcp_manager") and app.state.mcp_manager:
            await app.state.mcp_manager.shutdown()
            logger.info("MCP server manager shutdown complete")

        # Phase 3: Shutdown Sandbox pool
        if hasattr(app.state, "sandbox_pool") and app.state.sandbox_pool:
            await app.state.sandbox_pool.shutdown()
            logger.info("Sandbox pool shutdown complete")

        # Phase 4: Stop rate limiter cleanup task
        if hasattr(app.state, "rate_limiter") and app.state.rate_limiter:
            await app.state.rate_limiter.stop()
            logger.info("Rate limiter shutdown complete")

        # Phase 5: Gracefully close database pool
        await graceful_pool_close(app.state.db_pool, timeout=settings.shutdown_timeout)


app = FastAPI(
    title="Chat Juicer API",
    description="""
## Chat Juicer API

Production-grade chat interface for Azure OpenAI with Agent/Runner pattern
and native MCP (Model Context Protocol) server support.

### Features
- **Session Management**: Create, update, and delete chat sessions
- **Real-time Chat**: WebSocket streaming with tool execution
- **File Management**: Upload and manage session files
- **Token Tracking**: Automatic context management with summarization
- **MCP Integration**: Sequential Thinking, Fetch, and optional Tavily

### Authentication
All endpoints except health checks require authentication via JWT Bearer token.
Use `/api/v1/auth/login` to obtain tokens.

### Versioning
API uses URL path versioning: `/api/v1/...`
Breaking changes will increment the version number.
""",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {
            "name": "Health",
            "description": "Health check endpoints for monitoring and orchestration",
        },
        {
            "name": "Authentication",
            "description": "Login, token refresh, and user management",
        },
        {
            "name": "Sessions",
            "description": "Chat session CRUD operations",
        },
        {
            "name": "Messages",
            "description": "Message history and pagination",
        },
        {
            "name": "Files",
            "description": "File upload, download, and management",
        },
        {
            "name": "Configuration",
            "description": "Application configuration and metadata",
        },
        {
            "name": "WebSocket",
            "description": "Real-time chat streaming",
        },
    ],
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
)

# Register global exception handlers for consistent error responses
register_exception_handlers(app)

# Request context middleware (adds request ID tracking)
# Note: Middleware is executed in reverse order of registration
app.add_middleware(RequestContextMiddleware)

# CORS configuration (uses Settings for origin control)
# Production: Set CORS_ALLOW_ORIGINS to explicit list of allowed domains
# Development: Can use "*" for convenience, but not in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_methods_list,
    allow_headers=settings.cors_headers_list,
)

# Security middleware stack (executed in reverse order of registration)
# Last added = first executed
# 1. Rate limiter (check limits first)
# 2. Request size limits (validate body size)
# 3. Security headers (add to all responses)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(RateLimitMiddleware)

# Routes - API v1
app.include_router(v1_router, prefix="/api/v1")

# WebSocket routes (not versioned - protocol-level)
app.include_router(chat.router, prefix="/ws", tags=["WebSocket"])


if __name__ == "__main__":
    import uvicorn

    # Only watch src/ directory - prevents reload when code interpreter writes to data/
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["src"],
        log_config=None,
    )
