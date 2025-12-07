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

An Electron + Python desktop application for Azure OpenAI chat interactions using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**, advanced **token-aware session management** with automatic summarization, and sophisticated document generation capabilities.

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

- 🖥️ **Desktop Application**: Production-grade Electron app with health monitoring and auto-recovery
- 🤖 **Agent/Runner Pattern**: Native OpenAI Agents SDK with automatic tool orchestration
- 🧠 **MCP Servers**: Sequential Thinking and Fetch servers by default, plus optional Tavily search when configured
- 💾 **Two-Layer Session Persistence**: Token-aware Layer 1 (LLM context) and full-history Layer 2 for UI
- 🔄 **Multi-Session Support**: Lazy session creation, switch, delete, and auto-title after the first user message
- 📊 **Smart Session Management**: TokenAwareSQLiteSession auto-summarizes at 20% of model limits while keeping the last 2 user turns
- ⚡ **Streaming Responses**: Real-time AI response streaming with structured event handling and function argument deltas
- 🛠️ **Function Calling**: Async native tools and MCP integration with session-aware wrappers
- 📝 **Structured Logging**: Enterprise-grade JSON logging with rotation and session correlation
- 🔐 **Azure/OpenAI Integration**: Azure by default with optional base OpenAI provider
- 📊 **Token Management**: SDK-level universal token tracking that counts tool calls and reasoning tokens automatically
- ⚡ **Full Async Architecture**: Consistent async/await throughout backend
- 📄 **Document Generation**: Save generated content to session-scoped output/ with optional backups
- 🔧 **Editing Tools**: Batch text edits with git-style diffs and whitespace-flexible matching
- 🎯 **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
- 🧩 **Component Architecture**: Reusable frontend components with proper state management
- 🏗️ **Production Features**: Memory management, error recovery, performance optimization, file handle cleanup

## Architecture

Chat Juicer uses OpenAI's **Agent/Runner pattern** with a **two-layer persistence architecture**:
- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Layered Persistence**: Separates LLM context (Layer 1) from UI display (Layer 2)
- **Multi-Session Management**: Create, switch, and manage multiple conversation sessions
- **Token-Aware Sessions**: SQLite-based session management with automatic summarization
- **Full Async Architecture**: Consistent async/await for Agent/Runner, MCP servers, and all functions
- **Streaming Events**: Structured event handling for real-time responses
- **Smart State Management**: Session handles conversation context with token tracking
- **SDK-Level Token Tracking**: Universal token tracking via elegant monkey-patching

### Key Architectural Components:
- **Backend**: Python with async functions, Pydantic models, type safety (mypy strict=true)
- **Frontend**: Electron renderer built around a 7-phase bootstrap (`bootstrap.js`) that wires adapters → AppState/DOM → services → UI components → event handlers → plugins → initial data
- **State & Events (Frontend)**: `AppState` pub/sub in `core/state.js` (connection/session/message/ui/file/function namespaces) + global `EventBus` with error boundaries for message routing
- **UI Components**: ChatContainer (streaming-safe), InputArea (model selector integration), FilePanel (tabbed sources/output with handle cleanup), ModelSelector (shared welcome/chat), ConnectionStatus
- **Persistence**: Two-layer SQLite architecture (LLM context + UI display)
- **Session**: TokenAwareSQLiteSession with 20% threshold auto-summarization
- **Session Manager**: Multi-session lifecycle management with metadata persistence and file handle cleanup
- **Logging**: Enterprise JSON logging with rotation and session correlation
- **Type System**: Protocols for SDK integration, Pydantic for validation, TypedDict for data
- **Resource Management**: Garbage collection, file handle cleanup, and increased descriptor limits (256→4096)

## Prerequisites

