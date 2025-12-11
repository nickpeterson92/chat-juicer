# Backend Migration Phase 1: Implementation Plan

**Version**: 1.0
**Date**: December 2024
**Duration**: 2 weeks
**Parent Spec**: [BACKEND_CLOUD_MIGRATION_SPEC.md](./BACKEND_CLOUD_MIGRATION_SPEC.md)

---

## Overview

Phase 1 implements a **local FastAPI server** with PostgreSQL, using the **local filesystem** for file storage. No cloud resources required.

### Goals

- [ ] FastAPI server running locally on port 8000
- [ ] PostgreSQL database with full schema
- [ ] All session commands working via REST API
- [ ] Chat streaming working via WebSocket
- [ ] File operations using local filesystem
- [ ] Electron connecting to local FastAPI instead of Python subprocess

### Non-Goals (Phase 2+)

- S3/MinIO integration
- Multi-user authentication (single-user is fine for Phase 1)
- Cloud deployment
- Production hardening

---

## Prerequisites

### Required Tools

```bash
# Python 3.13+
python --version  # Should be 3.13+

# Docker (for PostgreSQL)
docker --version

# Node.js (for Electron)
node --version
```

### New Dependencies

Add to `src/requirements.txt`:

```txt
# API Framework
fastapi>=0.115.0
uvicorn[standard]>=0.32.0

# Database
asyncpg>=0.30.0
alembic>=1.14.0  # Migrations

# Auth (basic for Phase 1)
python-jose[cryptography]>=3.3.0
bcrypt>=4.2.0
passlib[bcrypt]>=1.7.4

# Existing deps still needed
pydantic>=2.0
pydantic-settings>=2.0
openai-agents>=0.0.5
# ... keep existing
```

---

## Project Structure

### New Directory Layout

```
src/
├── api/                          # NEW: FastAPI application
│   ├── __init__.py
│   ├── main.py                   # FastAPI app entry point
│   ├── dependencies.py           # Dependency injection
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py              # Basic auth (single-user for Phase 1, JWT)
│   │   ├── sessions.py          # Session CRUD
│   │   ├── messages.py          # Message history
│   │   ├── files.py             # File operations
│   │   ├── chat.py              # WebSocket streaming
│   │   ├── config.py            # Model/MCP configuration
│   │   └── health.py            # Health checks
│   ├── services/
│   │   ├── __init__.py
│   │   ├── session_service.py   # Session business logic
│   │   ├── message_service.py   # Message persistence
│   │   ├── file_service.py      # Local file operations (FileServiceProtocol)
│   │   ├── file_context.py      # SessionFileContext (local cache wrapper)
│   │   ├── chat_service.py      # Chat orchestration
│   │   └── postgres_session.py  # PostgreSQL session adapter
│   └── websocket/
│       ├── __init__.py
│       └── manager.py           # WebSocket connection manager
├── app/                          # KEEP: Reuse bootstrap logic
├── core/                         # KEEP: Reuse prompts, constants
├── integrations/                 # KEEP: Reuse MCP integration
├── models/                       # KEEP + EXTEND: Add API models
├── tools/                        # KEEP: Reuse existing tools
└── utils/                        # KEEP: Reuse logger, token utils
```

---

## Week 1: FastAPI Foundation

### Day 1: Project Setup

#### Task 1.1: Create API Directory Structure

```bash
mkdir -p src/api/{routes,services,websocket}
touch src/api/__init__.py
touch src/api/main.py
touch src/api/dependencies.py
touch src/api/routes/{__init__,auth,sessions,messages,files,chat,config,health}.py
touch src/api/services/{__init__,session_service,message_service,file_service,chat_service,postgres_session}.py
touch src/api/websocket/{__init__,manager}.py
```

#### Task 1.2: Create FastAPI Main App

```python
# src/api/main.py
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, sessions, messages, files, chat, config, health
from core.constants import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    # Startup
    app.state.db_pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
    )

    # Initialize MCP servers
    from integrations.mcp_servers import initialize_mcp_servers
    app.state.mcp_servers = await initialize_mcp_servers()

    yield

    # Shutdown
    if hasattr(app.state, 'mcp_servers'):
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
    allow_origins=["*"],  # Allow Electron app://. origin
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
```

#### Task 1.3: Create Dependencies

```python
# src/api/dependencies.py
from __future__ import annotations

from typing import Annotated, AsyncGenerator

import asyncpg
from fastapi import Depends, Request

from api.services.file_service import FileServiceProtocol, LocalFileService
from api.middleware.auth import get_current_user_from_token
from api.services.session_service import SessionService


async def get_db(request: Request) -> asyncpg.Pool:
    """Get database connection pool."""
    return request.app.state.db_pool


async def get_mcp_servers(request: Request) -> list:
    """Get MCP server instances."""
    return getattr(request.app.state, 'mcp_servers', [])


def get_file_service() -> FileServiceProtocol:
    """Get file service (local filesystem for Phase 1)."""
    return LocalFileService()


async def get_session_service(
    db: Annotated[asyncpg.Pool, Depends(get_db)],
) -> SessionService:
    """Get session service."""
    return SessionService(db)


# Type aliases for cleaner route signatures
DB = Annotated[asyncpg.Pool, Depends(get_db)]
MCPServers = Annotated[list, Depends(get_mcp_servers)]
Files = Annotated[FileService, Depends(get_file_service)]
Sessions = Annotated[SessionService, Depends(get_session_service)]
```

