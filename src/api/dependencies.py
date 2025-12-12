from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

import asyncpg

from fastapi import Depends, Request

from api.services.file_service import FileService, LocalFileService
from api.services.session_service import SessionService

# Project root is parent of src/
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_FILES_PATH = PROJECT_ROOT / "data" / "files"


async def get_db(request: Request) -> asyncpg.Pool:
    """Get database connection pool from application state."""
    return request.app.state.db_pool


async def get_mcp_servers(request: Request) -> dict[str, Any]:
    """Get MCP server instances from application state (dict by server key)."""
    return getattr(request.app.state, "mcp_servers", {})


def get_file_service(db: Annotated[asyncpg.Pool, Depends(get_db)]) -> FileService:
    """Provide file service (local filesystem for Phase 1)."""
    return LocalFileService(base_path=DATA_FILES_PATH, pool=db)


def get_session_service(db: Annotated[asyncpg.Pool, Depends(get_db)]) -> SessionService:
    """Provide session service backed by PostgreSQL."""
    return SessionService(db)


# Type aliases for cleaner route signatures
DB = Annotated[asyncpg.Pool, Depends(get_db)]
MCPServers = Annotated[dict[str, Any], Depends(get_mcp_servers)]
Files = Annotated[FileService, Depends(get_file_service)]
Sessions = Annotated[SessionService, Depends(get_session_service)]
