# API Module (FastAPI Application)

FastAPI application providing REST endpoints and WebSocket streaming for the chat interface. Uses dependency injection for clean service composition.

## Structure

```
api/
├── main.py              # FastAPI app, lifespan, CORS, route registration
├── dependencies.py      # Dependency injection (DB pool, services, managers)
├── routes/              # HTTP endpoints
│   ├── auth.py          # Authentication routes
│   ├── chat.py          # WebSocket chat endpoint
│   ├── config.py        # Configuration endpoint
│   ├── files.py         # File management routes
│   ├── health.py        # Health check endpoint
│   ├── messages.py      # Message pagination endpoint
│   └── sessions.py      # Session CRUD routes
├── services/            # Business logic
│   ├── auth_service.py        # Authentication logic
│   ├── chat_service.py        # Agent/Runner orchestration, streaming
│   ├── file_service.py        # File operations
│   ├── file_context.py        # Session file context manager
│   ├── session_service.py     # Session lifecycle management
│   ├── token_aware_session.py # Token-managed LLM context (Layer 1)
│   ├── postgres_session.py    # Low-level PostgreSQL session storage
│   └── message_utils.py       # Message formatting utilities
├── middleware/          # FastAPI middleware
│   └── auth.py          # Authentication middleware
└── websocket/           # WebSocket management
    └── manager.py       # Connection tracking, message routing
```

## Key Components

### Lifespan Management (`main.py`)
- Initialize PostgreSQL connection pool
- Initialize MCP server pool for concurrent requests
- Configure OpenAI/Azure client
- Create WebSocket manager

### Dependency Injection (`dependencies.py`)
Services are injected via FastAPI's `Depends()`:
```python
@router.get("/{session_id}")
async def get_session(session_id: str, sessions: Sessions):
    return await sessions.get_session(session_id)
```

### WebSocket Protocol (`routes/chat.py`)
Chat streaming uses WebSocket at `/ws/chat/{session_id}`:
- Client sends: `message`, `interrupt`
- Server sends: `assistant_start`, `text_delta`, `tool_start`, `tool_done`, `assistant_end`

### Chat Service (`services/chat_service.py`)
Orchestrates the Agent/Runner pattern:
- Acquires MCP servers from pool
- Creates agent with tools and instructions
- Streams responses via WebSocket
- Handles interrupts and persistence

## Patterns

- **Async everywhere**: All routes and services use async/await
- **Dependency injection**: No global state; services passed via `Depends()`
- **Session isolation**: Each request gets dedicated client/provider for stream isolation
- **Dual-layer persistence**: Layer 1 (LLM context) + Layer 2 (full history)

## Extending

- New endpoints: Add route file in `routes/`, register in `main.py`
- New services: Add to `services/`, inject via `dependencies.py`
- New middleware: Add to `middleware/`, register in `main.py`