#### Task 1.4: Create Docker Compose for PostgreSQL

```yaml
# docker-compose.local.yml
services:
  postgres:
    image: postgres:16
    container_name: chatjuicer-postgres
    environment:
      POSTGRES_USER: chatjuicer
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: chatjuicer
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./migrations/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatjuicer"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

#### Task 1.5: Create Database Schema

Use Alembic as source of truth (no init.sql mount):

```bash
# From repo root
docker-compose -f docker-compose.local.yml up -d

# Apply migrations (empty DB)
export DATABASE_URL=postgresql://chatjuicer:localdev@127.0.0.1:5433/chatjuicer
PYTHONPATH=src ./.juicer/bin/alembic upgrade head
```

> If you ever bring back `migrations/init.sql` via docker-entrypoint mounting, the schema will already exist; in that case use `alembic stamp head` instead of `upgrade head` to mark the revision without DDL.

#### Task 1.6: Update Settings

```python
# src/core/constants.py - Add new settings

# Add to existing Settings class:
class Settings(BaseSettings):
    # ... existing settings ...

    # Database (Phase 1: local PostgreSQL)
    database_url: str = "postgresql://chatjuicer:localdev@localhost:5432/chatjuicer"

    # File storage (Phase 1: local)
    file_storage: str = "local"
    file_storage_path: str = "data/files"

    # API settings
    api_port: int = 8000
    api_host: str = "0.0.0.0"

    # Phase 1: Simple auth (single user)
    default_user_email: str = "local@chatjuicer.dev"
    allow_localhost_noauth: bool = True  # Dev toggle to allow REST/WS without auth on localhost

# .env.local (append)
# Auth dev toggle (Phase 1 convenience; disable in Phase 3)
# ALLOW_LOCALHOST_NOAUTH=true
```

#### Checkpoint 1.1: Verify Setup

```bash
# Start PostgreSQL
docker-compose -f docker-compose.local.yml up -d

# Verify database
docker exec -it chatjuicer-postgres psql -U chatjuicer -c '\dt'

# Should show: users, sessions, messages, llm_context, files

# Start FastAPI (should start without errors)
cd src && uvicorn api.main:app --reload --port 8000

# Test health endpoint
curl http://localhost:8000/api/health
# Expected: {"status": "healthy"}
```

#### Task 1.7: Initialize Alembic (to avoid schema drift)

```bash
cd src
alembic init migrations

# Edit alembic.ini to point to settings.database_url (or set env var)
# Edit migrations/env.py to use asyncpg + metadata if desired; for now keep offline/online scripts simple.

# Generate initial migration from init.sql state
alembic revision -m "init schema" --autogenerate

# Apply
alembic upgrade head
```

> Phase 1 still ships `migrations/init.sql` for docker-compose bootstrap, but Alembic is the source of truth going forward; keep both in sync.

---

### Day 2: Auth + Health + Config Routes

#### Task 2.0: Auth Routes (Phase 1-friendly, ready for multi-user)

```python
# src/api/routes/auth.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from api.dependencies import get_db
from api.services.auth_service import AuthService
from api.middleware.auth import get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db = Depends(get_db)) -> TokenResponse:
    """Login and issue tokens (Phase 1: seeded user)."""
    auth = AuthService(db)
    try:
        result = await auth.login(body.email, body.password)
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db = Depends(get_db)) -> TokenResponse:
    """Refresh access token."""
    auth = AuthService(db)
    try:
        access = await auth.refresh(body.refresh_token)
        return TokenResponse(access_token=access, refresh_token=body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me")
async def me(user = Depends(get_current_user)) -> dict:
    """Get current user (requires valid access token)."""
    return user
```

> Env toggle for Phase 1: add `ALLOW_LOCALHOST_NOAUTH=true` to permit unauthenticated localhost calls; keep the middleware in place so turning this off is zero-code later.

#### Task 2.1: Health Route

```python
# src/api/routes/health.py
from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import DB

router = APIRouter()


@router.get("/health")
async def health_check(db: DB) -> dict:
    """Health check endpoint."""
    # Check database connection
    try:
        async with db.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {e}"

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "database": db_status,
        "version": "1.0.0-local",
    }
```

#### Task 2.2: Config Route

```python
# src/api/routes/config.py
from __future__ import annotations

from fastapi import APIRouter

from core.constants import (
    MODEL_METADATA,
    REASONING_EFFORT_OPTIONS,
    SUPPORTED_MODELS,
    MODELS_WITH_REASONING,
)

router = APIRouter()


