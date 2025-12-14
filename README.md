```
   ██████╗██╗  ██╗ █████╗ ████████╗
  ██╔════╝██║  ██║██╔══██╗╚══██╔══╝
  ██║     ███████║███████║   ██║
  ██║     ██╔══██║██╔══██║   ██║
  ╚██████╗██║  ██║██║  ██║   ██║
   ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝

       ██╗██╗   ██╗██╗ ██████╗███████╗██████╗
       ██║██║   ██║██║██╔════╝██╔════╝██╔══██╗
       ██║██║   ██║██║██║     █████╗  ██████╔╝
  ██   ██║██║   ██║██║██║     ██╔══╝  ██╔══██╗
  ╚█████╔╝╚██████╔╝██║╚██████╗███████╗██║  ██║
   ╚════╝  ╚═════╝ ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝

        "Putting the 'Juice' in 'Chatbot'"
```

# Chat Juicer

An Electron + FastAPI desktop application for Azure OpenAI chat interactions using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**, **PostgreSQL persistence**, real-time **WebSocket streaming**, and sophisticated document generation capabilities.

## Quick Start

### All Platforms (Recommended)

```bash
# First time setup
npm run setup           # Install everything and configure
# Edit src/.env with your Azure OpenAI credentials

# Run the application
npm start               # Production mode
npm run dev             # Development mode with DevTools
```

### macOS/Linux (Optional - Using Makefile)

```bash
# First time setup
make setup              # Install everything and configure
# Edit src/.env with your Azure OpenAI credentials

# Run the application
make run                # Production mode
make dev                # Development mode with DevTools

# Get help
make help               # Show all available commands
make health             # Check system configuration
```

**Note**: On Windows, Makefile commands require Git Bash or WSL. The npm scripts work on all platforms natively.

## Features

- **Desktop Application**: Production-grade Electron app with health monitoring and auto-recovery
- **FastAPI Backend**: RESTful API with WebSocket streaming and PostgreSQL persistence
- **Agent/Runner Pattern**: Native OpenAI Agents SDK with automatic tool orchestration
- **MCP Servers**: Sequential Thinking and Fetch servers by default, plus optional Tavily search when configured
- **MCP Server Pool**: Pre-spawned server instances for concurrent request handling
- **PostgreSQL Persistence**: Sessions and messages stored in PostgreSQL with connection pooling
- **Multi-Session Support**: Create, switch, delete sessions with auto-title after first message
- **WebSocket Streaming**: Real-time AI response streaming via `/ws/chat/{session_id}`
- **Function Calling**: Async native tools and MCP integration with session-aware wrappers
- **Structured Logging**: Enterprise-grade JSON logging with rotation and session correlation
- **Azure/OpenAI Integration**: Azure by default with optional base OpenAI provider
- **Token Management**: SDK-level universal token tracking for tool calls and reasoning tokens
- **Full Async Architecture**: Consistent async/await throughout backend
- **Document Generation**: Save generated content to session-scoped output/ with optional backups
- **Editing Tools**: Batch text edits with git-style diffs and whitespace-flexible matching
- **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
- **Component Architecture**: Reusable frontend components with proper state management

## Architecture

Chat Juicer uses a **three-tier architecture** with OpenAI's **Agent/Runner pattern**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Renderer Process                        │
│                    (Component-based ES6 modules)                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC (context isolation)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                            │
│                    (HTTP/WebSocket proxy)                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP REST / WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                         │
│              (PostgreSQL, Agent/Runner, MCP servers)                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Components:
- **FastAPI Backend**: RESTful API with WebSocket streaming at `/ws/chat/{session_id}`
- **PostgreSQL**: Persistent storage for sessions and messages with connection pooling (asyncpg)
- **MCP Server Pool**: Pre-spawned server instances for concurrent request handling
- **Agent/Runner Pattern**: Native MCP server integration with automatic tool orchestration
- **Electron Main Process**: HTTP/WebSocket proxy connecting renderer to FastAPI
- **Frontend**: 7-phase bootstrap, AppState pub/sub, EventBus for message routing
- **UI Components**: ChatContainer, InputArea, FilePanel, ModelSelector, ConnectionStatus
- **Logging**: Enterprise JSON logging with rotation and session correlation
- **Type System**: Full mypy strict compliance, Pydantic validation

