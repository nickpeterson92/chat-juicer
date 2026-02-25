---
name: architecture
description: Full project structure, architecture diagrams, and component relationships
---

# Chat Juicer Architecture

**Dual-platform**: Electron desktop app + browser web app (Cloudflare Pages), both sharing the same FastAPI backend.

## Dual-Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WEB BROWSER                                  │
│                    (Cloudflare Pages)                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTP REST / WebSocket (direct)
                            │
┌───────────────────────────┼─────────────────────────────────────────┐
│   ELECTRON APP            │                                         │
│  ┌────────────────────┐   │                                         │
│  │  Renderer Process  │   │                                         │
│  │  (ES6 modules)     │   │                                         │
│  └─────────┬──────────┘   │                                         │
│            │ IPC          │                                         │
│  ┌─────────▼──────────┐   │                                         │
│  │   Main Process     │   │                                         │
│  │  (HTTP/WS proxy)   ├───┘                                         │
│  └────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                        │
│              (PostgreSQL, Agent/Runner, MCP servers)                │
└─────────────────────────────────────────────────────────────────────┘
```

## Communication Flow

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

## Project Structure

```
chat-juicer/
├── src/
│   ├── frontend/          # Electron app
│   │   ├── main.js           # Main process, IPC handlers, HTTP proxy
│   │   ├── api-client.js     # HTTP client for FastAPI
│   │   ├── preload.js        # Secure context-isolated IPC
│   │   ├── logger.js         # Structured logging with IPC forwarding
│   │   ├── config/           # Main process constants
│   │   ├── utils/            # Binary parser, IPC v2 protocol
│   │   ├── ui/               # HTML, CSS assets
│   │   └── renderer/         # Component-based ES6 modules
│   │       ├── bootstrap.js      # 7-phase bootstrap orchestrator
│   │       ├── adapters/         # DOM, IPC, Storage adapters
│   │       ├── core/             # AppState + EventBus
│   │       ├── services/         # Business logic
│   │       ├── handlers/         # Event handlers
│   │       └── ui/               # UI components
│   └── backend/           # Python FastAPI
│       ├── api/
│       │   ├── main.py           # FastAPI app, lifespan, routes
│       │   ├── dependencies.py   # DI for DB, services, managers
│       │   ├── routes/           # API endpoints
│       │   ├── services/         # Business logic
│       │   ├── middleware/       # Auth, exceptions, context
│       │   └── websocket/        # WS manager, errors, tasks
│       ├── core/
│       │   ├── agent.py          # Agent/Runner with MCP
│       │   ├── prompts.py        # System prompts
│       │   └── constants.py      # Pydantic Settings
│       ├── models/           # Pydantic data models
│       ├── tools/            # Function calling tools
│       ├── integrations/     # MCP servers, event handlers
│       └── utils/            # Logging, tokens, files, DB
├── data/files/           # Session-scoped file storage
├── logs/                 # Log files (gitignored)
├── scripts/              # Utility scripts
└── tests/                # pytest + vitest
```

## Key Architectural Concepts

### Frontend (Renderer)
- 7-phase bootstrap wiring: adapters → AppState/DOM → services → components → handlers → plugins → data
- `AppState` is single source of truth
- Global `EventBus` for decoupled message routing
- Services communicate via IPC adapter → FastAPI

### Backend (FastAPI)
- RESTful API for session/file CRUD
- WebSocket at `/ws/chat/{session_id}` for streaming
- PostgreSQL for persistence
- Dependency injection via FastAPI's `Depends`
- MCP Server Pool: Pre-spawned instances for concurrency

### Agent/Runner Pattern
- Native MCP Integration (Sequential Thinking + Fetch, optional Tavily)
- Automatic tool orchestration
- Full async architecture
- Streaming events via WebSocket
- Token-aware sessions with automatic summarization

### State Management (Backend)
```python
app.state.db_pool      # PostgreSQL connection pool
app.state.ws_manager   # WebSocket connection tracking
app.state.mcp_pool     # MCP server pool
```

Services injected via dependencies:
```python
@router.get("/{session_id}")
async def get_session(session_id: str, sessions: Sessions):
    return await sessions.get_session(session_id)
```
