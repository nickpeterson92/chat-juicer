# GEMINI.md

This file provides guidance for those working with code in this repository.

## Project Overview

Chat Juicer is a production-grade Electron + FastAPI desktop application that provides a chat interface for Azure OpenAI using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**. The application features advanced reasoning capabilities through Sequential Thinking, sophisticated document generation, enterprise-grade logging, and comprehensive type safety.

## Current Architecture (FastAPI Backend)

The application uses a **three-tier architecture**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Renderer Process                       │
│                    (Component-based ES6 modules)                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC (context isolation)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                           │
│                    (HTTP/WebSocket proxy)                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP REST / WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                        │
│              (PostgreSQL, Agent/Runner, MCP servers)                │
└─────────────────────────────────────────────────────────────────────┘
```

### Cloud Deployment Architecture

For production, the FastAPI backend runs on AWS:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                            │
│              (Connects to cloud backend via HTTPS)                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EC2 Instance (t3.xlarge)                        │
│           Amazon Linux 2023 + FastAPI + MCP Sidecars                │
└─────────────────────────────────────────────────────────────────────┘
               │                              │
               │ PostgreSQL                   │ S3 API
               ▼                              ▼
    ┌───────────────────┐          ┌───────────────────┐
    │  RDS PostgreSQL   │          │    S3 Bucket      │
    │   (db.t3.micro)   │          │  (Session files)  │
    │   PostgreSQL 16   │          │                   │
    └───────────────────┘          └───────────────────┘
```

**AWS Components:**
- **EC2**: t3.xlarge running Amazon Linux 2023 with uvicorn + systemd
- **RDS**: PostgreSQL 16.11 (db.t3.micro) with Performance Insights
- **S3**: Session file storage with automatic sync and presigned URLs
- **VPC**: Public subnets with security group whitelisting

### Project Structure

