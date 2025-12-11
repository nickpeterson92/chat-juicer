from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import asyncpg

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, chat, config, files, health, messages, sessions
from core.constants import get_settings
from integrations.mcp_servers import setup_mcp_servers

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    app.state.db_pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
    )

    app.state.mcp_servers = await setup_mcp_servers()

    try:
        yield
    finally:
        if hasattr(app.state, "mcp_servers"):
            for server in app.state.mcp_servers:
                await server.cleanup()
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