## Prerequisites

- Node.js 16+ and npm
- **Python 3.13+** (strictly required for all dependencies)
- **PostgreSQL 14+** with a database created for the application
- Azure OpenAI resource with deployment (e.g., gpt-5-mini, gpt-4o, gpt-4)
- Azure OpenAI API credentials
- Internet connection for MCP server downloads

## Requirements

### Node.js Dependencies
- `electron`: Desktop application framework (devDependency)
- Node.js 16+ and npm required

### Python Dependencies
- **Python 3.13+ required** (strictly enforced for all dependencies)
- Full type safety with mypy strict=true
- See dependencies section below for package list

## Installation

### Quick Setup (Recommended)

The easiest way to get started is using the automated setup:

```bash
# Clone the repository
git clone https://github.com/yourusername/chat-juicer.git
cd chat-juicer

# Run automated setup (works on all platforms)
npm run setup

# Or on macOS/Linux with make installed:
make setup
```

This will:
- Check all prerequisites (Node.js, Python, npm, pip)
- Install Node.js dependencies
- Create Python virtual environment (`.juicer/`)
- Install Python dependencies into the venv
- Install MCP server globally
- Create `.env` from template

After running setup, edit `src/.env` with your Azure OpenAI credentials, then:
- Run `npm start` (or `make run`) to start the application

### Manual Setup

