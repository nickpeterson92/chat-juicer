# Chat Juicer Web Migration Implementation Spec

**Version**: 1.1
**Date**: December 2024
**Status**: Draft
**Prerequisite**: [ELECTRON_REACT_REFACTOR_SPEC.md](./ELECTRON_REACT_REFACTOR_SPEC.md) (Phase 0)

---

## Executive Summary

This specification outlines the **cloud deployment** of Chat Juicer—migrating from a local Electron + Python desktop application to a web application with a cloud-hosted backend.

> **Note**: This spec assumes the Electron React Refactor (Phase 0) is complete. See [ELECTRON_REACT_REFACTOR_SPEC.md](./ELECTRON_REACT_REFACTOR_SPEC.md) for frontend migration details.

### Migration Phases

| Phase | Description | Scope |
|-------|-------------|-------|
| **Phase 0** | Electron React Refactor | Frontend only (see [separate spec](./ELECTRON_REACT_REFACTOR_SPEC.md)) |
| **Phase 1** | Backend to Cloud | FastAPI, PostgreSQL, S3, Auth |
| **Phase 2** | Web Frontend Deploy | Same React app, web adapter, CDN |
| **Phase 3** | Production Hardening | LTS for both Electron and Web |

**Dual-Platform LTS**: Both Electron and Web are first-class, long-term supported platforms sharing the same React codebase.

The initial deployment targets a single t3.xlarge instance supporting 2,000-5,000 users, with architecture decisions that enable future horizontal scaling and multi-provider LLM support.

### Key Principles