@router.get("/config")
async def get_config() -> dict:
    """Get application configuration."""
    return {
        "models": [
            {
                "id": model_id,
                "name": MODEL_METADATA.get(model_id, {}).get("name", model_id),
                "provider": MODEL_METADATA.get(model_id, {}).get("provider", "openai"),
                "context_window": MODEL_METADATA.get(model_id, {}).get("context_window", 128000),
                "supports_reasoning": model_id in MODELS_WITH_REASONING,
            }
            for model_id in SUPPORTED_MODELS
        ],
        "reasoning_efforts": REASONING_EFFORT_OPTIONS,
        "mcp_servers": ["sequential-thinking", "fetch"],  # Available MCP servers
        "max_file_size": 50 * 1024 * 1024,  # 50MB
    }
```

#### Checkpoint 2.1: Test Config

```bash
curl http://localhost:8000/api/config | jq
# Should return models, reasoning_efforts, etc.
```

---

### Day 3-4: Session Service + Routes

#### Task 3.1: PostgreSQL Session Adapter

```python
# src/api/services/postgres_session.py
from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg


class PostgresSession:
    """PostgreSQL-backed session for OpenAI Agents SDK.

    Drop-in replacement for SQLiteSession interface.
    """

    def __init__(self, session_id: str, session_uuid: UUID, pool: asyncpg.Pool):
        self.session_id = session_id
        self.session_uuid = session_uuid
        self.pool = pool

    async def get_items(self) -> list[dict[str, Any]]:
        """Retrieve LLM context items."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT role, content, metadata
                FROM llm_context
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                self.session_uuid
            )
            return [
                {
                    "role": row["role"],
                    "content": row["content"],
                    **(row["metadata"] or {}),
                }
                for row in rows
            ]

    async def add_items(self, items: list[dict[str, Any]]) -> None:
        """Add items to LLM context."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for item in items:
                    role = item.get("role")
                    content = item.get("content")
                    metadata = {k: v for k, v in item.items() if k not in ("role", "content")}

                    await conn.execute(
                        """
                        INSERT INTO llm_context (session_id, role, content, metadata)
                        VALUES ($1, $2, $3, $4)
                        """,
                        self.session_uuid,
                        role,
                        content if isinstance(content, str) else json.dumps(content),
                        json.dumps(metadata) if metadata else None
                    )

    async def clear_session(self) -> None:
        """Clear all LLM context."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM llm_context WHERE session_id = $1",
                self.session_uuid
            )
```

#### Task 3.2: Session Service

```python
# src/api/services/session_service.py
from __future__ import annotations

import json
import secrets
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from core.constants import DEFAULT_MODEL


class SessionService:
    """Session business logic."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    def _generate_session_id(self) -> str:
        """Generate unique session ID."""
        return f"chat_{secrets.token_hex(4)}"

    async def create_session(
        self,
        user_id: UUID,
        title: str | None = None,
        model: str | None = None,
        mcp_config: list[str] | None = None,
        reasoning_effort: str | None = None,
    ) -> dict[str, Any]:
        """Create a new session."""
        session_id = self._generate_session_id()

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO sessions (
                    user_id, session_id, title, model, mcp_config, reasoning_effort
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                user_id,
                session_id,
                title,
                model or DEFAULT_MODEL,
                json.dumps(mcp_config or ["sequential-thinking", "fetch"]),
                reasoning_effort or "medium",
            )
            return self._row_to_session(row)

    async def get_session(self, user_id: UUID, session_id: str) -> dict[str, Any] | None:
        """Get session by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM sessions
                WHERE user_id = $1 AND session_id = $2
                """,
                user_id,
                session_id,
            )
            if not row:
                return None
            return self._row_to_session(row)

    async def get_session_with_history(
        self,
        user_id: UUID,
        session_id: str,
        message_limit: int = 50,
    ) -> dict[str, Any] | None:
        """Get session with full history for UI."""
        session = await self.get_session(user_id, session_id)
        if not session:
            return None

        async with self.pool.acquire() as conn:
            # Get messages (Layer 2)
            message_rows = await conn.fetch(
                """
                SELECT * FROM messages
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                session["id"],
                message_limit,
            )

            # Get files
            file_rows = await conn.fetch(
                """
                SELECT * FROM files
                WHERE session_id = $1
                ORDER BY uploaded_at DESC
                """,
                session["id"],
            )

            # Get total message count
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM messages WHERE session_id = $1",
                session["id"],
            )

        messages = [self._row_to_message(r) for r in reversed(message_rows)]
        files = [self._row_to_file(r) for r in file_rows]

        return {
            "session": session,
            "full_history": messages,
            "files": files,
            "has_more": total > message_limit,
            "loaded_count": len(messages),
            "message_count": total,
        }

    async def list_sessions(
        self,
        user_id: UUID,
        offset: int = 0,
        limit: int = 50,
    ) -> dict[str, Any]:
        """List all sessions for user."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM sessions
                WHERE user_id = $1
                ORDER BY pinned DESC, last_used_at DESC
                LIMIT $2 OFFSET $3
                """,
                user_id,
                limit,
                offset,
            )

            total = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1",
                user_id,
            )

        sessions = [self._row_to_session(r) for r in rows]

        return {
            "sessions": sessions,
            "total_count": total,
            "has_more": offset + len(sessions) < total,
        }

    async def update_session(
        self,
        user_id: UUID,
        session_id: str,
        **updates,
    ) -> dict[str, Any] | None:
        """Update session fields."""
        # Build dynamic update query
        set_clauses = []
        values = [user_id, session_id]
        idx = 3

        allowed_fields = ["title", "pinned", "model", "reasoning_effort", "mcp_config", "is_named"]

        for field, value in updates.items():
            if field in allowed_fields and value is not None:
                if field == "mcp_config":
                    value = json.dumps(value)
                set_clauses.append(f"{field} = ${idx}")
                values.append(value)
                idx += 1

        if not set_clauses:
            return await self.get_session(user_id, session_id)

        set_clauses.append(f"last_used_at = ${idx}")
        values.append(datetime.utcnow())

        query = f"""
            UPDATE sessions
            SET {', '.join(set_clauses)}
            WHERE user_id = $1 AND session_id = $2
            RETURNING *
        """

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, *values)
            if not row:
                return None
            return self._row_to_session(row)

    async def delete_session(self, user_id: UUID, session_id: str) -> bool:
        """Delete session and all related data."""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM sessions
                WHERE user_id = $1 AND session_id = $2
                """,
                user_id,
                session_id,
            )
            return result == "DELETE 1"

    async def clear_session(self, user_id: UUID, session_id: str) -> bool:
        """Clear session history (both layers)."""
        session = await self.get_session(user_id, session_id)
        if not session:
            return False

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "DELETE FROM messages WHERE session_id = $1",
                    session["id"],
                )
                await conn.execute(
                    "DELETE FROM llm_context WHERE session_id = $1",
                    session["id"],
                )
                await conn.execute(
                    """
                    UPDATE sessions
                    SET message_count = 0, total_tokens = 0
                    WHERE id = $1
                    """,
                    session["id"],
                )
        return True

    def _row_to_session(self, row: asyncpg.Record) -> dict[str, Any]:
        """Convert database row to session dict."""
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "title": row["title"],
            "model": row["model"],
            "reasoning_effort": row["reasoning_effort"],
            "mcp_config": json.loads(row["mcp_config"]) if row["mcp_config"] else [],
            "pinned": row["pinned"],
            "is_named": row["is_named"],
            "message_count": row["message_count"],
            "total_tokens": row["total_tokens"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
        }

    def _row_to_message(self, row: asyncpg.Record) -> dict[str, Any]:
        """Convert database row to message dict."""
        msg = {
            "id": str(row["id"]),
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        if row["tool_call_id"]:
            msg["tool_call_id"] = row["tool_call_id"]
            msg["tool_name"] = row["tool_name"]
            msg["tool_arguments"] = row["tool_arguments"]
            msg["tool_result"] = row["tool_result"]
            msg["tool_success"] = row["tool_success"]
        return msg

    def _row_to_file(self, row: asyncpg.Record) -> dict[str, Any]:
        """Convert database row to file dict."""
        return {
            "id": str(row["id"]),
            "name": row["filename"],
            "type": "file",
            "size": row["size_bytes"],
            "folder": row["folder"],
            "uploaded_at": row["uploaded_at"].isoformat() if row["uploaded_at"] else None,
        }
```

#### Task 3.3: Session Routes

```python
# src/api/routes/sessions.py
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.dependencies import DB, Sessions
from core.constants import settings

router = APIRouter()


# Request/Response models
class CreateSessionRequest(BaseModel):
    title: str | None = None
    model: str | None = None
    mcp_config: list[str] | None = None
    reasoning_effort: str | None = None


class UpdateSessionRequest(BaseModel):
    title: str | None = None
    pinned: bool | None = None
    model: str | None = None
    mcp_config: list[str] | None = None
    reasoning_effort: str | None = None


# Phase 1: Single user - get user ID from default user
async def get_default_user_id(db) -> UUID:
    """Get default user ID for Phase 1 (single user mode)."""
    async with db.acquire() as conn:
        user_id = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1",
            settings.default_user_email,
        )
        if not user_id:
            raise HTTPException(status_code=500, detail="Default user not found")
        return user_id