If you prefer manual installation or encounter issues:

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/chat-juicer.git
   cd chat-juicer
   ```

2. **Install Node dependencies**
   ```bash
   npm install
   # Or: make install-node
   ```

3. **Install Python dependencies**
   ```bash
   cd src/
   pip install -r requirements.txt

   # For full document format support (PDF, Word, Excel, etc.):
   pip install 'markitdown[all]'

   # Or use Makefile with venv:
   # cd .. && make install-python
   ```

4. **Install MCP Server (for Sequential Thinking)**
   ```bash
   # Install globally for the Sequential Thinking MCP server
   npm install -g @modelcontextprotocol/server-sequential-thinking
   # Or: make install-mcp
   # If permission denied: sudo make install-mcp
   ```

5. **Configure environment variables**
   ```bash
   cd src/
   cp .env.example .env
   ```

   Edit `.env` with your Azure OpenAI credentials:
   ```env
   AZURE_OPENAI_API_KEY=your-api-key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
   AZURE_OPENAI_DEPLOYMENT=your-deployment-name
   ```

## Usage

### npm Scripts (All Platforms)

The primary interface that works on Windows, macOS, and Linux:

```bash
npm run setup           # First-time setup
npm start               # Run the application
npm run dev             # Development mode with DevTools
npm run inspect         # Debug mode with Node.js inspector
```

### Makefile Commands (macOS/Linux)

Chat Juicer includes a comprehensive Makefile for convenience on Unix systems. Windows users should use npm scripts or install Git Bash/WSL.

Run `make help` or `make` to see all available commands.

#### Setup Commands

```bash
make setup              # Complete first-time setup (essential dependencies only)
make setup-dev          # Complete setup with dev tools (linters, formatters, pre-commit)
make install            # Install all dependencies (Node, Python, MCP)
make install-node       # Install Node.js dependencies only
make install-python     # Install Python dependencies into .juicer venv
make install-mcp        # Install MCP servers (Sequential Thinking + Fetch)
make install-dev        # Install dev dependencies (linters, formatters, pre-commit)
make precommit-install  # Install pre-commit git hooks
```

#### Running the Application

```bash
make run                # Start the application (production mode)
make dev                # Start in development mode (with DevTools)
make backend-only       # Run FastAPI backend only (for testing)
```

**Equivalent npm commands:**
```bash
npm start               # Same as: make run
npm run dev             # Same as: make dev
```

**Direct FastAPI backend:**
```bash
uvicorn api.main:app --host 127.0.0.1 --port 8000  # Run FastAPI server
```

#### Development & Quality

```bash
make test               # Run all tests (alias for test-all)
make test-all           # Run backend + frontend tests
make test-backend       # Run Python tests
make test-frontend      # Run JavaScript tests (vitest)
make test-backend-unit  # Python unit tests only
make test-backend-integration  # Python integration tests only
make test-frontend-unit        # JS unit tests only
make test-frontend-integration # JS integration tests only
make test-frontend-watch       # JS tests in watch mode
make test-frontend-ui          # Open Vitest UI
make test-coverage-backend     # Backend coverage (htmlcov)
make test-coverage-frontend    # Frontend coverage (coverage/index.html)
make test-coverage-all         # Both coverage reports
make validate           # Validate Python code syntax
make lint               # Run ruff linter with auto-fix
make format             # Format code with black
make typecheck          # Run mypy type checking
make fix                # Auto-fix all fixable issues (format + lint with --fix)
make check              # Pre-commit validation gate (format check + lint + typecheck + test)
make precommit          # Run all pre-commit hooks (comprehensive, includes JS/TS)
make quality            # Run format + lint + typecheck (all quality checks)
```

#### Code Generation

```bash
make generate-model-metadata  # Sync renderer model-metadata.js from Python configs
```

#### Documentation

```bash
make docs               # Generate API documentation with Sphinx
make docs-clean         # Clean generated documentation
make docs-serve         # Generate and serve docs at http://localhost:8000
```

#### Logs & Monitoring

```bash
make logs               # Show conversation logs (tail -f, requires jq)
make logs-errors        # Show error logs (tail -f, requires jq)
make logs-all           # Show recent logs from both files
```

#### Database Management

```bash
make db-shell           # Start interactive PostgreSQL shell (psql)
make db-sessions        # List all sessions in database
make db-reset           # Clear all session data (WARNING: destructive)
make db-backup          # Backup database to timestamped archive
make db-restore BACKUP=name  # Restore from backup
```

#### Maintenance

```bash
make clean              # Clean temporary files and logs
make clean-cache        # Clean development cache directories (mypy, ruff, pytest, serena)
make clean-venv         # Remove .juicer virtual environment
make clean-all          # Deep clean (logs + cache + venv + node_modules)
make reset              # Complete reset (clean-all + remove .env)
make kill               # Kill all Chat Juicer processes (nuclear option)
make restart            # Quick restart (kill + sleep + dev)
make update-deps        # Update dependencies (Node.js and Python) + health check
```

#### Code Interpreter Sandbox

```bash
make build-sandbox      # Build sandbox container image for code interpreter
make sandbox-status     # Check sandbox runtime/image availability
make sandbox-test       # Smoke test sandbox execution
```

#### Information

```bash
make health             # Check system health and configuration
make status             # Alias for health check
make help               # Show all available commands
```

### Chat Commands

- Type your message and press Enter to send
- Use standard window controls to close the application

## Project Structure

```
chat-juicer/
├── electron/          # Electron main process and renderer
│   ├── main.js       # Main process, HTTP proxy to FastAPI
│   ├── api-client.js # HTTP client for FastAPI backend
│   ├── preload.js    # Secure context-isolated bridge
│   ├── logger.js     # Structured logging with IPC forwarding
│   ├── config/
│   │   └── main-constants.js
│   └── renderer/     # Component-based renderer (ES modules)
│       ├── index.js              # Entry point
│       ├── bootstrap.js          # 7-phase bootstrap orchestrator
│       ├── adapters/             # DOM, IPC, Storage adapters
│       ├── config/               # constants, colors, model-metadata
│       ├── core/                 # AppState + EventBus
│       ├── managers/             # DOM, file, view managers
│       ├── services/             # Business logic (AppState-backed)
│       ├── handlers/             # Event handlers
│       ├── plugins/              # Plugin registry
│       ├── ui/                   # UI components and renderers
│       ├── viewmodels/           # Data transformation
│       └── utils/                # Utility modules
├── ui/               # Frontend static assets
│   ├── index.html    # Main chat UI
│   └── input.css     # Tailwind CSS source
├── src/              # Python FastAPI backend
│   ├── api/          # FastAPI application
│   │   ├── main.py           # FastAPI app with lifespan, routes, CORS
│   │   ├── dependencies.py   # Dependency injection (DB, services)
│   │   ├── routes/           # API endpoints
│   │   │   ├── auth.py       # Authentication routes
│   │   │   ├── chat.py       # WebSocket chat endpoint
│   │   │   ├── config.py     # Configuration endpoint
│   │   │   ├── files.py      # File management routes
│   │   │   ├── health.py     # Health check endpoint
│   │   │   ├── messages.py   # Message pagination endpoint
│   │   │   └── sessions.py   # Session CRUD routes
│   │   ├── services/         # Business logic
│   │   │   ├── chat_service.py       # Chat streaming with Agent/Runner
│   │   │   ├── session_service.py    # Session management
│   │   │   ├── file_service.py       # File operations
│   │   │   ├── auth_service.py       # Authentication
│   │   │   ├── token_aware_session.py # Token-aware context
│   │   │   └── postgres_session.py   # PostgreSQL session storage
│   │   ├── middleware/       # FastAPI middleware
│   │   │   └── auth.py       # Authentication middleware
│   │   └── websocket/        # WebSocket management
│   │       └── manager.py    # Connection tracking
│   ├── core/         # Core business logic
│   │   ├── agent.py          # Agent/Runner with MCP support
│   │   ├── prompts.py        # System instruction prompts
│   │   └── constants.py      # Pydantic Settings configuration
│   ├── models/       # Pydantic data models
│   │   ├── api_models.py     # API request/response models
│   │   ├── event_models.py   # WebSocket event models
│   │   └── session_models.py # Session metadata models
│   ├── tools/        # Function calling tools (async)
│   │   ├── file_operations.py    # File reading, directory listing
│   │   ├── document_generation.py # Document generation
│   │   ├── text_editing.py       # Text editing operations
│   │   ├── code_interpreter.py   # Sandboxed code execution
│   │   ├── wrappers.py           # Session-aware tool wrappers
│   │   └── registry.py           # Tool registration
│   ├── integrations/ # External integrations
│   │   ├── mcp_servers.py       # MCP server setup
│   │   ├── mcp_pool.py          # MCP server connection pool
│   │   ├── mcp_registry.py      # MCP server registry
│   │   ├── event_handlers.py    # Streaming event handlers
│   │   └── sdk_token_tracker.py # Token tracking
│   └── utils/        # Utility modules
│       ├── logger.py           # Enterprise JSON logging
│       ├── token_utils.py      # Token counting with LRU cache
│       ├── file_utils.py       # File system utilities
│       ├── client_factory.py   # OpenAI client factory
│       └── validation.py       # Input validation
├── data/             # Persistent data storage
│   └── files/        # Session-scoped file storage
├── logs/             # Log files (gitignored)
├── scripts/          # Utility scripts
└── tests/            # Test suites
    ├── backend/      # Python tests (pytest)
    └── frontend/     # JavaScript tests (vitest)