```
chat-juicer/
├── src/               # All application source code
│   ├── frontend/      # Electron main process and renderer
│   │   ├── main.js       # Electron main process, IPC handlers, HTTP proxy to FastAPI
│   │   ├── api-client.js # HTTP client for FastAPI backend communication
│   │   ├── preload.js    # Preload script for secure context-isolated IPC
│   │   ├── logger.js     # Centralized structured logging with IPC forwarding
│   │   ├── config/
│   │   │   └── main-constants.js     # Main process configuration constants
│   │   ├── ui/           # Frontend static assets
│   │   │   ├── index.html    # Main chat UI
│   │   │   └── input.css     # Tailwind CSS source
│   │   └── renderer/     # Component-based renderer process (ES6 modules)
│   │       ├── index.js              # Entry point
│   │       ├── bootstrap.js          # 7-phase bootstrap orchestrator
│   │       ├── bootstrap/            # Bootstrap modules
│   │       │   ├── phases/           # Individual bootstrap phases
│   │       │   ├── error-recovery.js # Error recovery logic
│   │       │   ├── types.js          # Type definitions
│   │       │   └── validators.js     # Bootstrap validators
│   │       ├── adapters/             # DOM, IPC, Storage adapters
│   │       ├── config/               # constants, colors, model-metadata
│   │       ├── core/                 # AppState, EventBus, lifecycle management
│   │       ├── managers/             # DOM, file, view managers
│   │       ├── services/             # Business logic (AppState-backed)
│   │       ├── handlers/             # Event handlers
│   │       ├── plugins/              # Plugin registry
│   │       ├── ui/                   # UI components, renderers, tool-registry
│   │       ├── viewmodels/           # Data transformation
│   │       └── utils/                # Utility modules + analytics
│   └── backend/       # Python FastAPI backend
│       ├── api/          # FastAPI application
│       │   ├── main.py           # FastAPI app with lifespan, routes, CORS
│       │   ├── dependencies.py   # Dependency injection (DB, services, managers)
│       │   ├── routes/           # API endpoints
│       │   │   ├── chat.py       # WebSocket chat endpoint (/ws/chat)
│       │   │   └── v1/           # Versioned REST API routes
│       │   │       ├── auth.py       # Authentication routes
│       │   │       ├── config.py     # Configuration endpoint
│       │   │       ├── files.py      # File management routes
│       │   │       ├── health.py     # Health check endpoint
│       │   │       ├── messages.py   # Message pagination endpoint
│       │   │       └── sessions.py   # Session CRUD routes
│       │   ├── services/         # Business logic
│       │   │   ├── chat_service.py       # Chat streaming with Agent/Runner
│       │   │   ├── session_service.py    # Session management
│       │   │   ├── file_service.py       # File operations
│       │   │   ├── file_context.py       # File context management
│       │   │   ├── s3_sync_service.py    # S3 file synchronization
│       │   │   ├── token_aware_session.py # Token-aware session management
│       │   │   ├── postgres_session.py   # PostgreSQL session storage
│       │   │   ├── message_utils.py      # Message utilities
│       │   │   └── auth_service.py       # Authentication
│       │   ├── middleware/       # FastAPI middleware
│       │   │   ├── auth.py               # Authentication middleware
│       │   │   ├── exception_handlers.py # Global exception handlers
│       │   │   └── request_context.py    # Request context middleware
│       │   └── websocket/        # WebSocket management
│       │       ├── manager.py        # WebSocket connection tracking
│       │       ├── errors.py         # WebSocket error handling
│       │       └── task_manager.py   # Async task/cancellation management
│       ├── config/       # Configuration files
│       │   └── db_registry.yaml  # Database schema registry
│       ├── core/         # Core business logic
│       │   ├── agent.py          # Agent/Runner implementation with MCP
│       │   ├── prompts.py        # System instruction prompts
│       │   └── constants.py      # Configuration with Pydantic Settings
│       ├── models/       # Pydantic data models
│       │   ├── api_models.py     # API request/response models
│       │   ├── event_models.py   # WebSocket event models
│       │   ├── error_models.py   # Error response models
│       │   ├── ipc_models.py     # IPC message models
│       │   ├── mcp_models.py     # MCP protocol models
│       │   ├── sdk_models.py     # SDK integration models
│       │   ├── session_models.py # Session metadata models
│       │   └── schemas/          # Response schema models
│       │       ├── auth.py       # Auth response schemas
│       │       ├── base.py       # Base schema classes
│       │       ├── config.py     # Config response schemas
│       │       ├── files.py      # File response schemas
│       │       ├── health.py     # Health response schemas
│       │       ├── presign.py    # Presigned URL schemas
│       │       └── sessions.py   # Session response schemas
│       ├── tools/        # Function calling tools (async)
│       │   ├── file_operations.py    # File reading, directory listing
│       │   ├── document_generation.py # Document generation
│       │   ├── text_editing.py       # Text editing operations
│       │   ├── code_interpreter.py   # Sandboxed code execution
│       │   ├── schema_fetch.py       # Database schema introspection
│       │   ├── wrappers.py           # Session-aware tool wrappers
│       │   └── registry.py           # Tool registration
│       ├── integrations/ # External integrations
│       │   ├── mcp_pool.py          # MCP server connection pool
│       │   ├── mcp_registry.py      # MCP server registry
│       │   ├── mcp_transport.py     # MCP transport layer
│       │   ├── mcp_websocket_client.py # MCP WebSocket client
│       │   ├── sdk_token_tracker.py # Token tracking
│       │   └── event_handlers/      # Streaming event handlers
│       │       ├── agent_events.py      # Agent event handlers
│       │       ├── base.py              # Base handler class
│       │       ├── raw_events.py        # Raw event handlers
│       │       ├── registry.py          # Handler registry
│       │       └── run_item_events.py   # Run item event handlers
│       └── utils/        # Utility modules
│           ├── logger.py           # Enterprise JSON logging
│           ├── token_utils.py      # Token counting with LRU cache
│           ├── file_utils.py       # File system utilities
│           ├── client_factory.py   # OpenAI client factory
│           ├── db_utils.py         # Database utilities
│           ├── document_processor.py # Document processing
│           ├── http_logger.py      # HTTP request logging
│           └── json_utils.py       # JSON utilities
├── data/             # Persistent data storage
│   └── files/        # Session-scoped file storage
├── docker/           # Docker configurations
│   └── mcp/          # MCP sidecar containers (docker-compose)
├── infra/            # Terraform infrastructure (AWS)
│   ├── bootstrap/    # State backend (S3 + DynamoDB)
│   ├── modules/      # Terraform modules
│   │   ├── compute/      # EC2 instance + IAM + security groups
│   │   ├── database/     # RDS PostgreSQL
│   │   ├── networking/   # VPC, subnets, routing
│   │   └── storage/      # S3 bucket
│   ├── main.tf       # Root module composition
│   ├── variables.tf  # Input variables
│   └── outputs.tf    # Output values
├── logs/             # Log files (gitignored)
├── scripts/          # Utility scripts
└── tests/            # Test suites
    ├── backend/      # Python tests (pytest)
    └── frontend/     # JavaScript tests (vitest)
```