1. **Prerequisite**: React refactor complete before backend migration
2. **Preserve Core Logic**: Reuse existing Agent/Runner, tools, and session management
3. **Single Backend**: Both Electron and Web use the same FastAPI cloud backend
4. **Design for Evolution**: Architecture supports future Redis, multi-instance, and multi-provider additions
5. **Incremental Risk**: Change one layer at a time (frontend done, now backend)

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Component Migration Map](#3-component-migration-map)
4. [API Design](#4-api-design)
5. [Data Layer](#5-data-layer)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [File Handling](#7-file-handling)
8. [Real-Time Communication](#8-real-time-communication)
9. [Infrastructure](#9-infrastructure)
10. [Migration Phases](#10-migration-phases)
11. [Dual-Platform Architecture](#11-dual-platform-architecture)
12. [Future Evolution Paths](#12-future-evolution-paths)
13. [Risk Assessment](#13-risk-assessment)
14. [Success Metrics](#14-success-metrics)

---

## 1. Current Architecture Analysis

### 1.1 Desktop Application Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                       │
│  • Spawns Python subprocess                                     │
│  • Binary IPC (MessagePack) over stdin/stdout                   │
│  • File system access (dialog, shell)                           │
│  • Window management                                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ IPC Protocol V2 (Binary)
┌─────────────────────────────▼───────────────────────────────────┐
│                     PYTHON BACKEND                              │
│  • Agent/Runner pattern (OpenAI Agents SDK)                     │
│  • MCP Servers (Sequential Thinking, Fetch, Tavily)             │
│  • TokenAwareSQLiteSession (dual-layer persistence)             │
│  • Native tools (file ops, document generation)                 │
│  • Session management with auto-summarization                   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     LOCAL STORAGE                               │
│  • SQLite: data/chat_history.db                                 │
│  • JSON: data/sessions.json                                     │
│  • Files: data/files/{session_id}/sources/                      │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components to Preserve

| Component | Location | Reusability |
|-----------|----------|-------------|
| Agent/Runner streaming | `src/app/runtime.py` | **High** - Core logic unchanged |
| Session management | `src/core/session.py` | **High** - Swap storage adapter |
| Token tracking | `src/core/session.py` | **High** - Logic unchanged |
| Tools | `src/tools/*.py` | **Medium** - Update file paths |
| MCP integration | `src/integrations/mcp_*.py` | **High** - Unchanged |
| Event handlers | `src/integrations/event_handlers.py` | **High** - Unchanged |
| Pydantic models | `src/models/*.py` | **High** - Add new API models |

### 1.3 Components Requiring Replacement

| Component | Current | Web Replacement |
|-----------|---------|-----------------|
| IPC transport | Binary stdin/stdout | WebSocket + REST |
| Session storage | SQLite file | PostgreSQL |
| File storage | Local filesystem | S3-compatible storage |
| Authentication | None (single user) | JWT + OAuth |
| Process management | Electron spawns Python | FastAPI server |

---

## 2. Target Architecture

### 2.1 Phase 1: Single Instance (Initial Deployment)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE                               │
│              (DDoS protection, SSL termination, CDN)            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      t3.xlarge (16GB RAM, 4 vCPU)               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    FASTAPI APPLICATION                     │ │
│  │                                                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │ REST Routes │  │  WebSocket  │  │  Background Tasks   │ │ │
│  │  │ /api/*      │  │  /ws/chat/* │  │  (title gen, etc)   │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  │                          │                                 │ │
│  │  ┌───────────────────────▼───────────────────────────────┐ │ │
│  │  │              PROVIDER LAYER (OpenAI Only)             │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌──────────────────────────────────────────────────┐ │ │ │
│  │  │  │           OpenAI Provider Adapter                │ │ │ │
│  │  │  │  • Wraps existing Agent/Runner logic             │ │ │ │
│  │  │  │  • Emits UnifiedEvent stream                     │ │ │ │
│  │  │  └──────────────────────────────────────────────────┘ │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  │                          │                                 │ │
│  │  ┌───────────────────────▼───────────────────────────────┐ │ │
│  │  │                   CORE SERVICES                       │ │ │
│  │  │  • SessionService (PostgreSQL-backed)                 │ │ │
│  │  │  • FileService (S3-backed)                            │ │ │
│  │  │  • ToolRegistry (existing tools + wrappers)           │ │ │
│  │  │  • MCPRegistry (existing MCP integration)             │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                           │                               │  │
│  │  ┌────────────────┐  ┌────▼─────────┐  ┌───────────────┐  │  │
│  │  │   PostgreSQL   │  │    Redis     │  │  Local Disk   │  │  │
│  │  │   (RDS or      │  │  (optional   │  │  (temp files, │  │  │
│  │  │    local)      │  │   Phase 1)   │  │   file cache) │  │  │
│  │  └────────────────┘  └──────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼───────┐   ┌───────▼───────┐
            │  Azure OpenAI │   │      S3       │
            │     API       │   │   (files)     │
            └───────────────┘   └───────────────┘
```

### 2.2 Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Web framework | FastAPI | Async-native, WebSocket support, Pydantic integration |
| Database | PostgreSQL | Production-ready, JSON support, scales well |
| File storage | S3-compatible | Decouples storage, enables CDN, scales infinitely |
| Auth | JWT + OAuth2 | Stateless, standard, works with any IdP |
| Real-time | WebSocket | Bidirectional, efficient for streaming |
| Process model | Uvicorn + 4 workers | Utilizes all CPU cores |

---

## 3. Component Migration Map

### 3.1 Backend Migration

```
CURRENT (src/)                          TARGET (src/api/)
──────────────────────────────────────────────────────────────────
main.py (IPC loop)            →         main.py (FastAPI app)
app/bootstrap.py              →         app/bootstrap.py (modified)
app/runtime.py                →         services/chat_service.py
app/state.py                  →         app/state.py (add user context)

core/session.py               →         core/postgres_session.py
core/session_manager.py       →         services/session_service.py
core/agent.py                 →         providers/openai_provider.py
core/prompts.py               →         core/prompts.py (unchanged)
core/constants.py             →         core/constants.py (+ new)

tools/*.py                    →         tools/*.py (update paths)
integrations/mcp_*.py         →         integrations/mcp_*.py (unchanged)
models/*.py                   →         models/*.py (+ api_models.py)
utils/*.py                    →         utils/*.py (- ipc.py, + http)
```

### 3.2 Frontend Migration

```
CURRENT (electron/renderer/)            TARGET (web/src/)
──────────────────────────────────────────────────────────────────
adapters/ipc-adapter.js       →         adapters/websocket-adapter.js
adapters/storage-adapter.js   →         adapters/api-adapter.js
core/state.js                 →         stores/app-store.js (Zustand)
core/event-bus.js             →         core/event-bus.js (unchanged)

ui/components/*.js            →         components/*.jsx (React)
services/*.js                 →         services/*.js (fetch-based)
handlers/*.js                 →         hooks/useChat.js (React hooks)

bootstrap.js                  →         App.jsx (React lifecycle)
```

### 3.3 New Components Required

```
src/api/
├── routes/
│   ├── auth.py              # Login, logout, token refresh
│   ├── sessions.py          # Session CRUD
│   ├── messages.py          # Message history
│   ├── files.py             # File upload/download
│   ├── chat.py              # WebSocket streaming
│   └── health.py            # Health checks
├── middleware/
│   ├── auth.py              # JWT validation
│   ├── rate_limit.py        # In-memory rate limiting
│   └── cors.py              # CORS configuration
├── providers/
│   ├── base.py              # LLMProvider protocol
│   ├── openai_provider.py   # OpenAI adapter
│   └── registry.py          # Provider registry
└── services/
    ├── session_service.py   # Session business logic
    ├── file_service.py      # S3 operations
    └── chat_service.py      # Chat orchestration
```

---

## 4. API Design

### 4.1 REST Endpoints

#### Authentication

```yaml
POST /api/auth/login
  Request:  { email: string, password: string }
  Response: { access_token: string, refresh_token: string, user: User }

POST /api/auth/refresh
  Request:  { refresh_token: string }
  Response: { access_token: string }

POST /api/auth/logout
  Request:  { refresh_token: string }
  Response: { success: boolean }

GET /api/auth/me
  Response: User
```

#### Sessions

```yaml
GET /api/sessions
  Query:    ?limit=50&cursor=<id>
  Response: { sessions: Session[], next_cursor: string | null }

POST /api/sessions
  Request:  { title?: string, model?: string, mcp_config?: string[] }
  Response: Session

GET /api/sessions/{session_id}
  Response: Session

PATCH /api/sessions/{session_id}
  Request:  { title?: string, pinned?: boolean, model?: string }
  Response: Session

DELETE /api/sessions/{session_id}
  Response: { success: boolean }
```

#### Messages

```yaml
GET /api/sessions/{session_id}/messages
  Query:    ?limit=50&before=<message_id>
  Response: { messages: Message[], has_more: boolean }

# Note: Creating messages happens via WebSocket, not REST
```

#### Files

```yaml
GET /api/sessions/{session_id}/files
  Response: { files: FileInfo[] }

POST /api/sessions/{session_id}/files/upload-url
  Request:  { filename: string, content_type: string, size: number }
  Response: { upload_url: string, file_key: string }

POST /api/sessions/{session_id}/files/confirm
  Request:  { file_key: string }
  Response: FileInfo

DELETE /api/sessions/{session_id}/files/{file_id}
  Response: { success: boolean }

GET /api/sessions/{session_id}/files/{file_id}/download-url
  Response: { download_url: string }
```

#### Configuration

```yaml
GET /api/config
  Response: {
    models: ModelConfig[],
    reasoning_efforts: string[],
    mcp_servers: MCPServerConfig[],
    max_file_size: number
  }
```

### 4.2 WebSocket Protocol

#### Connection

```
WSS /ws/chat/{session_id}
  Headers: Authorization: Bearer <token>
```

#### Client → Server Messages

```typescript
// Send chat message(s)
{
  type: "message",
  messages: [{ content: string }],
  model?: string,
  reasoning_effort?: string
}

// Interrupt streaming
{
  type: "interrupt"
}

// Ping (keepalive)
{
  type: "ping"
}
```

#### Server → Client Messages (Unified Events)

```typescript
// Streaming text delta
{
  type: "delta",
  content: string
}

// Tool call lifecycle
{
  type: "tool_call",
  id: string,
  name: string,
  arguments: object,
  status: "detected" | "executing" | "completed",
  result?: string,
  success?: boolean
}

// Token usage update
{
  type: "usage",
  input_tokens: number,
  output_tokens: number,
  total_tokens: number,
  context_tokens: number,
  threshold_tokens: number
}

// Stream lifecycle
{
  type: "stream_start",
  session_id: string
}

{
  type: "stream_end",
  finish_reason: "stop" | "tool_use" | "interrupted" | "error"
}

// Errors
{
  type: "error",
  message: string,
  code?: string,
  retryable: boolean
}

// Session updates (title generated, etc.)
{
  type: "session_updated",
  session: Session
}

// Pong (keepalive response)
{
  type: "pong"
}
```

---

## 5. Data Layer

### 5.1 PostgreSQL Schema

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'::jsonb
);

-- Sessions table (replaces sessions.json)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(20) NOT NULL,  -- Keep existing format: chat_xxxxxxxx
    title VARCHAR(500),
    model VARCHAR(50) DEFAULT 'gpt-5.1',
    reasoning_effort VARCHAR(20) DEFAULT 'medium',
    mcp_config JSONB DEFAULT '["sequential-thinking", "fetch"]'::jsonb,
    pinned BOOLEAN DEFAULT FALSE,
    is_named BOOLEAN DEFAULT FALSE,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    accumulated_tool_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, session_id)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_last_used ON sessions(last_used_at DESC);

-- Messages table (Layer 2: Full History)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- user, assistant, system, tool_call
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Tool call specific fields (when role = 'tool_call')
    tool_call_id VARCHAR(50),
    tool_name VARCHAR(100),
    tool_arguments JSONB,
    tool_result TEXT,
    tool_success BOOLEAN,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_role CHECK (role IN ('user', 'assistant', 'system', 'tool_call'))
);

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(session_id, created_at);

-- LLM Context table (Layer 1: Summarized context for LLM)
-- This mirrors the OpenAI Agents SDK's agent_sessions/agent_messages tables
CREATE TABLE llm_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_context_session_id ON llm_context(session_id);

-- Files table (metadata only - content in S3)
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_session_id ON files(session_id);

-- Refresh tokens (for auth)
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

### 5.2 Session Adapter

Replace `SQLiteSession` with PostgreSQL-backed implementation:

```python
# src/core/postgres_session.py
from typing import Any
from agents import TResponseInputItem
import asyncpg

class PostgresSession:
    """PostgreSQL-backed session compatible with OpenAI Agents SDK.

    Implements the same interface as SQLiteSession for drop-in replacement.
    """

    def __init__(
        self,
        session_id: str,
        session_uuid: UUID,
        pool: asyncpg.Pool,
    ):
        self.session_id = session_id
        self.session_uuid = session_uuid
        self.pool = pool
        self.db_path = "postgres"  # For compatibility checks

    async def get_items(self) -> list[TResponseInputItem]:
        """Retrieve LLM context items from PostgreSQL."""
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
                    **(row["metadata"] or {})
                }
                for row in rows
            ]

    async def add_items(self, items: list[TResponseInputItem]) -> None:
        """Add items to LLM context."""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for item in items:
                    role = item.get("role")
                    content = item.get("content")

                    # Extract metadata (everything except role/content)
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
        """Clear all LLM context (used during summarization)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM llm_context WHERE session_id = $1",
                self.session_uuid
            )


class TokenAwarePostgresSession(PostgresSession):
    """PostgreSQL session with token tracking and summarization.

    Extends PostgresSession with the same functionality as TokenAwareSQLiteSession.
    """

    def __init__(
        self,
        session_id: str,
        session_uuid: UUID,
        pool: asyncpg.Pool,
        full_history_service: "FullHistoryService",
        agent: Agent | None = None,
        model: str = DEFAULT_MODEL,
        threshold: float = 0.8,
    ):
        super().__init__(session_id, session_uuid, pool)
        self.full_history = full_history_service
        self.agent = agent
        self.model = model
        self.threshold = threshold

        # Token tracking (same as SQLite version)
        self.max_tokens = self._get_model_limit(model)
        self.trigger_tokens = int(self.max_tokens * threshold)
        self._total_tokens = 0
        self._accumulated_tool_tokens = 0
        self._item_token_cache: dict[str, int] = {}

        # Persistence state
        self._skip_full_history = False
        self._summarization_lock = asyncio.Lock()

    # ... rest of TokenAwareSQLiteSession methods, unchanged except for storage calls
```

---

## 6. Authentication & Authorization

### 6.1 Auth Flow

```
┌─────────┐          ┌─────────┐          ┌─────────┐
│ Browser │          │ FastAPI │          │   DB    │
└────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │
     │  POST /auth/login  │                    │
     │  {email, password} │                    │
     ├───────────────────►│                    │
     │                    │  Verify password   │
     │                    ├───────────────────►│
     │                    │◄───────────────────┤
     │                    │                    │
     │                    │  Create tokens     │
     │                    ├───────────────────►│
     │                    │◄───────────────────┤
     │                    │                    │
     │  {access_token,    │                    │
     │   refresh_token}   │                    │
     │◄───────────────────┤                    │
     │                    │                    │
     │  GET /api/sessions │                    │
     │  Authorization:    │                    │
     │  Bearer <token>    │                    │
     ├───────────────────►│                    │
     │                    │  Validate JWT      │
     │                    │  Extract user_id   │
     │                    │                    │
     │                    │  Query user's      │
     │                    │  sessions only     │
     │                    ├───────────────────►│
     │                    │◄───────────────────┤
     │  sessions[]        │                    │
     │◄───────────────────┤                    │
```

### 6.2 JWT Structure

```python
# Access token payload (short-lived: 15 minutes)
{
    "sub": "user_uuid",
    "email": "user@example.com",
    "exp": 1234567890,
    "iat": 1234567800,
    "type": "access"
}

# Refresh token payload (long-lived: 7 days)
{
    "sub": "user_uuid",
    "exp": 1234567890,
    "iat": 1234567800,
    "type": "refresh",
    "jti": "unique_token_id"  # For revocation
}
```

### 6.3 Authorization Middleware

```python
# src/api/middleware/auth.py
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: asyncpg.Pool = Depends(get_db),
) -> User:
    """Validate JWT and return current user."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"]
        )

        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id = payload.get("sub")
        user = await db.fetchrow(
            "SELECT * FROM users WHERE id = $1",
            UUID(user_id)
        )

        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return User(**dict(user))

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# All routes use this dependency for user isolation
@router.get("/sessions")
async def list_sessions(user: User = Depends(get_current_user)):
    # user.id is automatically available
    # All queries filter by user.id
    pass
```

---

## 7. File Handling

### 7.1 Upload Flow (Presigned URLs)

```
┌─────────┐          ┌─────────┐          ┌─────────┐
│ Browser │          │ FastAPI │          │   S3    │
└────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │
     │  Request upload URL│                    │
     │  POST /files/      │                    │
     │    upload-url      │                    │
     ├───────────────────►│                    │
     │                    │                    │
     │                    │  Generate presigned│
     │                    │  PUT URL           │
     │                    ├───────────────────►│
     │                    │◄───────────────────┤
     │                    │                    │
     │  {upload_url,      │                    │
     │   file_key}        │                    │
     │◄───────────────────┤                    │
     │                    │                    │
     │  PUT upload_url    │                    │
     │  (file content)    │                    │
     ├────────────────────┼───────────────────►│
     │                    │                    │
     │  200 OK            │                    │
     │◄────────────────────────────────────────┤
     │                    │                    │
     │  Confirm upload    │                    │
     │  POST /files/      │                    │
     │    confirm         │                    │
     ├───────────────────►│                    │
     │                    │  Verify exists     │
     │                    ├───────────────────►│
     │                    │◄───────────────────┤
     │                    │                    │
     │                    │  Save metadata     │
     │                    │  to DB             │
     │                    │                    │
     │  FileInfo          │                    │
     │◄───────────────────┤                    │
```

### 7.2 File Service

```python
# src/services/file_service.py
import boto3
from botocore.config import Config

class FileService:
    """S3-backed file storage service."""

    def __init__(self, settings: Settings):
        self.s3 = boto3.client(
            's3',
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
            config=Config(signature_version='s3v4')
        )
        self.bucket = settings.s3_bucket

    def generate_upload_url(
        self,
        user_id: UUID,
        session_id: str,
        filename: str,
        content_type: str,
    ) -> tuple[str, str]:
        """Generate presigned URL for direct upload to S3."""

        # Sanitize filename
        safe_filename = self._sanitize_filename(filename)

        # Generate unique key
        file_key = f"users/{user_id}/sessions/{session_id}/sources/{safe_filename}"

        # Generate presigned URL (valid for 1 hour)
        upload_url = self.s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': self.bucket,
                'Key': file_key,
                'ContentType': content_type,
            },
            ExpiresIn=3600
        )

        return upload_url, file_key

    def generate_download_url(self, file_key: str) -> str:
        """Generate presigned URL for download."""
        return self.s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket, 'Key': file_key},
            ExpiresIn=3600
        )

    async def get_file_content(self, file_key: str) -> bytes:
        """Download file content (for tool access)."""
        response = self.s3.get_object(Bucket=self.bucket, Key=file_key)
        return response['Body'].read()

    async def delete_file(self, file_key: str) -> None:
        """Delete file from S3."""
        self.s3.delete_object(Bucket=self.bucket, Key=file_key)
```

### 7.3 Tool Integration

Update file tools to use S3:

```python
# src/tools/file_operations.py (modified)

async def read_file(
    file_path: str,
    session_id: str,
    file_service: FileService = Depends(get_file_service),
    db: asyncpg.Pool = Depends(get_db),
) -> str:
    """Read file content from S3-backed storage."""

    # Look up file in database
    file_record = await db.fetchrow(
        """
        SELECT s3_key, content_type FROM files
        WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
        AND filename = $2
        """,
        session_id,
        file_path
    )

    if not file_record:
        return FileReadResponse(
            success=False,
            file_path=file_path,
            error="File not found"
        ).to_json()

    # Download from S3
    content = await file_service.get_file_content(file_record["s3_key"])

    # Process content (conversion, summarization, etc.)
    # ... existing logic ...

    return FileReadResponse(
        success=True,
        content=content.decode('utf-8'),
        file_path=file_path,
        size=len(content)
    ).to_json()
```

---

## 8. Real-Time Communication

### 8.1 WebSocket Manager (Single Instance)

For Phase 1 (single instance), use in-memory connection tracking:

```python
# src/api/websocket_manager.py
from fastapi import WebSocket
from typing import Dict, Set
import asyncio

class WebSocketManager:
    """Manages WebSocket connections for a single instance.

    Note: This implementation is for single-instance deployment.
    For multi-instance, replace with Redis pub/sub (see section 11).
    """

    def __init__(self):
        # session_id -> set of connected WebSockets
        self.connections: Dict[str, Set[WebSocket]] = {}
        # WebSocket -> session_id (reverse lookup for cleanup)
        self.socket_sessions: Dict[WebSocket, str] = {}
        # Lock for thread-safe modifications
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, session_id: str):
        """Register a new WebSocket connection."""
        await websocket.accept()

        async with self._lock:
            if session_id not in self.connections:
                self.connections[session_id] = set()
            self.connections[session_id].add(websocket)
            self.socket_sessions[websocket] = session_id

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            session_id = self.socket_sessions.pop(websocket, None)
            if session_id and session_id in self.connections:
                self.connections[session_id].discard(websocket)
                if not self.connections[session_id]:
                    del self.connections[session_id]

    async def broadcast_to_session(self, session_id: str, message: dict):
        """Send message to all connections for a session."""
        connections = self.connections.get(session_id, set())

        # Send to all connections concurrently
        await asyncio.gather(*[
            self._safe_send(ws, message)
            for ws in connections
        ], return_exceptions=True)

    async def _safe_send(self, websocket: WebSocket, message: dict):
        """Send with error handling."""
        try:
            await websocket.send_json(message)
        except Exception:
            # Connection closed, will be cleaned up
            await self.disconnect(websocket)


# Global instance (single-instance deployment)
ws_manager = WebSocketManager()
```

### 8.2 Chat WebSocket Route

```python
# src/api/routes/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

router = APIRouter()

@router.websocket("/ws/chat/{session_id}")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(...),  # Token via query param for WebSocket
):
    """WebSocket endpoint for real-time chat."""

    # Validate token
    try:
        user = await validate_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Verify session belongs to user
    session = await session_service.get_session(user.id, session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    # Connect
    await ws_manager.connect(websocket, session_id)

    try:
        # Keepalive task
        async def keepalive():
            while True:
                await asyncio.sleep(30)
                await websocket.send_json({"type": "ping"})

        keepalive_task = asyncio.create_task(keepalive())

        try:
            async for message in websocket.iter_json():
                await handle_websocket_message(
                    websocket, session_id, user, message
                )
        finally:
            keepalive_task.cancel()

    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket)


async def handle_websocket_message(
    websocket: WebSocket,
    session_id: str,
    user: User,
    message: dict,
):
    """Handle incoming WebSocket message."""

    msg_type = message.get("type")

    if msg_type == "message":
        # Process chat message
        await process_chat_message(session_id, user, message)

    elif msg_type == "interrupt":
        # Interrupt streaming
        await interrupt_stream(session_id)

    elif msg_type == "pong":
        # Keepalive response, ignore
        pass
```

### 8.3 Stream Processing

```python
# src/services/chat_service.py

async def process_chat_message(
    session_id: str,
    user: User,
    message: dict,
) -> None:
    """Process chat message and stream response."""

    # Get session context
    session_ctx = await get_or_create_session_context(session_id, user.id)

    # Parse message content
    messages = message.get("messages", [])
    model = message.get("model", session_ctx.session.model)

    # Notify stream start
    await ws_manager.broadcast_to_session(session_id, {
        "type": "stream_start",
        "session_id": session_id
    })

    try:
        # Get provider and stream
        provider = provider_registry.get_for_model(model)

        config = ProviderConfig(
            model=model,
            tools=get_tools_for_session(session_id),
            reasoning_effort=message.get("reasoning_effort"),
        )

        # Stream events to all connected clients
        async for event in provider.stream_chat(messages, config):
            await ws_manager.broadcast_to_session(
                session_id,
                event.model_dump()
            )

        # Stream completed
        await ws_manager.broadcast_to_session(session_id, {
            "type": "stream_end",
            "finish_reason": "stop"
        })

    except asyncio.CancelledError:
        await ws_manager.broadcast_to_session(session_id, {
            "type": "stream_end",
            "finish_reason": "interrupted"
        })

    except Exception as e:
        await ws_manager.broadcast_to_session(session_id, {
            "type": "error",
            "message": str(e),
            "retryable": True
        })
```

---

## 9. Infrastructure

### 9.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          AWS REGION                             │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                        VPC                                 │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │               PUBLIC SUBNET                          │  │ │
│  │  │                                                      │  │ │
│  │  │  ┌─────────────────────────────────────────────────┐ │  │ │
│  │  │  │              t3.xlarge                          │ │  │ │
│  │  │  │                                                 │ │  │ │
│  │  │  │  ┌────────────┐     ┌────────────────────────┐  │ │  │ │
│  │  │  │  │   nginx    │────▶│      FastAPI           │  │ │  │ │
│  │  │  │  │  (reverse  │     │  (uvicorn x4 workers)  │  │ │  │ │
│  │  │  │  │   proxy)   │     │                        │  │ │  │ │
│  │  │  │  └────────────┘     └────────────────────────┘  │ │  │ │
│  │  │  │                                                 │ │  │ │
│  │  │  │  ┌────────────────────────────────────────────┐ │ │  │ │
│  │  │  │  │              PostgreSQL 16                 │ │ │  │ │
│  │  │  │  │         (local or RDS connection)          │ │ │  │ │
│  │  │  │  └────────────────────────────────────────────┘ │ │  │ │
│  │  │  │                                                 │ │  │ │
│  │  │  └─────────────────────────────────────────────────┘ │  │ │
│  │  │                         │                            │  │ │
│  │  └─────────────────────────┼────────────────────────────┘  │ │
│  │                            │                               │ │
│  │  ┌─────────────────────────▼────────────────────────────┐  │ │
│  │  │               PRIVATE SUBNET                         │  │ │
│  │  │                                                      │  │ │
│  │  │  ┌─────────────────┐    ┌──────────────────────────┐ │  │ │
│  │  │  │  RDS PostgreSQL │    │      S3 Bucket           │ │  │ │
│  │  │  │  (if managed)   │    │  (file storage)          │ │  │ │
│  │  │  └─────────────────┘    └──────────────────────────┘ │  │ │
│  │  │                                                      │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Docker Configuration

```dockerfile
# Dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```yaml
# docker-compose.yml (Development)
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://chatjuicer:password@postgres:5432/chatjuicer
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - S3_BUCKET=chatjuicer-files
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
    volumes:
      - ./src:/app/src  # Hot reload in dev

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_USER=chatjuicer
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=chatjuicer
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # MinIO for local S3-compatible storage
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  pgdata:
  miniodata:
```

### 9.3 Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chatjuicer

# Azure OpenAI
AZURE_OPENAI_API_KEY=your-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET=chatjuicer-files

# Authentication
JWT_SECRET=your-random-secret-key-min-32-chars
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Optional: Tavily for web search
TAVILY_API_KEY=your-tavily-key

# Application
DEBUG=false
LOG_LEVEL=INFO
CORS_ORIGINS=https://chat.example.com
```

### 9.4 nginx Configuration

```nginx
# /etc/nginx/sites-available/chatjuicer

upstream api {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name chat.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name chat.example.com;

    ssl_certificate /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # WebSocket support
    location /ws/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;  # 24 hours for long-lived connections
    }

    # API routes
    location /api/ {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static frontend (if self-hosted)
    location / {
        root /var/www/chatjuicer;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 10. Migration Phases

This section outlines the **incremental migration strategy** that minimizes risk by changing one layer at a time.

> **Phase 0 (React Refactor)** is covered in [ELECTRON_REACT_REFACTOR_SPEC.md](./ELECTRON_REACT_REFACTOR_SPEC.md).
> This spec covers Phases 1-3 (cloud deployment).

### 10.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│             PHASE 0: REACT REFACTOR (PREREQUISITE)                          │
│             See: ELECTRON_REACT_REFACTOR_SPEC.md                            │
│                                                                             │
│   ┌──────────────┐      stdin/stdout      ┌──────────────┐                  │
│   │   Electron   │◄─────────────────────►│    Python    │                   │
│   │   (React!)   │    (Binary IPC V2)     │   Backend    │                  │
│   └──────────────┘                        └──────────────┘                  │
│         │                                        │                          │
│   React + TypeScript + Zustand                   │                          │
│   Uses: window.electronAPI (IPC adapter)         │                          │
│   Monorepo: packages/app-core + electron-app     │                          │
│         └────────────────────┬───────────────────┘                          │
│                     Local SQLite + Local Files                              │
│                                                                             │
│      COMPLETED BEFORE PROCEEDING                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 1: BACKEND MIGRATION (Weeks 1-4)                         │
│              Electron stays, Python moves to cloud                          │
│                                                                             │
│   ┌──────────────┐      HTTPS / WSS       ┌──────────────┐                  │
│   │   Electron   │◄─────────────────────►│   FastAPI    │                   │
│   │   (React)    │    (WebSocket +        │   Backend    │                  │
│   │              │     REST API)          │   (cloud)    │                  │
│   └──────────────┘                        └──────────────┘                  │
│                                                  │                          │
│   Changes to Electron:                           ├──► PostgreSQL            │
│   • main.ts: Remove Python spawn                 ├──► S3                    │
│   • main.ts: Add HTTP/WebSocket client           └──► Azure OpenAI          │
│   • Swap IPC adapter for Web adapter                                        │
│   • packages/app-core: ZERO CHANGES                                         │
│                                                                             │
│   User experience: UNCHANGED (still Electron app)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 2: WEB FRONTEND (Week 5)                                 │
│              Deploy React to browser, Electron still works                  │
│                                                                             │
│   ┌──────────────┐                        ┌──────────────┐                  │
│   │    React     │      HTTPS / WSS       │   FastAPI    │                  │
│   │   Web App    │◄─────────────────────►│   Backend    │                   │
│   │  (browser)   │                        │   (same!)    │                  │
│   └──────────────┘                        └──────────────┘                  │
│         +                                                                   │
│   ┌──────────────┐                                                          │
│   │   Electron   │  ← Still works, same backend                             │
│   │   (React)    │  ← "Try the new web app!" banner                         │
│   └──────────────┘                                                          │
│                                                                             │
│   SAME packages/app-core code in both!                                      │
│   Only difference: API adapter (IPC vs HTTP)                                │
│   Users can choose: Electron or Web (both work)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 3: DUAL-PLATFORM LTS (Weeks 6-8)                         │
│              Both Electron and Web are first-class platforms                │
│                                                                             │
│   ┌──────────────┐      HTTPS / WSS       ┌──────────────┐                  │
│   │    React     │◄──────────────────────►│   FastAPI    │                  │
│   │   Web App    │                        │   Backend    │                  │
│   │  (browser)   │                        │   (cloud)    │                  │
│   └──────────────┘                        └──────────────┘                  │
│         +                                        ▲                          │
│   ┌──────────────┐                               │                          │
│   │   Electron   │◄──────────────────────────────┘                          │
│   │   (React)    │      HTTPS / WSS (same API!)                             │
│   └──────────────┘                                                          │
│         +                                                                   │
│   ┌──────────────┐                                                          │
│   │     PWA      │  ← Optional: installable for desktop-like experience     │
│   └──────────────┘                                                          │
│                                                                             │
│   SHARED: packages/app-core (React components, hooks, stores)               │
│   SHARED: FastAPI backend (same API for both platforms)                     │
│   SEPARATE: Platform-specific adapters + distribution                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Phase 1: Backend Migration (Weeks 1-4)

**Goal**: Deploy FastAPI backend to cloud. Modify Electron to call API instead of spawning Python. **Zero changes to renderer code.**

#### Week 1: FastAPI Foundation

```
├── Set up FastAPI project structure (src/api/)
├── Implement PostgreSQL connection pool (asyncpg)
├── Create PostgresSession adapter (drop-in for SQLiteSession)
├── Port SessionManager to use PostgreSQL
├── Set up Docker development environment
└── Deliverable: FastAPI server starts, connects to PostgreSQL
```

#### Week 2: Core Endpoints

```
├── Implement WebSocket /ws/chat/{session_id} endpoint
├── Port streaming logic from runtime.py to chat_service.py
├── Create REST endpoints: /api/sessions, /api/messages
├── Set up S3 client and FileService
├── Implement file upload/download with presigned URLs
└── Deliverable: Chat works via WebSocket, files work via S3
```

#### Week 3: Auth & Middleware

```
├── Implement JWT authentication (login, refresh, logout)
├── Create User model and registration flow
├── Add auth middleware to all routes
├── Implement rate limiting middleware
├── Configure CORS for Electron and future web app
└── Deliverable: Secure API with user isolation
```

#### Week 4: Electron Thin Client

```
├── Modify electron/main.js:
│   ├── Remove Python spawn logic
│   ├── Add WebSocket client for chat streaming
│   ├── Add fetch calls for REST endpoints
│   └── Add JWT token storage (electron-store)
├── Modify electron/preload.js:
│   └── Keep same API, change implementation (adapter pattern)
├── Add login window/flow to Electron
├── Test all existing functionality works
└── Deliverable: Electron v2.0 using cloud backend
```

#### Phase 1 Architecture (After Completion)

```
electron/main.js (MODIFIED)
─────────────────────────────────────────────────────
BEFORE:
  pythonProcess = spawn(pythonPath, ["src/main.py"]);
  pythonProcess.stdin.write(binaryMessage);

AFTER:
  // No Python!
  ws = new WebSocket(`wss://api.chatjuicer.com/ws/chat/${sessionId}`);
  ws.send(JSON.stringify({ type: "message", messages }));
─────────────────────────────────────────────────────

electron/preload.js (UNCHANGED API)
─────────────────────────────────────────────────────
// Renderer code calls the SAME methods
// Implementation changes, interface stays stable
contextBridge.exposeInMainWorld("electronAPI", {
  sendUserInput: (messages, sessionId) => {
    // OLD: ipcRenderer.send → main.js → Python stdin
    // NEW: ipcRenderer.send → main.js → WebSocket
    ipcRenderer.send("user-input", { messages, session_id: sessionId });
  },
  // ... rest unchanged
});
─────────────────────────────────────────────────────

electron/renderer/* (ZERO CHANGES)
─────────────────────────────────────────────────────
// All components, services, handlers work exactly as before
// They call window.electronAPI.* which still works
─────────────────────────────────────────────────────
```

#### Phase 1 Deliverables

| Deliverable | Description |
|-------------|-------------|
| FastAPI server | Running on t3.xlarge with PostgreSQL + S3 |
| Electron v2.0 | Calls cloud API instead of spawning Python |
| Database migrations | PostgreSQL schema + seed scripts |
| CI/CD pipeline | Automated backend deployment |
| User accounts | Auth system with JWT |

#### Phase 1 Success Criteria

- [ ] All existing Electron functionality works
- [ ] Users can log in and see their sessions
- [ ] Chat streaming works via WebSocket
- [ ] File upload/download works via S3
- [ ] Multiple users can use the system concurrently
- [ ] Electron users notice no difference (except login)

---

### 10.3 Web Frontend Deployment

> **Frontend architecture, components, and technology stack are defined in [ELECTRON_REACT_REFACTOR_SPEC.md](./ELECTRON_REACT_REFACTOR_SPEC.md)**. This phase assumes React refactor is complete.

The web deployment is a **lift-and-shift** of the React app with a different API adapter:

```
┌─────────────────────────────────────────────────────────────────┐
│                     SHARED REACT APP                            │
│  (packages/app-core - components, hooks, stores)                │
└─────────────────────────────────────────────────────────────────┘
        │                                       │
        │ Electron Adapter                      │ Web Adapter
        │ (IPC via preload.js)                  │ (HTTP/WebSocket)
        ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│   Electron Shell    │               │   Browser (PWA)     │
│   (packages/        │               │   (packages/        │
│    electron-app)    │               │    web-app)         │
└─────────────────────┘               └─────────────────────┘
        │                                       │
        └───────────────┬───────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │   FastAPI Backend   │
              │   (cloud)           │
              └─────────────────────┘
```

**What changes for web deployment:**

| Aspect | Electron | Web |
|--------|----------|-----|
| API Adapter | `createElectronAPI()` (IPC) | `createWebAPI()` (fetch + WebSocket) |
| Entry point | `packages/electron-app/` | `packages/web-app/` |
| Auth | Implicit (local) | JWT (login required) |
| File access | Native dialog | Browser file picker |
| Hosting | Desktop app | CDN + API server |

**Estimated effort**: 1 week (web adapter + deployment)

---

### 10.4 Phase 2: Web Deployment (Week 5)

**Goal**: Deploy the shared React app to the web. Since the React refactor is complete (Phase 0), this is a **lift-and-shift** with minimal new code.

> **Note**: All React components, hooks, and stores already exist in `packages/app-core/` from Phase 0. See [ELECTRON_REACT_REFACTOR_SPEC.md](./ELECTRON_REACT_REFACTOR_SPEC.md).

#### What Needs to Be Built

```
packages/web-app/                  # NEW: Web-specific entry
├── src/
│   ├── main.tsx                  # React entry (same as electron-app)
│   ├── App.tsx                   # Root component (same as electron-app)
│   ├── api-adapter.ts            # HTTP/WebSocket adapter (NEW)
│   └── auth/                     # Auth pages (login, register)
├── public/
│   ├── manifest.json             # PWA manifest
│   └── sw.js                     # Service worker
├── vite.config.ts
└── index.html
```

**New code needed**: ~300 lines (API adapter + auth UI). Everything else is shared from `packages/app-core/`.

#### Week 5 Tasks

```
├── Create packages/web-app/ with Vite config
├── Implement createWebAPI() adapter (HTTP/WebSocket)
├── Build auth pages (login, register, forgot password)
├── Configure routing (React Router)
├── Cross-browser testing (Chrome, Firefox, Safari, Edge)
├── PWA setup (manifest.json, service worker)
├── Deploy to production domain (chat.example.com)
└── Add "Try the new web app!" banner to Electron
```

#### Phase 2 Deliverables

| Deliverable | Description |
|-------------|-------------|
| React web app | Production deployment at chat.example.com |
| Web API adapter | `createWebAPI()` using fetch + WebSocket |
| Auth pages | Login, register, password reset |
| PWA support | Installable on desktop/mobile |
| Responsive design | Works on desktop, tablet, mobile (inherited from Phase 0) |
| Electron banner | "Try the new web app!" nudge |

#### Phase 2 Success Criteria

- [ ] All features work in browser (same as Electron)
- [ ] PWA installable on desktop and mobile
- [ ] Auth flow works (login, register, password reset)
- [ ] WebSocket streaming works in all major browsers
- [ ] Electron and Web can be used simultaneously

---

### 10.5 Phase 3: Production Hardening & Dual-Platform LTS (Weeks 6-8)

**Goal**: Harden production deployment for both platforms with long-term support.

#### Week 6: Monitoring & Observability

```
├── Set up CloudWatch/Datadog dashboards
├── Configure alerting (CPU, memory, errors, latency)
├── Implement structured logging (JSON logs to CloudWatch)
├── Set up error tracking (Sentry)
└── Deliverable: Full observability stack
```

#### Week 7: Load Testing & Security

```
├── Load test with expected user count (2,000-5,000)
├── Identify and fix bottlenecks
├── Optimize PostgreSQL queries (indexes, connection pooling)
├── Security audit (OWASP checklist)
├── Write API documentation (OpenAPI/Swagger)
└── Deliverable: Verified capacity, security sign-off
```

#### Week 8: Dual-Platform Launch & LTS Setup

```
├── Finalize Electron auto-update pipeline
├── Configure web CDN with edge caching
├── Create unified release process (both platforms)
├── Set up platform-specific analytics dashboards
├── Create runbooks for common operations
└── Deliverable: Both platforms in production with LTS
```

---

## 11. Dual-Platform Architecture

Both Electron and Web are **first-class, long-term supported platforms**. They share the same React codebase (`packages/app-core/`) and call the same FastAPI backend.

### 11.1 Electron Modification (Phase 1)

During Phase 1, modify Electron to become a thin client calling the cloud API:

```javascript
// electron/main.js - KEY CHANGES

// REMOVE: Python process management
// - pythonProcess = spawn(...)
// - pythonProcess.stdin.write(...)
// - pythonProcess.stdout.on('data', ...)
// - Binary message parsing

// ADD: API client
const API_URL = 'https://api.chatjuicer.com';
let authToken = null;
let wsConnection = null;

// ADD: WebSocket connection management
function connectWebSocket(sessionId) {
  wsConnection = new WebSocket(
    `wss://api.chatjuicer.com/ws/chat/${sessionId}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );

  wsConnection.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // Forward to renderer (same format as before!)
    mainWindow.webContents.send('bot-message', message);
  };
}

// MODIFY: IPC handlers to call API instead of Python
ipcMain.on('user-input', async (event, payload) => {
  // OLD: pythonProcess.stdin.write(encode(payload))
  // NEW:
  if (wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'message',
      messages: payload.messages,
      session_id: payload.session_id
    }));
  }
});

ipcMain.handle('session-command', async (event, { command, data }) => {
  // OLD: Send to Python, correlate response
  // NEW:
  const response = await fetch(`${API_URL}/api/sessions/${command}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
});

// ADD: Auth flow
ipcMain.handle('login', async (event, { email, password }) => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const { access_token, refresh_token } = await response.json();
  authToken = access_token;
  // Store refresh token securely
  await keytar.setPassword('chatjuicer', 'refresh_token', refresh_token);
  return { success: true };
});
```

### 11.2 Renderer Compatibility

The renderer code requires **zero changes** because `preload.js` maintains the same API:

```javascript
// electron/preload.js - SAME INTERFACE

contextBridge.exposeInMainWorld("electronAPI", {
  // These methods work EXACTLY as before from renderer's perspective
  sendUserInput: (messages, sessionId) => {
    ipcRenderer.send("user-input", { messages, session_id: sessionId });
  },

  onBotMessage: (callback) => {
    ipcRenderer.on("bot-message", (event, message) => callback(message));
  },

  sessionCommand: async (command, data) => {
    return await ipcRenderer.invoke("session-command", { command, data });
  },

  uploadFile: async (fileData) => {
    return await ipcRenderer.invoke("upload-file", fileData);
  },

  // ... rest unchanged
});
```

**Result**: All your existing components, services, and handlers work without modification.

### 11.3 Dual-Platform Maintenance Strategy

Both platforms share the same core codebase and receive the same features:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SHARED CODEBASE                                     │
│                                                                             │
│   packages/app-core/                                                        │
│   ├── components/        # React components (100% shared)                   │
│   ├── hooks/             # Custom hooks (100% shared)                       │
│   ├── stores/            # Zustand stores (100% shared)                     │
│   ├── api/types.ts       # ChatAPI interface (100% shared)                  │
│   └── utils/             # Utilities (100% shared)                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                               │
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│   packages/electron-app/      │   │   packages/web-app/           │
│                               │   │                               │
│   • IPC adapter (~200 lines)  │   │   • HTTP adapter (~200 lines) │
│   • main.ts (Electron shell)  │   │   • Auth pages                │
│   • Auto-update (Squirrel)    │   │   • PWA manifest              │
│   • Native file dialogs       │   │   • Service worker            │
│                               │   │                               │
│   Distribution:               │   │   Distribution:               │
│   • macOS (.dmg)              │   │   • CDN (Cloudflare/Vercel)   │
│   • Windows (.exe)            │   │   • PWA installable           │
│   • Linux (.AppImage)         │   │                               │
└───────────────────────────────┘   └───────────────────────────────┘
```

#### Release Process

```
1. Develop feature in packages/app-core/
2. Test in both Electron and Web locally
3. CI/CD runs tests for both platforms
4. Release:
   ├── Electron: Push to auto-update server
   └── Web: Deploy to CDN
5. Both platforms get the feature simultaneously
```

#### Platform-Specific Features

| Feature | Electron | Web |
|---------|----------|-----|
| Native file dialogs | ✅ | Browser file picker |
| System notifications | ✅ Native | ✅ Web Push |
| Auto-update | ✅ Squirrel | ✅ Automatic (CDN) |
| Offline mode | ❌ (needs backend) | ❌ (needs backend) |
| Desktop integration | ✅ Dock/taskbar | ✅ PWA installable |
| Keyboard shortcuts | ✅ Global | ✅ In-app |

### 11.4 PWA Option

For web users who want a desktop-like experience, offer PWA installation:

```json
// packages/web-app/public/manifest.json
{
  "name": "Chat Juicer",
  "short_name": "ChatJuicer",
  "description": "AI-powered document assistant",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f23",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Installation:
- **Chrome/Edge**: Menu → "Install Chat Juicer"
- **Safari**: Share → "Add to Dock"

PWA benefits:
- Opens in own window (no browser chrome)
- Appears in dock/taskbar
- Keyboard shortcuts work
- Auto-updates (just refresh)
- Zero installation friction

---

## 12. Future Evolution Paths

### 12.1 Horizontal Scaling (When Needed)

**Trigger**: WebSocket connections > 2,000 or CPU > 70% sustained

**Changes Required**:

1. **Add Redis for WebSocket pub/sub**:
```python
# Replace WebSocketManager with Redis-backed version
class RedisWebSocketManager:
    async def broadcast_to_session(self, session_id: str, message: dict):
        # Publish to Redis channel
        await self.redis.publish(f"session:{session_id}", json.dumps(message))

    async def listen(self):
        # Subscribe and forward to local WebSockets
        async for message in self.pubsub.listen():
            # ... forward to local connections
```

2. **Add load balancer**:
```yaml
# docker-compose.prod.yml additions
nginx:
  image: nginx:alpine
  volumes:
    - ./nginx-lb.conf:/etc/nginx/nginx.conf
  depends_on:
    - api-1
    - api-2
    - api-3

redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes
```

3. **Update connection handling for sticky sessions** (optional) or **session-less design** (preferred)

### 12.2 Multi-Provider Support (When Needed)

**Trigger**: Business decision to support Claude/Gemini

**Changes Required**:

1. **Add provider adapters** (already designed in architecture):
```python
# src/providers/anthropic_provider.py
# src/providers/google_provider.py
```

2. **Update database schema**:
```sql
ALTER TABLE sessions ADD COLUMN provider VARCHAR(20) DEFAULT 'openai';
```

3. **Update frontend model selector** to show provider groups

4. **Add provider-specific settings** (API keys per provider)

### 12.3 Multi-Tenancy / Enterprise Features

**Trigger**: Enterprise customers needing isolation

**Changes Required**:

1. **Add organization layer**:
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    settings JSONB
);

ALTER TABLE users ADD COLUMN org_id UUID REFERENCES organizations(id);
```

2. **Add RBAC**:
```sql
CREATE TABLE roles (id UUID, name VARCHAR(50), permissions JSONB);
CREATE TABLE user_roles (user_id UUID, role_id UUID);
```

3. **Separate storage per organization** (S3 prefixes or separate buckets)

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Low | High | Parallel running period, automated backups |
| WebSocket scaling issues | Medium | Medium | Load testing, Redis ready for deployment |
| Azure OpenAI rate limits | Medium | Medium | Per-user rate limiting, retry logic |
| Security vulnerabilities | Low | High | Security audit, penetration testing |
| Performance degradation | Medium | Medium | Monitoring, load testing, caching |
| User adoption resistance | Medium | Low | Feature parity, migration guide |

---

## 14. Success Metrics

### 13.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API response time (p95) | < 200ms | CloudWatch/Datadog |
| WebSocket latency | < 50ms | Client-side monitoring |
| Time to first token | < 2s | End-to-end measurement |
| Error rate | < 0.1% | Error tracking (Sentry) |
| Uptime | 99.9% | Health checks |

### 13.2 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User migration rate | > 80% in 30 days | Analytics |
| Daily active users | Maintain current | Analytics |
| Session duration | Maintain or improve | Analytics |
| User satisfaction | > 4.0/5.0 | Surveys |

---

## Appendix A: API Response Models

```python
# src/models/api_responses.py

class SessionResponse(BaseModel):
    id: UUID
    session_id: str
    title: str
    model: str
    reasoning_effort: str
    mcp_config: list[str]
    pinned: bool
    is_named: bool
    message_count: int
    created_at: datetime
    last_used_at: datetime

class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    tool_call_id: str | None
    tool_name: str | None
    tool_result: str | None
    created_at: datetime

class FileResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime

class ConfigResponse(BaseModel):
    models: list[ModelConfig]
    reasoning_efforts: list[str]
    mcp_servers: list[MCPServerConfig]
    max_file_size: int
```

---

## Appendix B: Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_INVALID_TOKEN` | 401 | JWT token is invalid or expired |
| `AUTH_UNAUTHORIZED` | 403 | User lacks permission for resource |
| `SESSION_NOT_FOUND` | 404 | Session does not exist or access denied |
| `FILE_TOO_LARGE` | 413 | File exceeds maximum size limit |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `PROVIDER_ERROR` | 502 | LLM provider returned error |
| `STREAM_INTERRUPTED` | 499 | Client interrupted the stream |

---

*End of Specification*