```

### Renderer Runtime Highlights
- 7-phase bootstrap orchestrator (`bootstrap.js`) with validation and degraded-mode recovery
- `AppState` (`core/state.js`) is the single state source for reactive DOM updates
- Global `EventBus` (`core/event-bus.js`) powers decoupled message routing
- Services communicate with backend via IPC adapter which proxies to FastAPI
- Primary UI components: ChatContainer, InputArea, FilePanel, ModelSelector, ConnectionStatus

## Key Components

### Python FastAPI Backend (`src/`)

**FastAPI Application** (`api/`)
- **main.py**: FastAPI app initialization with lifespan management, route registration, CORS
- **dependencies.py**: Dependency injection for DB pool, services, managers

**API Routes** (`api/routes/`)
- **chat.py**: WebSocket endpoint for real-time chat streaming (`/ws/chat/{session_id}`)
- **sessions.py**: Session CRUD operations (create, list, get, update, delete, pin, rename)
- **messages.py**: Message pagination and history retrieval
- **files.py**: File upload and management
- **config.py**: Model and configuration endpoint
- **health.py**: Health check endpoint
- **auth.py**: Authentication routes

**Services** (`api/services/`)
- **chat_service.py**: Chat streaming with Agent/Runner orchestration and interrupt handling
- **session_service.py**: Session management with PostgreSQL persistence
- **file_service.py**: File operations with session-scoped storage
- **auth_service.py**: Authentication service
- **token_aware_session.py**: Token-aware context management for summarization
- **postgres_session.py**: PostgreSQL session storage adapter

**Core Business Logic** (`core/`)
- **agent.py**: Agent/Runner implementation with MCP server integration
- **prompts.py**: System instruction prompts and templates
- **constants.py**: Pydantic Settings configuration

**Data Models** (`models/`)
- **api_models.py**: Pydantic models for API requests/responses
- **event_models.py**: WebSocket event models
- **session_models.py**: Session metadata models

**Tools** (`tools/`)
- **file_operations.py**: Directory listing and file reading with markitdown support
- **document_generation.py**: Document generation with session-scoped output
- **text_editing.py**: Text, regex, and insert editing operations
- **code_interpreter.py**: Sandboxed code execution
- **wrappers.py**: Session-aware wrappers enforcing sandbox `data/files/{session_id}`
- **registry.py**: Tool registration and discovery

**Integrations** (`integrations/`)
- **mcp_servers.py**: MCP server setup (Sequential Thinking, Fetch, optional Tavily)
- **mcp_pool.py**: MCP server connection pool for concurrent requests
- **mcp_registry.py**: MCP server registry and discovery
- **event_handlers.py**: Streaming event handlers for Agent/Runner pattern
- **sdk_token_tracker.py**: Universal token tracking via SDK monkey-patching

**Utilities** (`utils/`)
- **logger.py**: Enterprise JSON logging with rotation and session correlation
- **token_utils.py**: Token counting with LRU caching
- **file_utils.py**: File system utilities
- **client_factory.py**: Azure OpenAI client factory
- **validation.py**: Input validation and sanitization

### Electron Frontend (`electron/`)

**Main Process**
- **main.js**: Main process with HTTP/WebSocket proxy to FastAPI, health monitoring
- **api-client.js**: HTTP client for FastAPI backend communication
- **preload.js**: Secure context-isolated bridge between main and renderer processes
- **logger.js**: Centralized logging with IPC forwarding from renderer to main process

**Renderer Process** (`electron/renderer/`) - Component-based ES6 architecture
- **index.js**: Main entry point orchestrating all renderer modules
- **bootstrap.js**: Renderer initialization and setup
- **adapters/**: Platform abstraction layer
  - **DOMAdapter.js**: DOM manipulation abstraction
  - **IPCAdapter.js**: IPC communication abstraction
  - **StorageAdapter.js**: Local storage abstraction
  - **index.js**: Adapter exports
- **config/**: Configuration management
  - **constants.js**: Centralized configuration values (timeouts, limits, delimiters)
  - **model-metadata.js**: Model configuration and metadata
- **core/**: Core framework
  - **event-bus.js**: Event-driven messaging system
  - **state.js**: BoundedMap memory management and AppState pub/sub
- **ui/components/**: Reusable UI components
  - **chat-container.js**: Message container component with scroll management
  - **connection-status.js**: Real-time connection status indicator
  - **file-panel.js**: File management with handle cleanup for safe session deletion
  - **input-area.js**: Chat input field with send controls and file upload
  - **model-selector.js**: Model and reasoning effort selection (shared: welcome + chat)
  - **index.js**: Component exports for clean imports
- **ui/renderers/**: Specialized rendering utilities
  - **file-list-renderer.js**: File list visualization with metadata
  - **function-card-renderer.js**: Function call card rendering
  - **message-renderer.js**: Message formatting with markdown support
  - **session-list-renderer.js**: Session list with metadata display
  - **index.js**: Renderer exports
- **ui/**: Top-level UI modules
  - **chat-ui.js**: Main chat interface
  - **function-card-ui.js**: Function call visualization
  - **welcome-page.js**: Welcome screen component
  - **titlebar.js**: Custom window titlebar
- **handlers/**: Event handlers
  - **message-handlers-v2.js**: EventBus-integrated message handlers for streaming events
  - **session-list-handlers.js**: Session list interactions with proper cleanup
  - **chat-events.js**: Chat-specific event handlers
  - **file-events.js**: File upload/management event handlers
  - **session-events.js**: Session lifecycle event handlers
  - **index.js**: Handler exports
- **services/**: Business logic services
  - **session-service.js**: Session CRUD operations
  - **message-queue-service.js**: Renderer message queueing/backpressure control
  - **message-service.js**: Message processing and formatting
  - **file-service.js**: File operations and management
  - **function-call-service.js**: Function call handling
  - **stream-manager.js**: Stream lifecycle coordination for agent responses
  - **index.js**: Service exports
- **managers/**: UI state managers
  - **view-manager.js**: View state management (welcome vs chat)
  - **file-manager.js**: File operations and drag-and-drop handling
  - **dom-manager.js**: DOM element lifecycle management
  - **theme-manager.js**: Theme and dark mode management
- **plugins/**: Plugin architecture
  - **plugin-interface.js**: Plugin interface definition
  - **core-plugins.js**: Core plugin implementations
  - **index.js**: Plugin exports
- **viewmodels/**: View models for data presentation
  - **message-viewmodel.js**: Message data transformation
  - **session-viewmodel.js**: Session data transformation
- **utils/**: Utility functions
  - **markdown-renderer.js**: Markdown rendering with syntax highlighting
  - **scroll-utils.js**: Scroll behavior management
  - **json-cache.js**: JSON parsing cache with LRU eviction
  - **toast.js**: Toast notification system
  - **file-utils.js**: File handling utilities
  - **chat-model-updater.js**: Model configuration update utilities
  - **lottie-color.js**: Lottie animation color utilities
  - **file-icon-colors.js**: File icon color mapping helpers
  - **upload-progress.js**: Upload progress state helpers
  - **css-variables.js**: Semantic CSS tokens
  - **state-migration.js**: Client-side state migration helpers
  - **analytics/**: Analytics and tracking

## Function Calling

The application supports both native functions and MCP server tools:

### Native Functions (Async)
- **list_directory**: Directory listing with metadata (size, modified time, file count)
- **read_file**: File reading with automatic format conversion via markitdown (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON, images) and optional head/tail previews
- **search_files**: Glob search with configurable max results
- **edit_file**: Batch text edits with git-style diff output and whitespace-flexible matching (auto-prefixes `output/` unless scoped)
- **generate_document**: Save generated content to `output/` with optional backups and session sandboxing
- **code_interpreter**: Sandboxed code execution with guarded environment
- **Session-aware wrappers**: All file/doc tools are wrapped to `data/files/{session_id}` via `wrappers.py`

### MCP Server Integration
- **Sequential Thinking** (Node.js): Advanced multi-step reasoning with revision capabilities and hypothesis testing
- **Fetch Server** (Python): HTTP/HTTPS web content retrieval with automatic format handling
- **Tavily Search** (Node.js): Optional web search MCP server when `TAVILY_API_KEY` is configured
- Extensible via `integrations/mcp_registry.py`

### Features
- Session-aware tool wrappers (`tools/wrappers.py`) enforce workspace isolation (data/files/{session_id})
- SDK-level universal token tracking for all tools (native + MCP)
- Exact token counting using tiktoken with LRU caching
- Accumulated tool token tracking separate from conversation tokens

Add new functions by:
1. Implementing in the appropriate `src/tools/*.py` module
2. Registering in `tools/registry.py` (`AGENT_TOOLS` + `FUNCTION_REGISTRY`)
3. If session-scoped, exposing a wrapped version via `create_session_aware_tools()` so session_id is injected automatically

## Logging

Structured logs are automatically generated in `logs/`:
- **conversations.jsonl**: Complete conversation history with session_id, token usage, functions, and metadata
- **errors.jsonl**: Error tracking and debugging information
- **IPC Logging**: Renderer process logs are forwarded through main process for centralized logging
- **Token Tracking**: All operations log exact token counts for cost and usage analysis

## Development

### Getting Started with Development

```bash
# Check system health
make health

# Start development mode (with DevTools)
make dev

# Watch logs in another terminal
make logs
```

### Code Quality Tools

The project uses pre-commit hooks to ensure code quality.

**Quick Setup with Makefile (Recommended):**
```bash
make install-dev        # Install all dev tools (ruff, black, mypy, pre-commit)
                        # Automatically installs pre-commit hooks

# Run quality checks:
make quality            # Run all checks (format + lint + typecheck)
make precommit          # Run pre-commit hooks on all files
make format             # Format code with black
make lint               # Lint with ruff (auto-fix)
make typecheck          # Type check with mypy
```

**Manual Installation:**
```bash
# Install development tools
pip install -r requirements-dev.txt

# Install pre-commit hooks
pre-commit install
# Or: make precommit-install
```

**Running Quality Checks:**

Now code quality checks run automatically on `git commit`. To run manually:

```bash
# Using Makefile (recommended):
make quality            # Run all checks at once
make precommit          # Run pre-commit hooks on all files

# Using pre-commit directly:
pre-commit run --all-files

# Or run individual tools:
make format             # black src/
make lint               # ruff check src/ --fix
make typecheck          # mypy src/
```

### Adding New Features

1. **Backend changes**: Modify Python files in `src/`
2. **Frontend changes**: Update Electron files in `electron/` and `ui/`
3. **Function additions**: Extend appropriate modules in `src/tools/`

### Testing

Using Makefile (recommended):
```bash
# Syntax validation and compilation
make test

# Run FastAPI backend only
make backend-only

# Full app with DevTools
make dev
```

Manual testing workflow:
```bash
# Syntax validation
python -m py_compile src/api/main.py

# Run FastAPI backend
cd src && uvicorn api.main:app --reload

# Test Electron app
npm start
```

### Maintenance Workflows

**Clean up development environment:**
```bash
make clean              # Remove logs and caches
make clean-venv         # Remove Python venv
make clean-all          # Deep clean everything
```

**Reset for fresh start:**
```bash
make reset              # Complete reset (removes .env too)
make setup              # Reconfigure from scratch
```

**Check configuration:**
```bash
make health             # Verify all dependencies and config
```

## Features in Detail

### Session Management & Persistence

The application uses **PostgreSQL** for session and message persistence with connection pooling (asyncpg).

#### PostgreSQL Architecture

**Sessions Table**
- Session metadata including title, model configuration, timestamps
- Tracks message counts, token usage, and MCP server configuration
- Supports pinning sessions for quick access

**Messages Table**
- Complete conversation history with role, content, and metadata
- Supports pagination for efficient session switching
- Indexed by session_id and created_at for fast queries

#### Session Features

- **Multi-Session Support**: Create, switch, update, delete, pin sessions
- **Persistent Storage**: All data stored in PostgreSQL
- **Token-Aware Management**: Tracks token usage for context management
- **Auto Titles**: Generates titles after first user message (non-blocking)
- **Pagination**: Efficient message loading with offset/limit

#### API Endpoints

**Session Management** (`/api/sessions/`)
- `POST /` - Create new session
- `GET /` - List sessions with pagination
- `GET /{id}` - Get session details
- `PATCH /{id}` - Update session (rename, pin, config)
- `DELETE /{id}` - Delete session

**Chat** (`/ws/chat/{session_id}`)
- WebSocket endpoint for real-time chat streaming
- Supports interruption via WebSocket messages
- Streams agent responses, tool calls, and reasoning

**Messages** (`/api/messages/`)
- `GET /{session_id}` - Get messages with pagination

#### Connection Pooling

The application uses asyncpg connection pooling for efficient database access:
```python
app.state.db_pool = await asyncpg.create_pool(
    dsn=settings.database_url,
    min_size=2,
    max_size=10,
)
```

### Rate Limiting & Error Handling
The application includes robust error handling:
- Streaming error handling for rate limits, connection issues, and API status errors
- Binary protocol V2 negotiation fallback with helpful error messaging
- Structured logging of exceptions with session context

### Token Counting & Optimization
Using tiktoken for exact token counting:
- Precise token counts for all content (not estimates)
- Automatic document summarization when `read_file` content exceeds the configured threshold
- Model-aware encoding (supports GPT-5 family, GPT-4.1/4o, GPT-3.5)
- Utilities centralized in `utils/token_utils.py`

### Code Organization
Recent improvements for better maintainability:
- **Utilities clarity**: Token helpers in `utils/token_utils.py`, validation in `utils/validation.py`, file helpers in `utils/file_utils.py`
- **Centralized constants**: All configuration values in `core/constants.py`
- **Clean separation**: Each module has a single, clear responsibility
- **Type hints**: Improved type annotations throughout the codebase

## Configuration

### Environment Variables

- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key (required)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL (required)
- `AZURE_OPENAI_DEPLOYMENT`: Deployment name (defaults to "gpt-5-mini" if not set)
- `AZURE_OPENAI_API_VERSION`: API version (optional, defaults to "2024-10-01-preview")
- `DATABASE_URL`: PostgreSQL connection string (required, e.g., `postgresql://user:pass@localhost:5432/chatjuicer`)

### Python Dependencies

**Required** (Python 3.13+, from `src/requirements.txt`):
- `fastapi>=0.109.0`: Modern async web framework
- `uvicorn>=0.27.0`: ASGI server for FastAPI
- `asyncpg>=0.29.0`: Async PostgreSQL driver with connection pooling
- `openai>=1.0.0`: Azure OpenAI client library (AsyncOpenAI)
- `openai-agents>=0.3.3`: Agent/Runner framework with MCP support
- `markitdown[all]>=0.1.0`: Document conversion to markdown (PDF, Word, Excel, HTML, CSV, JSON, images)
- `tiktoken>=0.5.0`: OpenAI's official token counting library for exact token counts
- `python-json-logger>=2.0.0`: Structured JSON logging with rotation and session correlation
- `python-dotenv>=1.0.0`: Environment variable management (.env file loading)
- `httpx>=0.25.0`: Modern HTTP client (dependency of openai library)
- `aiofiles>=23.0.0`: Async file operations for non-blocking I/O
- `pydantic>=2.5.0`: Runtime data validation with type hints
- `pydantic-settings>=2.0.0`: Settings management with environment variables
- `mcp-server-fetch>=2025.4.0`: MCP server for HTTP/web content retrieval

### Node.js Dependencies

**Production** (from `package.json`):
- `marked`: Markdown parser
- `marked-footnote`: Footnote support for marked
- `dompurify`: HTML sanitization for security
- `highlight.js`: Syntax highlighting for code blocks
- `katex`: Math rendering (LaTeX support)
- `mermaid`: Diagram rendering from text

**Development**:
- `electron`: Desktop application framework
- `vite`: Build tool and dev server (v7.x)
- `@tailwindcss/vite`: Tailwind CSS 4.x integration
- `@tailwindcss/typography`: Typography plugin for prose content
- `@biomejs/biome`: JavaScript/TypeScript linter and formatter

**MCP Servers** (npm global):
- `@modelcontextprotocol/server-sequential-thinking`: Sequential reasoning MCP server

## Troubleshooting

### Quick Diagnosis

```bash
make health             # Check system health and configuration
make logs-errors        # View error logs
make test               # Validate Python syntax
```

### Common Issues

1. **"API key not found" error**
   - Ensure `.env` file exists in `src/` directory
   - Verify `AZURE_OPENAI_API_KEY` is set correctly
   - Check configuration: `make health`

2. **Connection errors**
   - Check `AZURE_OPENAI_ENDPOINT` format (must include `https://`)
   - Verify network connectivity to Azure
   - View errors: `make logs-errors`

3. **PostgreSQL connection errors**
   - Ensure PostgreSQL is running: `pg_isready`
   - Verify `DATABASE_URL` in `.env` is correct
   - Check database exists: `psql -d chatjuicer -c '\dt'`
   - Ensure user has proper permissions

4. **Python not found or wrong version**
   - Ensure Python 3.13+ is installed and in PATH
   - Check: `python3 --version` (must show 3.13 or higher)
   - Install Python 3.13+ from https://www.python.org/downloads/
   - Use virtual environment: `make install-python`

5. **Electron window doesn't open**
   - Check Node.js version (requires 16+): `node --version`
   - Reinstall dependencies: `make install-node` or `npm install`
   - Try development mode: `make dev`

6. **MCP server not working**
   - Verify installation: `which server-sequential-thinking`
   - Reinstall: `make install-mcp` or `sudo make install-mcp`
   - Check global npm packages: `npm list -g --depth=0`

7. **Virtual environment issues**
   - Remove and recreate: `make clean-venv && make install-python`
   - Verify `.juicer/` directory exists after install

8. **Build/syntax errors**
   - Run validation: `make test`
   - Check Python files: `make validate`
   - View full error output

### Clean Install

If you encounter persistent issues, try a complete reset:

```bash
make reset              # Clean everything including .env
make setup              # Fresh installation
# Reconfigure src/.env with credentials
make run                # Test the application
```

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/) and [FastAPI](https://fastapi.tiangolo.com/)
- Powered by [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- Uses the [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) for Agent/Runner pattern
- Database persistence with [PostgreSQL](https://www.postgresql.org/) and [asyncpg](https://github.com/MagicStack/asyncpg)