- Node.js 16+ and npm
- **Python 3.13+** (strictly required for all dependencies)
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
make backend-only       # Run Python backend only (for testing)
```

**Equivalent npm commands:**
```bash
npm start               # Same as: make run
npm run dev             # Same as: make dev
```

**Direct Python backend:**
```bash
python src/main.py      # Same as: make backend-only
```

#### Development & Quality

```bash
make test               # Run syntax validation and tests
make validate           # Validate Python code syntax
make lint               # Run ruff linter with auto-fix
make format             # Format code with black
make typecheck          # Run mypy type checking
make fix                # Auto-fix all fixable issues (format + lint with --fix)
make check              # Pre-commit validation gate (format check + lint + typecheck + test)
make precommit          # Run all pre-commit hooks (comprehensive, includes JS/TS)
make quality            # Run format + lint + typecheck (all quality checks)
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

#### Database Exploration

```bash
make db-explore         # Show database exploration help
make db-sessions        # List all sessions in database
make db-compare         # Compare Layer 1 vs Layer 2 for current session
make db-layer1          # Show Layer 1 (LLM context) for current session
make db-layer2          # Show Layer 2 (UI display) for current session
make db-tools           # Show all tool calls for current session
make db-types           # Show SDK item type distribution
make db-shell           # Start interactive SQLite shell
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
│   ├── main.js       # Main process, IPC handlers, health monitoring
│   ├── preload.js    # Secure context-isolated bridge
│   ├── logger.js     # Structured logging with IPC forwarding
│   ├── config/
│   │   └── main-constants.js
│   └── renderer/     # Renderer (ES modules)
│       ├── index.js              # Entry point (imports CSS + bootstrapSimple)
│       ├── bootstrap.js          # 7-phase bootstrap orchestrator
│       ├── bootstrap/            # Phase orchestration + validation
│       │   ├── error-recovery.js
│       │   ├── validators.js
│       │   └── phases/
│       │       ├── phase1-adapters.js      # DOM/IPС/Storage adapters + global EventBus
│       │       ├── phase2-state-dom.js     # AppState + DOM element registry
│       │       ├── phase3-services.js      # Message/File/FunctionCall/Session services (AppState-backed)
│       │       ├── phase4-components.js    # ChatContainer, InputArea, FilePanel wiring
│       │       ├── phase5-event-handlers.js# DOM listeners, AppState bindings, IPC wiring
│       │       ├── phase6-plugins.js       # Plugin registry + core plugins
│       │       └── phase7-data-loading.js  # Renderer-ready signal, model metadata, sessions
│       ├── adapters/             # Platform abstraction
│       │   ├── DOMAdapter.js
│       │   ├── IPCAdapter.js
│       │   ├── StorageAdapter.js
│       │   └── index.js
│       ├── config/
│       │   ├── constants.js
│       │   ├── colors.js
│       │   └── model-metadata.js
│       ├── core/
│       │   ├── component-lifecycle.js
│       │   ├── event-bus.js      # Global EventBus (pub/sub with error boundaries)
│       │   ├── lifecycle-manager.js
│       │   └── state.js          # AppState + BoundedMap (connection/session/message/file/ui)
│       ├── managers/
│       │   ├── dom-manager.js    # Element registry
│       │   ├── file-manager.js   # File list rendering + AppState migration helpers
│       │   └── view-manager.js   # Welcome/chat view transitions + model config sync
│       ├── services/
│       │   ├── file-service.js
│       │   ├── function-call-service.js
│       │   ├── message-service.js
│       │   └── session-service.js
│       ├── handlers/
│       │   ├── message-handlers-v2.js      # EventBus-driven streaming + tool cards
│       │   ├── session-list-handlers.js    # Session list delegation
│       │   ├── chat-events.js
│       │   ├── file-events.js
│       │   └── session-events.js
│       ├── plugins/
│       │   ├── core-plugins.js
│       │   ├── index.js
│       │   └── plugin-interface.js
│       ├── ui/
│       │   ├── components/
│       │   │   ├── chat-container.js
│       │   │   ├── connection-status.js
│       │   │   ├── file-panel.js
│       │   │   ├── input-area.js
│       │   │   └── model-selector.js
│       │   ├── renderers/
│       │   │   ├── index.js
│       │   │   └── session-list-renderer.js
│       │   ├── chat-ui.js
│       │   ├── function-card-ui.js
│       │   ├── titlebar.js
│       │   ├── welcome-page.js
│       │   └── utils/welcome-animations.js
│       ├── viewmodels/
│       │   ├── message-viewmodel.js
│       │   └── session-viewmodel.js
│       └── utils/
│           ├── analytics/
│           ├── chat-model-updater.js
│           ├── css-variables.js
│           ├── file-utils.js
│           ├── json-cache.js
│           ├── lottie-color.js
│           ├── markdown-renderer.js
│           ├── scroll-utils.js
│           ├── state-migration.js
│           └── toast.js
├── ui/               # Frontend static assets
│   ├── index.html    # Main chat UI (loads renderer/index.js as ES6 module)
│   ├── input.css     # Tailwind CSS source
│   ├── chat-juicer-logo-real.svg  # Application logo
│   └── smoke-loading.svg       # Loading animation
├── src/              # Python backend (modular architecture)
│   ├── main.py       # Application entry point (pure orchestrator - 174 lines)
│   ├── __init__.py   # Package initialization
│   ├── .env.example  # Environment variable template
│   ├── requirements.txt  # Python dependencies
│   ├── app/          # Application modules (orchestrator pattern)
│   │   ├── __init__.py
│   │   ├── state.py          # AppState dataclass (single source of truth)
│   │   ├── bootstrap.py      # Application initialization and configuration
│   │   └── runtime.py        # Core runtime operations (session, message handling)
│   ├── core/         # Core business logic
│   │   ├── __init__.py
│   │   ├── agent.py            # Agent/Runner implementation with MCP support
│   │   ├── session.py          # TokenAwareSQLiteSession with auto-summarization (Layer 1)
│   │   ├── full_history.py     # FullHistoryStore for UI display (Layer 2)
│   │   ├── session_manager.py  # Multi-session lifecycle management
│   │   ├── session_commands.py # Session command handlers
│   │   ├── prompts.py          # System instruction prompts
│   │   └── constants.py        # Configuration with Pydantic Settings validation
│   ├── models/       # Data models and type definitions
│   │   ├── __init__.py
│   │   ├── api_models.py      # Pydantic models for API responses
│   │   ├── event_models.py    # Event and message models for IPC
│   │   ├── ipc_models.py      # IPC message models
│   │   ├── sdk_models.py      # Protocol typing for SDK integration
│   │   └── session_models.py  # Session metadata and persistence models
│   ├── tools/        # Function calling tools
│   │   ├── __init__.py
│   │   ├── document_generation.py # Document generation from templates
│   │   ├── file_operations.py     # File reading and directory listing
│   │   ├── text_editing.py        # Text, regex, and insert editing operations
│   │   ├── wrappers.py            # Tool wrapper utilities
│   │   └── registry.py            # Tool registration and discovery
│   ├── integrations/ # External integrations
│   │   ├── __init__.py
│   │   ├── mcp_servers.py        # MCP server setup and management
│   │   ├── mcp_registry.py       # MCP server registry and discovery
│   │   ├── event_handlers.py     # Streaming event handlers
│   │   └── sdk_token_tracker.py  # SDK-level universal token tracking via monkey-patching
│   └── utils/        # Utility modules
│       ├── __init__.py
│       ├── logger.py            # Enterprise JSON logging with rotation and session correlation
│       ├── ipc.py               # IPC manager with pre-cached templates
│       ├── token_utils.py       # Token management with LRU caching
│       ├── file_utils.py        # File system utility functions
│       ├── document_processor.py # Document processing and optimization utilities
│       ├── json_utils.py        # JSON parsing and formatting utilities
│       ├── http_logger.py       # HTTP request logging middleware
│       ├── client_factory.py    # Azure OpenAI client factory and configuration
│       ├── validation.py        # Input validation and sanitization
│       └── session_integrity.py # Session integrity validation
├── templates/        # Document templates with {{placeholders}}
├── data/             # Persistent data storage
│   ├── chat_history.db       # SQLite database (Layer 1 & Layer 2)
│   └── sessions.json         # Session metadata (title, timestamps, counts)
├── logs/             # Log files (gitignored)
│   ├── conversations.jsonl  # Structured conversation logs with token metadata
│   └── errors.jsonl  # Error and debugging logs
├── scripts/          # Utility scripts
│   ├── explore-db.sh         # Database exploration tool
│   ├── setup.js              # Automated setup script
│   ├── launch.js             # Application launcher
│   ├── validate.js           # Validation utilities
│   ├── python-manager.js     # Python environment management
│   └── platform-config.js    # Platform detection and configuration
├── claudedocs/       # Claude-specific documentation
│   └── SETUP_ANALYSIS.md     # Setup system analysis and troubleshooting
└── docs/             # Documentation (Sphinx)
    ├── _build/       # Generated HTML documentation
    ├── modules/      # Module documentation
    ├── conf.py       # Sphinx configuration
    └── index.rst     # Documentation index
```