@router.get("")
async def list_sessions(
    db: DB,
    sessions: Sessions,
    offset: int = 0,
    limit: int = 50,
) -> dict[str, Any]:
    """List all sessions."""
    user_id = await get_default_user_id(db)
    return await sessions.list_sessions(user_id, offset, limit)


@router.post("")
async def create_session(
    request: CreateSessionRequest,
    db: DB,
    sessions: Sessions,
) -> dict[str, Any]:
    """Create a new session."""
    user_id = await get_default_user_id(db)
    return await sessions.create_session(
        user_id=user_id,
        title=request.title,
        model=request.model,
        mcp_config=request.mcp_config,
        reasoning_effort=request.reasoning_effort,
    )


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    db: DB,
    sessions: Sessions,
) -> dict[str, Any]:
    """Get session with history."""
    user_id = await get_default_user_id(db)
    result = await sessions.get_session_with_history(user_id, session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    db: DB,
    sessions: Sessions,
) -> dict[str, Any]:
    """Update session."""
    user_id = await get_default_user_id(db)
    result = await sessions.update_session(
        user_id=user_id,
        session_id=session_id,
        **request.model_dump(exclude_none=True),
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: DB,
    sessions: Sessions,
) -> dict[str, bool]:
    """Delete session."""
    user_id = await get_default_user_id(db)
    success = await sessions.delete_session(user_id, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


@router.post("/{session_id}/clear")
async def clear_session(
    session_id: str,
    db: DB,
    sessions: Sessions,
) -> dict[str, bool]:
    """Clear session history."""
    user_id = await get_default_user_id(db)
    success = await sessions.clear_session(user_id, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}
```

#### Checkpoint 3.1: Test Sessions API

```bash
# Create session
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Session"}' | jq

# List sessions
curl http://localhost:8000/api/sessions | jq

# Get session with history
curl http://localhost:8000/api/sessions/chat_XXXXXXXX | jq

# Update session
curl -X PATCH http://localhost:8000/api/sessions/chat_XXXXXXXX \
  -H "Content-Type: application/json" \
  -d '{"pinned": true}' | jq

# Delete session
curl -X DELETE http://localhost:8000/api/sessions/chat_XXXXXXXX | jq
```

---

### Day 5: File Service + Routes

#### Task 5.1: Local File Service

```python
# src/api/services/file_service.py
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Protocol
from uuid import UUID

import asyncpg


class FileService(Protocol):
    """Abstract file service protocol."""

    async def list_files(self, session_uuid: UUID, folder: str) -> list[dict[str, Any]]: ...
    async def save_file(self, session_uuid: UUID, folder: str, filename: str, content: bytes) -> dict[str, Any]: ...
    async def get_file_content(self, session_uuid: UUID, folder: str, filename: str) -> bytes: ...
    async def delete_file(self, session_uuid: UUID, folder: str, filename: str) -> bool: ...
    def get_file_path(self, session_id: str, folder: str, filename: str) -> Path: ...


class LocalFileService:
    """Phase 1: Local filesystem storage."""

    def __init__(self, base_path: Path | None = None, pool: asyncpg.Pool | None = None):
        self.base_path = base_path or Path("data/files")
        self.pool = pool

    def _get_dir(self, session_id: str, folder: str) -> Path:
        """Get directory path for session folder."""
        return self.base_path / session_id / folder

    def get_file_path(self, session_id: str, folder: str, filename: str) -> Path:
        """Get full file path."""
        return self._get_dir(session_id, folder) / filename

    async def list_files(self, session_id: str, folder: str) -> list[dict[str, Any]]:
        """List files in session folder."""
        dir_path = self._get_dir(session_id, folder)

        if not dir_path.exists():
            return []

        files = []
        for entry in dir_path.iterdir():
            if entry.is_file() and not entry.name.startswith('.'):
                stat = entry.stat()
                files.append({
                    "name": entry.name,
                    "type": "file",
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
            elif entry.is_dir():
                # Count items in subdirectory
                try:
                    count = len(list(entry.iterdir()))
                except:
                    count = 0
                files.append({
                    "name": entry.name,
                    "type": "folder",
                    "size": 0,
                    "file_count": count,
                })

        # Sort: folders first, then files
        files.sort(key=lambda f: (f["type"] != "folder", f["name"].lower()))
        return files

    async def save_file(
        self,
        session_id: str,
        folder: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        """Save file to local filesystem."""
        dir_path = self._get_dir(session_id, folder)
        dir_path.mkdir(parents=True, exist_ok=True)

        file_path = dir_path / filename
        file_path.write_bytes(content)

        return {
            "name": filename,
            "type": "file",
            "size": len(content),
            "modified": datetime.now().isoformat(),
        }

    async def get_file_content(self, session_id: str, folder: str, filename: str) -> bytes:
        """Get file content."""
        file_path = self.get_file_path(session_id, folder, filename)

        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {filename}")

        return file_path.read_bytes()

    async def delete_file(self, session_id: str, folder: str, filename: str) -> bool:
        """Delete file."""
        file_path = self.get_file_path(session_id, folder, filename)

        if not file_path.exists():
            return False

        file_path.unlink()
        return True
```

#### Task 5.2: File Routes

```python
# src/api/routes/files.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from api.dependencies import DB, Files, Sessions

router = APIRouter()


class UploadConfirmRequest(BaseModel):
    filename: str
    content_type: str | None = None
    size: int


@router.get("/{session_id}/files")
async def list_files(
    session_id: str,
    folder: str = "sources",
    db: DB = None,
    sessions: Sessions = None,
    files: Files = None,
) -> dict[str, Any]:
    """List files in session folder."""
    file_list = await files.list_files(session_id, folder)
    return {"files": file_list}


@router.post("/{session_id}/files/upload")
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    folder: str = "sources",
    files: Files = None,
) -> dict[str, Any]:
    """Upload file directly (Phase 1 - local storage)."""
    content = await file.read()

    result = await files.save_file(
        session_id=session_id,
        folder=folder,
        filename=file.filename,
        content=content,
        content_type=file.content_type,
    )

    return result


@router.get("/{session_id}/files/{filename}/download")
async def download_file(
    session_id: str,
    filename: str,
    folder: str = "sources",
    files: Files = None,
):
    """Get file content for download."""
    from fastapi.responses import Response

    try:
        content = await files.get_file_content(session_id, folder, filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

    # Guess content type
    import mimetypes
    content_type, _ = mimetypes.guess_type(filename)

    return Response(
        content=content,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{session_id}/files/{filename}/path")
async def get_file_path(
    session_id: str,
    filename: str,
    folder: str = "sources",
    files: Files = None,
) -> dict[str, str]:
    """Get local file path (Phase 1 - for shell.openPath)."""
    path = files.get_file_path(session_id, folder, filename)

    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return {"path": str(path.absolute())}


@router.delete("/{session_id}/files/{filename}")
async def delete_file(
    session_id: str,
    filename: str,
    folder: str = "sources",
    files: Files = None,
) -> dict[str, bool]:
    """Delete file."""
    success = await files.delete_file(session_id, folder, filename)

    if not success:
        raise HTTPException(status_code=404, detail="File not found")

    return {"success": True}
```

#### Checkpoint 5.1: Test Files API

```bash
# List files (empty initially)
curl "http://localhost:8000/api/sessions/chat_XXXXXXXX/files?folder=sources" | jq

# Upload file
curl -X POST "http://localhost:8000/api/sessions/chat_XXXXXXXX/files/upload?folder=sources" \
  -F "file=@test.txt" | jq

# Get file path (for shell.openPath)
curl "http://localhost:8000/api/sessions/chat_XXXXXXXX/files/test.txt/path?folder=sources" | jq

# Delete file
curl -X DELETE "http://localhost:8000/api/sessions/chat_XXXXXXXX/files/test.txt?folder=sources" | jq
```

---

## Week 2: WebSocket + Electron Integration

### Day 1-2: WebSocket Streaming

#### Task 6.1: WebSocket Manager

```python
# src/api/websocket/manager.py
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    """Manages WebSocket connections."""

    def __init__(self):
        # session_id -> set of WebSockets
        self.connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Register a WebSocket connection."""
        await websocket.accept()

        async with self._lock:
            if session_id not in self.connections:
                self.connections[session_id] = set()
            self.connections[session_id].add(websocket)

    async def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            if session_id in self.connections:
                self.connections[session_id].discard(websocket)
                if not self.connections[session_id]:
                    del self.connections[session_id]

    async def send(self, session_id: str, message: dict[str, Any]) -> None:
        """Send message to all connections for a session."""
        websockets = self.connections.get(session_id, set())

        for ws in list(websockets):
            try:
                await ws.send_json(message)
            except Exception:
                # Connection closed, will be cleaned up
                await self.disconnect(ws, session_id)


# Global instance
ws_manager = WebSocketManager()
```

#### Task 6.2: Chat Route with Streaming

```python
# src/api/routes/chat.py
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.websockets import WebSocketState
from api.middleware.auth import get_current_user_from_token

from api.dependencies import get_db, get_mcp_servers
from api.websocket.manager import ws_manager
from api.services.chat_service import ChatService
from api.services.file_service import LocalFileService
from api.middleware.auth import get_current_user_from_token

router = APIRouter()


async def get_current_user_from_query_token(token: str, db) -> dict:
    """Helper for WS query param token (reuses auth middleware helper)."""
    return await get_current_user_from_token(token, db)


@router.websocket("/chat/{session_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
):
    """WebSocket endpoint for chat streaming."""
    # Lightweight auth: optional token for Phase 1, aligns with JWT later
    db = websocket.app.state.db_pool
    mcp_servers = getattr(websocket.app.state, 'mcp_servers', [])

    # Validate token if provided (Phase 1: allow none for localhost via env toggle)
    user = None
    if token:
        try:
            user = await get_current_user_from_query_token(token, db)
        except Exception:
            await websocket.close(code=4401)
            return

    # Connect
    await ws_manager.connect(websocket, session_id)

    # Create chat service
    chat_service = ChatService(db, mcp_servers, ws_manager, file_service=LocalFileService())

    try:
        # Keepalive task
        async def keepalive():
            while True:
                await asyncio.sleep(30)
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    break

        keepalive_task = asyncio.create_task(keepalive())

        try:
            async for data in websocket.iter_json():
                await handle_message(data, session_id, chat_service)
        finally:
            keepalive_task.cancel()

    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket, session_id)


async def handle_message(
    data: dict[str, Any],
    session_id: str,
    chat_service: ChatService,
) -> None:
    """Handle incoming WebSocket message."""
    msg_type = data.get("type")

    if msg_type == "message":
        messages = data.get("messages", [])
        model = data.get("model")
        reasoning_effort = data.get("reasoning_effort")

        await chat_service.process_chat(
            session_id=session_id,
            messages=messages,
            model=model,
            reasoning_effort=reasoning_effort,
        )

    elif msg_type == "interrupt":
        await chat_service.interrupt(session_id)

    elif msg_type == "pong":
        pass  # Keepalive response, ignore
```

#### Task 6.3: Chat Service (Port from runtime.py)

```python
# src/api/services/chat_service.py
from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

import asyncpg
from agents import Agent, Runner

from api.services.postgres_session import PostgresSession
from api.services.file_context import session_file_context
from api.services.file_service import FileServiceProtocol
from api.websocket.manager import WebSocketManager
from core.agent import create_agent
from core.prompts import get_system_prompt
from integrations.event_handlers import StreamingEventHandler
from tools.wrappers import create_session_aware_tools
from utils.logger import logger


class ChatService:
    """Chat orchestration service."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        mcp_servers: list,
        ws_manager: WebSocketManager,
        file_service: FileServiceProtocol,
    ):
        self.pool = pool
        self.mcp_servers = mcp_servers
        self.ws_manager = ws_manager
        self.file_service = file_service
        self._active_tasks: dict[str, asyncio.Task] = {}

    async def process_chat(
        self,
        session_id: str,
        messages: list[dict[str, Any]],
        model: str | None = None,
        reasoning_effort: str | None = None,
    ) -> None:
        """Process chat messages and stream response."""

        # Get session from database
        async with self.pool.acquire() as conn:
            session_row = await conn.fetchrow(
                "SELECT * FROM sessions WHERE session_id = $1",
                session_id,
            )
            if not session_row:
                await self.ws_manager.send(session_id, {
                    "type": "error",
                    "message": "Session not found",
                })
                return

        session_uuid = session_row["id"]
        model = model or session_row["model"]

        # Create session adapter for Agent SDK
        session = PostgresSession(session_id, session_uuid, self.pool)

        # Session file context (local in Phase 1; S3 later)
        async with session_file_context(
            file_service=self.file_service,
            session_id=session_id,
            user_id=session_row["user_id"],
            reasoning_effort=reasoning_effort or session_row["reasoning_effort"],
        ) as file_ctx:
            # Create tools bound to the context base path
            tools = create_session_aware_tools(file_ctx)

            # Create agent
            agent = create_agent(
                model=model,
                tools=tools,
                mcp_servers=self.mcp_servers,
                reasoning_effort=reasoning_effort or session_row["reasoning_effort"],
            )

            # Send stream start
            await self.ws_manager.send(session_id, {
                "type": "stream_start",
                "session_id": session_id,
            })

            try:
                # Add user messages to session
                for msg in messages:
                    content = msg.get("content", msg) if isinstance(msg, dict) else msg
                    await session.add_items([{"role": "user", "content": content}])

                    # Also add to Layer 2 (full history)
                    await self._add_to_full_history(session_uuid, "user", content)

                # Run agent with streaming
                await self._run_agent_stream(agent, session, session_id, session_uuid)

                # Send stream end
                await self.ws_manager.send(session_id, {
                    "type": "stream_end",
                    "finish_reason": "stop",
                })

            except asyncio.CancelledError:
                await self.ws_manager.send(session_id, {
                    "type": "stream_end",
                    "finish_reason": "interrupted",
                })
            except Exception as e:
                logger.error(f"Chat error: {e}", exc_info=True)
                await self.ws_manager.send(session_id, {
                    "type": "error",
                    "message": str(e),
                    "retryable": True,
                })

    async def _run_agent_stream(
        self,
        agent: Agent,
        session: PostgresSession,
        session_id: str,
        session_uuid: UUID,
    ) -> None:
        """Run agent and stream events."""
        accumulated_text = ""

        async with Runner.run_streamed(
            agent,
            input=await session.get_items(),
        ) as stream:
            async for event in stream.stream_events():
                # Handle different event types
                event_type = event.type

                if event_type == "raw_response_event":
                    # Text delta + reasoning delta
                    if hasattr(event.data, "delta"):
                        delta = event.data.delta
                        if hasattr(delta, "content") and delta.content:
                            accumulated_text += delta.content
                            await self.ws_manager.send(session_id, {
                                "type": "delta",
                                "content": delta.content,
                            })
                        if hasattr(delta, "reasoning") and delta.reasoning:
                            await self.ws_manager.send(session_id, {
                                "type": "reasoning_delta",
                                "content": delta.reasoning,
                            })

                elif event_type == "tool_call_item":
                    # Tool call detected
                    await self.ws_manager.send(session_id, {
                        "type": "tool_call",
                        "id": event.item.call_id,
                        "name": event.item.name,
                        "arguments": event.item.arguments,
                        "status": "detected",
                    })
                    # Tool call args delta (partial)
                    if getattr(event.item, "arguments_delta", None):
                        await self.ws_manager.send(session_id, {
                            "type": "tool_call_arguments_delta",
                            "id": event.item.call_id,
                            "delta": event.item.arguments_delta,
                        })

                elif event_type == "tool_output_item":
                    # Tool result
                    await self.ws_manager.send(session_id, {
                        "type": "tool_call",
                        "id": event.item.call_id,
                        "name": event.item.name,
                        "result": event.item.output,
                        "status": "completed",
                        "success": not event.item.error,
                    })

        # Save assistant response to both layers
        if accumulated_text:
            await session.add_items([{"role": "assistant", "content": accumulated_text}])
            await self._add_to_full_history(session_uuid, "assistant", accumulated_text)

    async def _add_to_full_history(
        self,
        session_uuid: UUID,
        role: str,
        content: str,
    ) -> None:
        """Add message to Layer 2 (full history)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO messages (session_id, role, content)
                VALUES ($1, $2, $3)
                """,
                session_uuid,
                role,
                content,
            )
            # Update message count
            await conn.execute(
                """
                UPDATE sessions
                SET message_count = message_count + 1, last_used_at = NOW()
                WHERE id = $1
                """,
                session_uuid,
            )

    async def interrupt(self, session_id: str) -> None:
        """Interrupt active chat processing."""
        task = self._active_tasks.get(session_id)
        if task and not task.done():
            task.cancel()
```

---

### Day 3-4: Electron Client Updates

#### Task 7.1: Update electron/main.js

See the spec document Section 2 for the full code changes. Key modifications:

1. Remove Python subprocess spawning
2. Add WebSocket client for chat
3. Add HTTP client for REST API
4. Update IPC handlers to call API

#### Task 7.2: Create API Client Helper

```javascript
// electron/api-client.js
const WebSocket = require('ws');

const API_BASE = process.env.API_URL || 'http://localhost:8000';

let wsConnection = null;

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.detail || 'API request failed');
  }

  return response.json();
}