## Key Architectural Concepts

### FastAPI Backend

The backend is a FastAPI application with:

- **RESTful API**: Standard HTTP endpoints for session/file CRUD
- **WebSocket**: Real-time chat streaming via `/ws/chat/{session_id}`
- **PostgreSQL**: Persistent storage for sessions and messages
- **Dependency Injection**: Clean service injection via FastAPI's `Depends`
- **MCP Server Manager**: Singleton MCP server instances with WebSocket multiplexing

**Key files:**
- `src/backend/api/main.py` - FastAPI app initialization, lifespan management, route registration
- `src/backend/api/dependencies.py` - Dependency injection for DB pool, services, managers
- `src/backend/api/routes/chat.py` - WebSocket endpoint for chat streaming
- `src/backend/api/services/chat_service.py` - Agent/Runner orchestration, interrupt handling

### Communication Flow

```
Frontend                 Main Process              FastAPI Backend
────────                 ────────────              ───────────────
User types message
        │
        ▼
IPC: sendMessage() ──────► HTTP proxy
                                │
                                ▼
                          POST /api/sessions
                          GET /api/sessions/{id}
                          WS /ws/chat/{session_id}
                                │
                                ▼
                          ChatService.process_chat()
                                │
                                ▼
                          Agent/Runner streaming
                                │
                                ▼
                          WebSocket events ◄────────
                                │
        ◄───────────────────────┘
        │
        ▼
EventBus dispatches
to message handlers
```

### Renderer Runtime

- 7-phase bootstrap (`bootstrap.js`) wiring adapters → AppState/DOM → services → components → handlers → plugins → data
- `AppState` (`core/state.js`) is the single source of truth
- Global `EventBus` for decoupled message routing
- Services communicate with backend via IPC adapter which proxies to FastAPI

### Agent/Runner Pattern with MCP

The application uses OpenAI's Agent/Runner pattern:

- **Native MCP Integration**: Sequential Thinking + Fetch by default, optional Tavily
- **Automatic Tool Orchestration**: Framework handles function calling
- **Full Async Architecture**: Consistent async/await throughout
- **Streaming Events**: Real-time responses via WebSocket
- **Token-Aware Sessions**: PostgreSQL-based with automatic summarization

### MCP Server Manager

For concurrent request handling, MCP servers use WebSocket multiplexing:

```python
# In api/main.py lifespan
app.state.mcp_manager = await initialize_mcp_manager()
```

This maintains one active connection per server type to handle all requests.

## Logging Guidelines

1. **Only log actionable information** - Errors, warnings, critical state changes
2. **No progress/status logs** - No "starting...", "done", phase completions
3. **No verbose debug in production** - Guard with environment checks
4. **Never use emojis** - Keep logs professional and grep-friendly
5. **Use consistent prefixes** - Format: `[ModuleName] Description`

| Level | Use For | Don't Use For |
|-------|---------|---------------|
| ERROR | Unrecoverable failures | Expected errors handled gracefully |
| WARN | Recoverable issues, degraded state | Routine retries |
| INFO | Significant state changes | "Starting...", "Done", routine ops |
| DEBUG | Dev-only (guarded) | Production code |

## Essential Commands

### Running the Application

```bash
make run                # Production mode
make dev                # Development mode with DevTools
```

### Development & Quality

```bash
make test               # Run all tests
make test-backend       # Python tests only
make test-frontend      # JavaScript tests only
make lint               # Run ruff linter
make format             # Format with black
make typecheck          # Run mypy
make quality            # All quality checks
```

### Database (PostgreSQL)

