from __future__ import annotations

from typing import Annotated

import asyncpg

from fastapi import Depends, Request

from api.services.file_service import FileService, LocalFileService
from api.services.session_service import SessionService
from api.websocket.manager import WebSocketManager
from core.constants import DATA_FILES_PATH, Settings, get_settings
from integrations.mcp_pool import MCPServerPool


def get_app_settings() -> Settings:
    """Provide application settings via dependency injection.

    This is the recommended way to access settings in route handlers.
    Settings are validated at startup and cached for performance.

    In development with CONFIG_HOT_RELOAD=true, settings are reloaded
    on each request to pick up .env file changes without restart.

    Usage in routes:
        @router.get("/example")
        async def example(settings: AppSettings):
            return {"debug": settings.debug}
    """
    return get_settings()


async def get_db(request: Request) -> asyncpg.Pool:
    """Get database connection pool from application state."""
    return request.app.state.db_pool


def get_file_service(db: Annotated[asyncpg.Pool, Depends(get_db)]) -> FileService:
    """Provide file service (local filesystem for Phase 1)."""
    return LocalFileService(base_path=DATA_FILES_PATH, pool=db)


def get_session_service(db: Annotated[asyncpg.Pool, Depends(get_db)]) -> SessionService:
    """Provide session service backed by PostgreSQL."""
    return SessionService(db)


def get_ws_manager(request: Request) -> WebSocketManager:
    """Get WebSocket manager from application state."""
    return request.app.state.ws_manager


def get_mcp_pool(request: Request) -> MCPServerPool:
    """Get MCP server pool from application state."""
    return request.app.state.mcp_pool


# Type aliases for cleaner route signatures
DB = Annotated[asyncpg.Pool, Depends(get_db)]
Files = Annotated[FileService, Depends(get_file_service)]
Sessions = Annotated[SessionService, Depends(get_session_service)]
WSManager = Annotated[WebSocketManager, Depends(get_ws_manager)]
MCPPool = Annotated[MCPServerPool, Depends(get_mcp_pool)]
AppSettings = Annotated[Settings, Depends(get_app_settings)]