### Renderer Runtime Highlights
- 7-phase bootstrap orchestrator (`bootstrap.js`) with validation and degraded-mode recovery (adapters → AppState/DOM → services → components → event handlers → plugins → initial data).
- `AppState` (`core/state.js`) is the single state source (connection/session/message/ui/file/function); components subscribe for reactive DOM updates.
- Global `EventBus` (`core/event-bus.js`) powers decoupled message routing; `message-handlers-v2.js` maps backend events to chat streaming, function cards, and analytics.
- Services (`session-service.js`, `file-service.js`, `function-call-service.js`, `message-service.js`) are pure business logic and require `appState` (no DOM access).
- Primary UI components: ChatContainer (streaming-aware), InputArea (model selector integration), FilePanel (sources/output tabs + handle cleanup), ModelSelector (shared welcome/chat), ConnectionStatus.
- View management: `view-manager.js` controls welcome ↔ chat transitions and seeds ModelSelector; `file-manager.js` is migrating to AppState-driven rendering via `loadFilesIntoState` + `renderFileList`.

## Key Components

### Python Backend (`src/`)

**Entry Point**
- **main.py**: Pure orchestrator (174 lines) - bootstrap → loop → cleanup pattern
- **__init__.py**: Package initialization

**Application Modules** (`app/`)
- **state.py**: AppState dataclass - single source of truth for application state
- **bootstrap.py**: Application initialization, environment loading, MCP server setup
- **runtime.py**: Core runtime operations (8 functions for message processing, session management)