The application uses PostgreSQL for persistence, running in a Docker/Podman container.

**Connection Details:**
```bash
# Container name: chatjuicer-postgres
# Port: 5433 (mapped to container's 5432)
# User: chatjuicer
# Password: localdev
# Database: chatjuicer

# Connect via psql:
PGPASSWORD=localdev psql -h localhost -p 5433 -U chatjuicer -d chatjuicer

# Example queries:
PGPASSWORD=localdev psql -h localhost -p 5433 -U chatjuicer -d chatjuicer -c "\dt"
PGPASSWORD=localdev psql -h localhost -p 5433 -U chatjuicer -d chatjuicer -c "SELECT * FROM sessions LIMIT 5;"
```

**Key tables:**
- `users` - User accounts
- `sessions` - Chat sessions with metadata
- `messages` - Full message history with tool calls (tool_name, tool_arguments, tool_result, tool_success)
- `llm_context` - LLM context for token management (Layer 1)
- `files` - File metadata

## Critical Implementation Details

### Environment Requirements

**Required (All Environments):**
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Format `https://resource.openai.azure.com/`
- `DATABASE_URL`: PostgreSQL connection string

**Cloud-Specific (Production):**
- `FILE_STORAGE=s3`: Enable S3 file storage (default: `local`)
- `S3_BUCKET`: S3 bucket name for session files
- `S3_REGION`: AWS region (e.g., `us-west-2`)
- `JWT_SECRET`: Secret for JWT token signing
- `ALLOW_LOCALHOST_NOAUTH=false`: Enforce authentication

**Optional:**
- `REASONING_EFFORT`: Control reasoning effort (`none`, `low`, `medium`, `high`)
- `TAVILY_API_KEY`: Enable Tavily search MCP server
- `SF_USER`, `SF_PASSWORD`, `SF_TOKEN`: Salesforce integration for schema_fetch

### Dependencies

#### Python (src/backend/requirements.txt)
- `fastapi` - Web framework
- `asyncpg` - Async PostgreSQL driver
- `uvicorn` - ASGI server
- `openai>=1.0.0` - Azure OpenAI client
- `openai-agents>=0.3.3` - Agent/Runner framework
- `pydantic>=2.5.0` - Data validation

#### Node (package.json)
- `electron` - Desktop framework
- `marked` - Markdown parser
- `highlight.js` - Syntax highlighting
- `katex` - Math rendering
- `mermaid` - Diagram rendering

### WebSocket Protocol

Chat streaming uses WebSocket at `/ws/chat/{session_id}`:

```javascript
// Client sends
{ type: "message", messages: [...], model: "gpt-5.1", reasoning_effort: "medium" }
{ type: "interrupt" }

// Server sends
{ type: "assistant_start" }
{ type: "text_delta", content: "..." }
{ type: "tool_start", call_id: "...", name: "..." }
{ type: "tool_done", call_id: "...", output: "..." }
{ type: "assistant_end", usage: {...} }
{ type: "stream_interrupted" }
```

### State Management

All application state flows through `app.state`:
- `app.state.db_pool` - PostgreSQL connection pool
- `app.state.ws_manager` - WebSocket connection tracking
- `app.state.mcp_manager` - MCP server manager

Services are injected via FastAPI dependencies:
```python
@router.get("/{session_id}")
async def get_session(session_id: str, sessions: Sessions):
    return await sessions.get_session(session_id)
```

## Common Development Tasks

### Adding New API Endpoints

1. Create route in `src/backend/api/routes/`
2. Add service logic in `src/backend/api/services/`
3. Register route in `src/backend/api/main.py`

### Adding New Functions/Tools

1. Implement in `src/backend/tools/*.py`
2. Register in `src/backend/tools/registry.py`
3. Add session-aware wrapper if needed in `src/backend/tools/wrappers.py`

### Adding New MCP Servers

```python
# In src/backend/integrations/mcp_servers.py
new_server = MCPServerStdio(
    params={"command": "npx", "args": ["-y", "@mcp/server-name"]}
)
```

## Testing

- **Backend**: `make test-backend` (pytest)
- **Frontend**: `make test-frontend` (vitest)
- **All**: `make test`

Test files live in `tests/backend/` and `tests/frontend/`.
