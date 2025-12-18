# Chat Juicer - Project Index

> Comprehensive documentation index for the Chat Juicer desktop application.
> A production-grade Electron + FastAPI application for Azure OpenAI with Agent/Runner pattern and MCP support.

## Quick Navigation

- [Architecture Overview](#architecture-overview)
- [Backend (FastAPI)](#backend-fastapi)
- [Frontend (Electron)](#frontend-electron)
- [API Reference](#api-reference)
- [Data Flow](#data-flow)
- [Development Guide](#development-guide)

---

## Architecture Overview

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Renderer Process                       │
│            Component-based ES6 modules with EventBus                │
│         (AppState, Services, Handlers, UI Components)               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC (context isolation via preload.js)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                           │
│              HTTP/WebSocket proxy to FastAPI backend                │
│                  (api-client.js, main.js)                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP REST / WebSocket (port 8000)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                        │
│        PostgreSQL, Agent/Runner pattern, MCP server pool            │
│              (Async throughout, streaming responses)                │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns**: Clear boundaries between UI, business logic, and data
2. **Event-Driven Communication**: EventBus for decoupled frontend messaging
3. **Pub/Sub State Management**: AppState with subscription-based updates
4. **Async-First Backend**: Full async/await throughout Python codebase
5. **Token-Aware Context**: Automatic summarization at token thresholds

---

## Backend (FastAPI)

### Directory Structure

```
src/
├── api/                    # FastAPI application layer
│   ├── main.py            # App initialization, lifespan, routes
│   ├── dependencies.py    # Dependency injection (DB, services)
│   ├── routes/            # API endpoint handlers
│   │   ├── auth.py        # Authentication (login, refresh, me)
│   │   ├── chat.py        # WebSocket chat streaming
│   │   ├── config.py      # Model/MCP configuration
│   │   ├── files.py       # File upload/download/list
│   │   ├── health.py      # Health check endpoint
│   │   ├── messages.py    # Message pagination
│   │   └── sessions.py    # Session CRUD operations
│   ├── services/          # Business logic layer
│   │   ├── auth_service.py        # JWT authentication
│   │   ├── chat_service.py        # Agent/Runner orchestration
│   │   ├── file_service.py        # File operations
│   │   ├── session_service.py     # Session management
│   │   ├── token_aware_session.py # Token-aware context
│   │   └── message_utils.py       # Message formatting
│   ├── middleware/        # FastAPI middleware
│   │   └── auth.py        # Authentication middleware
│   └── websocket/         # WebSocket management
│       └── manager.py     # Connection tracking
├── core/                   # Core business logic
│   ├── agent.py           # Agent/Runner with MCP integration
│   ├── constants.py       # Pydantic Settings configuration
│   └── prompts.py         # System instruction prompts
├── models/                 # Pydantic data models
│   ├── api_models.py      # API request/response models
│   ├── event_models.py    # WebSocket event models
│   ├── session_models.py  # Session metadata models
│   └── sdk_models.py      # SDK-specific models
├── tools/                  # Function calling tools (async)
│   ├── code_interpreter.py    # Sandboxed code execution
│   ├── document_generation.py # Document creation
│   ├── file_operations.py     # File reading, directory listing
│   ├── registry.py            # Tool registration
│   ├── text_editing.py        # Text editing operations
│   └── wrappers.py            # Session-aware tool wrappers
├── integrations/           # External integrations
│   ├── event_handlers.py      # Streaming event handlers
│   ├── mcp_pool.py            # MCP server connection pool
│   ├── mcp_registry.py        # MCP server registry
│   ├── mcp_servers.py         # MCP server setup
│   └── sdk_token_tracker.py   # Token tracking
└── utils/                  # Utility modules
    ├── binary_io.py           # Binary I/O utilities
    ├── client_factory.py      # OpenAI client factory
    ├── document_processor.py  # Document conversion
    ├── file_utils.py          # File system utilities
    ├── http_logger.py         # HTTP request logging
    ├── json_utils.py          # JSON utilities
    ├── logger.py              # Enterprise JSON logging
    ├── token_utils.py         # Token counting with LRU cache
    └── validation.py          # Input validation
```

### Key Components

#### Application Lifecycle (`api/main.py`)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _setup_openai_client()           # Configure Azure/OpenAI client
    patch_sdk_for_auto_tracking()    # Enable SDK-level token tracking
    app.state.db_pool = await asyncpg.create_pool(...)  # PostgreSQL pool
    app.state.ws_manager = WebSocketManager()           # WebSocket tracking
    app.state.mcp_pool = await initialize_mcp_pool(3)   # MCP server pool
    
    yield
    
    # Shutdown
    await app.state.mcp_pool.shutdown()
    await app.state.db_pool.close()
```

#### Chat Service (`api/services/chat_service.py`)

Orchestrates Agent/Runner pattern with streaming:

- **Interrupt handling**: Flag-based cooperative cancellation
- **Token tracking**: Automatic usage tracking via SDK patch
- **MCP integration**: Pooled server connections for tools
- **Event streaming**: WebSocket events for real-time UI updates

#### Token-Aware Session (`api/services/token_aware_session.py`)

Two-layer storage architecture:

1. **Layer 1 (LLM Context)**: Token-managed context with automatic summarization
2. **Layer 2 (Full History)**: Complete UI-facing conversation history

Triggers summarization at 20% of model token limit.

---

## Frontend (Electron)

### Directory Structure

```
electron/
├── main.js                # Electron main process, IPC handlers
├── preload.js             # Secure IPC bridge (context isolation)
├── api-client.js          # HTTP client for FastAPI
├── logger.js              # Centralized logging with IPC forwarding
├── config/
│   └── main-constants.js  # Main process configuration
├── utils/
│   ├── binary-message-parser.js  # Binary protocol parsing
│   └── ipc-v2-protocol.js        # IPC protocol utilities
└── renderer/              # Component-based architecture
    ├── index.js           # Entry point
    ├── bootstrap.js       # 7-phase initialization orchestrator
    ├── adapters/          # Platform abstraction
    │   ├── DOMAdapter.js      # DOM manipulation
    │   ├── IPCAdapter.js      # IPC communication
    │   └── StorageAdapter.js  # localStorage abstraction
    ├── core/              # Framework core
    │   ├── state.js           # AppState + BoundedMap
    │   ├── event-bus.js       # EventBus pub/sub
    │   ├── lifecycle-manager.js  # Component lifecycle
    │   └── component-lifecycle.js  # Lifecycle base class
    ├── config/            # Configuration
    │   ├── constants.js       # App constants
    │   ├── colors.js          # Theme colors
    │   └── model-metadata.js  # Model configurations
    ├── services/          # Business logic (AppState-backed)
    │   ├── session-service.js    # Session management
    │   ├── message-service.js    # Message handling
    │   ├── file-service.js       # File operations
    │   ├── function-call-service.js  # Tool call tracking
    │   ├── stream-manager.js     # Streaming state
    │   └── message-queue-service.js  # Message queuing
    ├── handlers/          # Event handlers
    │   ├── message-handlers-v2.js   # EventBus-integrated (14+ handlers)
    │   ├── session-list-handlers.js # Session interactions
    │   ├── session-events.js        # Session state events
    │   ├── chat-events.js           # Chat interaction events
    │   └── file-events.js           # File operation events
    ├── managers/          # UI state managers
    │   ├── dom-manager.js     # DOM element caching
    │   ├── view-manager.js    # View transitions
    │   └── file-manager.js    # File list management
    ├── ui/                # UI components
    │   ├── components/        # Reusable components
    │   │   ├── chat-container.js   # Message display
    │   │   ├── connection-status.js # Connection indicator
    │   │   ├── file-panel.js       # File management
    │   │   ├── input-area.js       # Chat input
    │   │   └── model-selector.js   # Model/reasoning selection
    │   ├── renderers/         # Rendering utilities
    │   │   └── session-list-renderer.js
    │   ├── chat-ui.js         # Chat UI orchestration
    │   ├── function-card-ui.js # Tool call cards
    │   ├── titlebar.js        # Custom titlebar
    │   └── welcome-page.js    # Welcome view
    ├── viewmodels/        # Data transformation
    │   ├── message-viewmodel.js  # Message formatting
    │   └── session-viewmodel.js  # Session formatting
    ├── plugins/           # Plugin system
    │   ├── plugin-interface.js  # Plugin base class
    │   └── core-plugins.js      # Built-in plugins
    ├── utils/             # Utility modules
    │   ├── markdown-renderer.js  # Markdown processing
    │   ├── scroll-utils.js       # Scroll behavior
    │   ├── toast.js              # Toast notifications
    │   └── ...                   # Additional utilities
    └── bootstrap/         # Bootstrap phases
        ├── phases/            # Phase implementations
        │   ├── phase1-adapters.js     # DOMAdapter, IPCAdapter, StorageAdapter
        │   ├── phase2-state-dom.js    # AppState, DOM elements
        │   ├── phase3-services.js     # Business logic services
        │   ├── phase4-components.js   # UI components
        │   ├── phase5-event-handlers.js  # Event listeners
        │   ├── phase5a-subscriptions.js  # State subscriptions
        │   ├── phase6-plugins.js      # Plugin initialization
        │   └── phase7-data-loading.js # Initial data fetch
        ├── validators.js      # Phase validation
        ├── error-recovery.js  # Graceful degradation
        └── types.js           # Type definitions
```

### Bootstrap Phases

The application initializes through 7 discrete phases:

| Phase | Name | Components | Dependencies |
|-------|------|------------|--------------|
| 1 | Adapters | DOMAdapter, IPCAdapter, StorageAdapter, EventBus | None |
| 2 | State & DOM | AppState, DOM element references | Phase 1 |
| 3 | Services | MessageService, FileService, SessionService | Phases 1-2 |
| 4 | Components | ChatContainer, InputArea, FilePanel | Phases 1-3 |
| 5 | Event Handlers | All event listeners and IPC handlers | Phases 1-4 |
| 6 | Plugins | PluginRegistry, extensions | Phases 1-5 |
| 7 | Data Loading | Sessions, model config, initial view | Phases 1-6 |

### State Management

**AppState** (`core/state.js`):
- Single source of truth for application state
- Pub/sub pattern with `subscribe()` / `notifyListeners()`
- Namespaced state: `connection`, `session`, `message`, `functions`, `ui`, `files`, `queue`, `stream`
- BoundedMap for memory-efficient collection management

**EventBus** (`core/event-bus.js`):
- Decoupled component communication
- Priority-based handler execution
- Error boundaries around handlers
- Wildcard subscription support
- ScopedEventBus for plugins

---

## API Reference

### REST Endpoints

#### Health & Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with DB probe |
| GET | `/api/config` | Model and MCP configuration |

#### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user info |

#### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List sessions (paginated) |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/{id}` | Get session with history |
| PATCH | `/api/sessions/{id}` | Update session metadata |
| DELETE | `/api/sessions/{id}` | Delete session |
| POST | `/api/sessions/{id}/summarize` | Force conversation summarization |

#### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/{id}/messages` | List messages (paginated) |

#### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/{id}/files` | List session files |
| POST | `/api/sessions/{id}/files/upload` | Upload file |
| GET | `/api/sessions/{id}/files/{name}/download` | Download file |
| GET | `/api/sessions/{id}/files/{name}/path` | Get local file path |
| DELETE | `/api/sessions/{id}/files/{name}` | Delete file |

### WebSocket Protocol

**Endpoint**: `ws://localhost:8000/ws/chat/{session_id}`

#### Client Messages

```javascript
// Send chat message
{ "type": "message", "messages": [...], "model": "gpt-5.1", "reasoning_effort": "medium" }

// Request interrupt
{ "type": "interrupt" }
```

#### Server Events

```javascript
// Stream lifecycle
{ "type": "assistant_start" }
{ "type": "assistant_end", "usage": {...} }
{ "type": "stream_interrupted" }

// Content streaming
{ "type": "text_delta", "content": "..." }

// Tool execution
{ "type": "tool_start", "call_id": "...", "name": "..." }
{ "type": "tool_arguments_delta", "call_id": "...", "delta": "..." }
{ "type": "tool_done", "call_id": "...", "output": "..." }

// Session updates
{ "type": "session_updated", "session_id": "...", "title": "..." }
{ "type": "token_usage", "current": 1234, "limit": 128000, "threshold": 100000 }

// Keep-alive
{ "type": "ping" }
```

---

## Data Flow

### Chat Message Flow

```
User Input → InputArea → sendMessage()
                              │
                              ▼
                    MessageService.sendMessage()
                              │
                              ▼
                    IPCAdapter.invoke('sendMessage')
                              │
                              ▼
                    Main Process (api-client.js)
                              │
                              ▼
                    WebSocket /ws/chat/{session_id}
                              │
                              ▼
                    ChatService.process_chat()
                              │
                              ▼
                    Agent/Runner (openai-agents)
                              │
                              ▼
                    Streaming Events (WebSocket)
                              │
                              ▼
                    EventBus.emit('stream:*')
                              │
                              ▼
                    message-handlers-v2.js
                              │
                              ▼
                    ChatContainer (UI update)
```

### State Update Flow

```
Event Occurs → Handler function
                    │
                    ▼
              AppState.setState(path, value)
                    │
                    ▼
              notifyListeners(path, newValue, oldValue)
                    │
                    ▼
              Subscribed callbacks execute
                    │
                    ▼
              UI components re-render
```

---

## Development Guide

### Commands

```bash
# Run application
make run          # Production mode
make dev          # Development mode with DevTools

# Testing
make test         # All tests
make test-backend # Python tests (pytest)
make test-frontend # JavaScript tests (vitest)

# Quality
make lint         # Ruff linter
make format       # Black formatter
make typecheck    # MyPy type checking
make quality      # All quality checks
```

### Environment Variables

**Required**:
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT` - Format: `https://resource.openai.azure.com/`
- `AZURE_OPENAI_DEPLOYMENT` - Model deployment name
- `DATABASE_URL` - PostgreSQL connection string

**Optional**:
- `REASONING_EFFORT` - Reasoning level (`none`, `low`, `medium`, `high`)
- `TAVILY_API_KEY` - Enable Tavily search MCP server
- `HTTP_REQUEST_LOGGING` - Enable HTTP request logging

### Adding New Features

#### New API Endpoint

1. Create route handler in `src/api/routes/`
2. Add service logic in `src/api/services/`
3. Register route in `src/api/main.py`

#### New Tool/Function

1. Implement async function in `src/tools/`
2. Register in `src/tools/registry.py`
3. Add session-aware wrapper if needed in `src/tools/wrappers.py`

#### New MCP Server

```python
# In integrations/mcp_servers.py
new_server = MCPServerStdio(
    params={"command": "npx", "args": ["-y", "@mcp/server-name"]}
)
```

#### New Frontend Component

1. Create component in `electron/renderer/ui/components/`
2. Initialize in appropriate bootstrap phase
3. Wire to EventBus for state updates

---

## Related Documentation

- [Architecture Memory](../.serena/memories/architecture.md)
- [Project Overview Memory](../.serena/memories/project_overview.md)
- [Common Patterns Memory](../.serena/memories/common_patterns.md)
- [Code Style Memory](../.serena/memories/code_style.md)

---

*Generated: 2025-12-14*
*Version: 1.0.0-local*