**Core Business Logic** (`core/`)
- **agent.py**: Agent/Runner implementation with MCP server integration and streaming event handling
- **session.py**: TokenAwareSQLiteSession with automatic summarization and layered persistence (Layer 1)
- **full_history.py**: FullHistoryStore for complete UI-facing conversation history (Layer 2)
- **session_manager.py**: Session lifecycle management with metadata persistence, file handle cleanup
- **session_commands.py**: Session command handlers (create, switch, delete, list)
- **prompts.py**: System instruction prompts and templates
- **constants.py**: Centralized configuration with Pydantic Settings validation

**Data Models** (`models/`)
- **api_models.py**: Pydantic models for API responses and function returns
- **event_models.py**: Event and message models for IPC communication
- **ipc_models.py**: IPC message structure models
- **sdk_models.py**: Protocol definitions for type-safe SDK integration
- **session_models.py**: Session metadata and persistence models

**Tools** (`tools/`)
- **document_generation.py**: Template-based document generation with placeholder replacement
- **file_operations.py**: Directory listing and file reading with markitdown support
- **text_editing.py**: Text, regex, and insert editing operations
- **wrappers.py**: Tool wrapper utilities for consistent interface
- **registry.py**: Tool registration and discovery system

**Integrations** (`integrations/`)
- **mcp_servers.py**: MCP server setup and management (Sequential Thinking, Fetch)
- **mcp_registry.py**: MCP server registry and discovery
- **event_handlers.py**: Streaming event handlers for Agent/Runner pattern
- **sdk_token_tracker.py**: Universal token tracking via SDK monkey-patching

**Utilities** (`utils/`)
- **logger.py**: Enterprise JSON logging with rotation and session correlation
- **ipc.py**: IPC manager with pre-cached templates for performance
- **token_utils.py**: Token management utilities with LRU caching
- **file_utils.py**: File system utility functions
- **document_processor.py**: Document processing and optimization utilities
- **json_utils.py**: JSON parsing and formatting utilities
- **http_logger.py**: HTTP request logging middleware
- **client_factory.py**: Azure OpenAI client factory and configuration
- **validation.py**: Input validation and sanitization
- **session_integrity.py**: Session integrity validation