function connectWebSocket(sessionId, onMessage) {
  if (wsConnection) {
    wsConnection.close();
  }

  const wsUrl = `${API_BASE.replace('http', 'ws')}/ws/chat/${sessionId}`;
  wsConnection = new WebSocket(wsUrl);

  wsConnection.onmessage = (event) => {
    const message = JSON.parse(event.data);
    onMessage(message);
  };

  wsConnection.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return wsConnection;
}

function sendWebSocketMessage(message) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify(message));
  }
}

module.exports = {
  apiRequest,
  connectWebSocket,
  sendWebSocketMessage,
  API_BASE,
};
```

---

### Day 5: Integration Testing

#### Checkpoint: Full End-to-End Test

```bash
# 1. Start PostgreSQL
docker-compose -f docker-compose.local.yml up -d

# 2. Start FastAPI
cd src && uvicorn api.main:app --reload --port 8000

# 3. Start Electron (in another terminal)
npm run dev

# 4. Test flow:
# - App should connect to localhost:8000
# - Create new session
# - Send message
# - See streaming response
# - View chat history
# - Upload file
# - Delete session
```

---

## Testing Checklist

### API Tests

- [ ] `GET /api/health` returns healthy status
- [ ] `GET /api/config` returns models and settings
- [ ] `POST /api/sessions` creates session
- [ ] `GET /api/sessions` lists sessions
- [ ] `GET /api/sessions/{id}` returns session with history
- [ ] `PATCH /api/sessions/{id}` updates session
- [ ] `DELETE /api/sessions/{id}` deletes session
- [ ] `POST /api/sessions/{id}/clear` clears history
- [ ] `GET /api/sessions/{id}/files` lists files
- [ ] `POST /api/sessions/{id}/files/upload` uploads file
- [ ] `DELETE /api/sessions/{id}/files/{name}` deletes file

### WebSocket Tests

- [ ] Connect to `/ws/chat/{session_id}`
- [ ] Send `{ type: "message", messages: [...] }`
- [ ] Receive `stream_start` event
- [ ] Receive `delta` events with content
- [ ] Receive `stream_end` event
- [ ] Send `{ type: "interrupt" }` stops stream

### Electron Integration Tests

- [ ] App starts without Python subprocess
- [ ] Creates session via API
- [ ] Sends message via WebSocket
- [ ] Displays streaming response
- [ ] Shows chat history on session switch
- [ ] File upload works
- [ ] File panel displays files

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs chatjuicer-postgres

# Connect manually
docker exec -it chatjuicer-postgres psql -U chatjuicer
```

### FastAPI Won't Start

```bash
# Check for import errors
cd src && python -c "from api.main import app"

# Run with verbose logging
uvicorn api.main:app --reload --port 8000 --log-level debug
```

### WebSocket Connection Fails

```bash
# Test with wscat
npm install -g wscat
wscat -c ws://localhost:8000/ws/chat/chat_test123
```

---

## Success Criteria

Phase 1 is complete when:

1. ✅ FastAPI server runs locally without errors
2. ✅ All session CRUD operations work via REST
3. ✅ Chat streaming works via WebSocket
4. ✅ Files can be uploaded/listed/deleted via API
5. ✅ Electron connects to local FastAPI
6. ✅ All existing functionality works (feature parity)

---

## Next Steps (Phase 2)

After Phase 1 is stable:

1. Add MinIO to docker-compose
2. Create S3FileService implementation
3. Switch to S3 with `FILE_STORAGE=s3`
4. Test presigned URL flow

---

*End of Phase 1 Implementation Plan*