**Configuration**
- **.env.example**: Environment variable template
- **requirements.txt**: Python dependencies (Python 3.13+ required)

### Electron Frontend (`electron/`)

**Main Process**
- **main.js**: Main process with health monitoring (5-min intervals), auto-recovery, graceful shutdown
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
  - **message-service.js**: Message processing and formatting
  - **file-service.js**: File operations and management
  - **function-call-service.js**: Function call handling
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
  - **analytics/**: Analytics and tracking
  - **debug/**: Debugging utilities
  - **performance/**: Performance monitoring and profiling

## Function Calling

The application supports both native functions and MCP server tools:

### Native Functions (Async)
- **list_directory**: Directory listing with metadata (size, modified time, file count)
- **read_file**: File reading with automatic format conversion via markitdown (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON, images) and optional head/tail previews
- **search_files**: Glob search with configurable max results
- **edit_file**: Batch text edits with git-style diff output and whitespace-flexible matching (auto-prefixes `output/` unless scoped)
- **generate_document**: Save generated content to `output/` with optional backups and session sandboxing

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

# Run backend only
make backend-only

# Full app with DevTools
make dev
```

Manual testing workflow:
```bash
# Syntax validation
python -m py_compile src/main.py

# Run backend tests
python src/main.py

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

The application features advanced session management with **two-layer persistence architecture**:

#### Layered Persistence Architecture

**Layer 1 (LLM Context - SQLiteSession)**
- Complete SDK state including tool calls, reasoning items, and internal structures
- Stored in `data/chat_history.db` (agent_sessions / agent_messages tables)
- Token-aware auto-summarization triggers at 20% of the model limit (per MODEL_TOKEN_LIMITS)
- Keeps the last 2 user exchanges unsummarized and repopulates context after summarization
- Metadata is always updated in a `finally` block to prevent desync

**Layer 2 (UI Display - FullHistoryStore)**
- User-facing conversation history (user/assistant/system messages only)
- Filtered to exclude SDK internal items (tool_call_item, reasoning_item, etc.)
- Stored in a single shared `full_history` table keyed by session_id
- Best-effort writes (Layer 1 is source of truth); never summarized
- Optimized for UI rendering and paginated session switching

#### Session Features

- **Lazy Init**: Sessions are created on first message or upload; welcome view uses `clear` to reset
- **Multi-Session Support**: Create, switch, update, and delete conversation sessions
- **Persistent Storage**: Both layers survive application restarts
- **Token-Aware Summarization**: Automatically summarizes Layer 1 at 20% of model limit; also checked post-run to account for tool tokens
- **Model-Aware Limits**: GPT-5 family (272k), GPT-4.1/4o (128k), GPT-3.5 (15.3k)
- **Context Preservation**: Keeps last 2 user-assistant exchanges unsummarized
- **Seamless Switching**: SessionBuilder restores context and paginates Layer 2
- **Tool Token Tracking**: SDK-level tracker counts tool/reasoning/handoff tokens separately
- **Metadata Hygiene**: Startup sync fixes stale message counts; cleanup removes empty sessions >24h while protecting sessions with DB messages or files
- **Auto Titles**: Generates a title after the first user message (non-blocking)

#### Session Commands

The application includes IPC-based session management:
- **Create**: Start new conversation sessions with automatic titles
- **Switch**: Change active session and restore full conversation history
- **List**: View all available sessions with metadata
- **Delete**: Remove sessions and clean up both persistence layers (with automatic file handle cleanup to prevent "too many open files" errors)
- **Summarize**: Manually trigger conversation summarization
- **Load More**: Paginate Layer 2 history
- **Clear**: Clear current session to return to lazy-init welcome state
- **Update Config**: Change per-session model, MCP servers, or reasoning effort and recreate the agent

#### Session Deletion Reliability

The application includes robust session deletion with a 3-layer defense against file handle exhaustion:
1. **Frontend Cleanup**: FilePanel closes all file handles before deletion request
2. **Backend Garbage Collection**: Forces Python GC with 50ms delay before directory removal
3. **Increased Limits**: File descriptor limit increased from 256→4096 at startup (macOS/Linux)

This ensures sessions are completely removed from both metadata and filesystem without orphaned directories.

#### Database Exploration

Explore your session data with the built-in database tools:
```bash
make db-compare         # Compare Layer 1 vs Layer 2 item counts
make db-layer1          # View complete LLM context (includes SDK internals)
make db-layer2          # View user-facing conversation history
make db-tools           # Inspect all tool calls in session
make db-types           # Analyze SDK item type distribution
```

The layered architecture ensures:
- ✅ Model has complete context including tool execution details
- ✅ UI displays clean, user-focused conversation history
- ✅ Session switching remains fast without buffer overflow
- ✅ Conversation history preserved even after summarization

#### Database Schema

**Layer 1 Tables (SDK Managed)**
```sql
-- Session metadata
agent_sessions (session_id TEXT PRIMARY KEY, created_at TIMESTAMP)

-- All SDK items (JSON blob with role, type, content, etc.)
agent_messages (
    id INTEGER PRIMARY KEY,
    session_id TEXT,
    message_data TEXT,  -- JSON: {role, type, content, tool_calls, reasoning, etc.}
    created_at TIMESTAMP
)
```

**Layer 2 Table (Application Managed)**
```sql
-- Shared table across all sessions
CREATE TABLE full_history (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,        -- user, assistant, system, tool_call
    content TEXT NOT NULL,     -- Clean message content
    metadata TEXT,             -- Optional JSON metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_full_history_session_id ON full_history(session_id);
CREATE INDEX IF NOT EXISTS idx_full_history_session_created ON full_history(session_id, created_at);
```

**Metadata File**
```json
// data/sessions.json
{
  "current_session_id": "chat_abc123",
  "sessions": {
    "chat_abc123": {
      "session_id": "chat_abc123",
      "title": "Conversation 2025-10-12 07:32 AM",
      "created_at": "2025-10-12T07:32:51.738400",
      "last_used": "2025-10-12T07:41:08.806529",
      "message_count": 24,
      "accumulated_tool_tokens": 0,
      "mcp_config": ["sequential", "fetch", "tavily"],
      "model": "gpt-5.1",
      "reasoning_effort": "medium"
    }
  }
}
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
- **Modular utilities**: Token and rate limiting functions in `utils.py`
- **Centralized constants**: All configuration values in `constants.py`
- **Clean separation**: Each module has a single, clear responsibility
- **Type hints**: Improved type annotations throughout the codebase

## Configuration

### Environment Variables

- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key (required)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL (required)
- `AZURE_OPENAI_DEPLOYMENT`: Deployment name (defaults to "gpt-5-mini" if not set)
- `AZURE_OPENAI_API_VERSION`: API version (optional, defaults to "2024-10-01-preview")

### Python Dependencies

**Required** (Python 3.13+, from `src/requirements.txt`):
- `openai>=1.0.0`: Azure OpenAI client library (AsyncOpenAI)
- `openai-agents>=0.3.3`: Agent/Runner framework with MCP support and SQLiteSession
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

3. **Python not found or wrong version**
   - Ensure Python 3.13+ is installed and in PATH
   - Check: `python3 --version` (must show 3.13 or higher)
   - Install Python 3.13+ from https://www.python.org/downloads/
   - Use virtual environment: `make install-python`

4. **Electron window doesn't open**
   - Check Node.js version (requires 16+): `node --version`
   - Reinstall dependencies: `make install-node` or `npm install`
   - Try development mode: `make dev`

5. **MCP server not working**
   - Verify installation: `which server-sequential-thinking`
   - Reinstall: `make install-mcp` or `sudo make install-mcp`
   - Check global npm packages: `npm list -g --depth=0`

6. **Virtual environment issues**
   - Remove and recreate: `make clean-venv && make install-python`
   - Verify `.juicer/` directory exists after install

7. **Build/syntax errors**
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

- Built with [Electron](https://www.electronjs.org/)
- Powered by [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- Uses the OpenAI Agents library for streaming support
