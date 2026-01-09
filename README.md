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
# Edit src/backend/.env with your Azure OpenAI credentials

# Run the application
npm start               # Production mode
npm run dev             # Development mode with DevTools
```

### macOS/Linux (Optional - Using Makefile)

```bash
# First time setup
make setup              # Install everything and configure
# Edit src/backend/.env with your Azure OpenAI credentials

# Run the application
make run                # Production mode
make dev                # Development mode with DevTools

# Get help
make help               # Show all available commands
make health             # Check system configuration
```

**Note**: On Windows, Makefile commands require Git Bash or WSL. The npm scripts work on all platforms natively.

## Features

- **Desktop + Web Application**: Production-grade Electron desktop app AND browser web app (via Cloudflare Pages)
- **FastAPI Backend**: RESTful API with WebSocket streaming and PostgreSQL persistence
- **Agent/Runner Pattern**: Native OpenAI Agents SDK with automatic tool orchestration
- **MCP Servers**: Sequential Thinking and Fetch servers by default, plus optional Tavily search when configured
- **MCP Server Manager**: Shared WebSocket clients with multiplexing for concurrent request handling
- **PostgreSQL Persistence**: Sessions, messages, and projects stored in PostgreSQL with connection pooling
- **Projects & Semantic Search**: Organize sessions into projects with pgvector-powered context search
- **Multi-Session Support**: Create, switch, delete sessions with auto-title after first message
- **WebSocket Streaming**: Real-time AI response streaming via `/ws/chat/{session_id}`
- **Function Calling**: Async native tools and MCP integration with session-aware wrappers
- **Authentication**: JWT-based auth with rate limiting, bcrypt password hashing
- **Structured Logging**: Enterprise-grade JSON logging with rotation and session correlation
- **Prometheus Metrics**: Auto-instrumented FastAPI metrics for monitoring
- **Azure/OpenAI Integration**: Azure by default with optional base OpenAI provider
- **Token Management**: SDK-level universal token tracking for tool calls and reasoning tokens
- **Full Async Architecture**: Consistent async/await throughout backend
- **Document Generation**: Save generated content to session-scoped output/ with optional backups
- **Editing Tools**: Batch text edits with git-style diffs and whitespace-flexible matching
- **Code Interpreter**: Sandboxed Python execution with data science libraries
- **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
- **Component Architecture**: Reusable frontend components with proper state management
- **Database Migrations**: Alembic-managed schema migrations

## Architecture

Chat Juicer uses a **three-tier architecture** with OpenAI's **Agent/Runner pattern**:

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

### Key Architectural Components:
- **FastAPI Backend**: RESTful API with WebSocket streaming at `/ws/chat/{session_id}`
- **PostgreSQL**: Persistent storage for sessions and messages with connection pooling (asyncpg)
- **MCP Server Manager**: Shared singleton clients with WebSocket multiplexing
- **Agent/Runner Pattern**: Native MCP server integration with automatic tool orchestration
- **Electron Main Process**: HTTP/WebSocket proxy connecting renderer to FastAPI
- **Frontend**: 7-phase bootstrap, AppState pub/sub, EventBus for message routing
- **UI Components**: ChatContainer, InputArea, FilePanel, ModelSelector, ConnectionStatus
- **Logging**: Enterprise JSON logging with rotation and session correlation
- **Type System**: Full mypy strict compliance, Pydantic validation

### Cloud Deployment (Production)

For production, the FastAPI backend runs on AWS:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                            │
│              (Connects to cloud backend via HTTPS)                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / WebSocket (port 8000)
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
- **VPC**: Public subnets with security group IP whitelisting

**Infrastructure as Code:**
All cloud infrastructure is managed via Terraform in the `infra/` directory.

### Web App Deployment (Cloudflare Pages)

In addition to the Electron desktop app, Chat Juicer runs as a **browser web application** deployed via Cloudflare Pages:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Browser Web App                                 │
│              (chat-juicer.pages.dev via Cloudflare)                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (EC2)                           │
│              (api.chat-juicer.com)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Differences from Desktop:**
- Uses `BrowserAPIAdapter` instead of Electron IPC
- Direct HTTP/WebSocket communication to backend API
- localStorage for token storage (vs secure Electron storage)
- Native browser file inputs (vs native Electron dialogs)

**Web Build Commands:**
```bash
npm run dev:web       # Development server (Vite)
npm run build:web     # Production build for browser
npm run deploy:web    # Deploy to Cloudflare Pages via Wrangler
```

## Prerequisites

- Node.js 16+ and npm
- **Python 3.13+** (strictly required for all dependencies)
- **PostgreSQL 14+** with a database created for the application
- Azure OpenAI resource with deployment (e.g., gpt-5.2, gpt-5.1, gpt-5, gpt-4.1)
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

After running setup, edit `src/backend/.env` with your Azure OpenAI credentials, then:
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
   cd src/backend/
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
   cd src/backend/
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

#### Schema Migrations (Alembic)

Database schema is managed with Alembic for version-controlled migrations:

```bash
# View migration status
alembic current

# Generate new migration from model changes
alembic revision --autogenerate -m "description"

# Apply all pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

Migration files are stored in `migrations/versions/`. Initial schema is in `migrations/init.sql`.

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
├── src/               # All application source code
│   ├── frontend/      # Electron main process and renderer
│   │   ├── main.js       # Main process, HTTP proxy to FastAPI
│   │   ├── api-client.js # HTTP client for FastAPI backend
│   │   ├── preload.js    # Secure context-isolated bridge
│   │   ├── logger.js     # Structured logging with IPC forwarding
│   │   ├── config/
│   │   │   └── main-constants.js
│   │   ├── ui/           # Frontend static assets
│   │   │   ├── index.html    # Main chat UI
│   │   │   ├── input.css     # Tailwind CSS source
│   │   │   ├── auth-modal.css # Authentication modal styles
│   │   │   └── styles/       # CSS component styles
│   │   │       ├── base.css      # Base styles and resets
│   │   │       ├── theme.css     # Theme variables and tokens
│   │   │       ├── components/   # Component-specific styles
│   │   │       ├── platform/     # Platform-specific overrides
│   │   │       └── utilities/    # Utility classes
│   │   └── renderer/     # Component-based renderer (ES modules)
│   │       ├── index.js              # Entry point
│   │       ├── bootstrap.js          # 7-phase bootstrap orchestrator
│   │       ├── bootstrap/            # Bootstrap modules
│   │       │   ├── phases/           # Individual bootstrap phases
│   │       │   ├── error-recovery.js # Error recovery logic
│   │       │   ├── types.js          # Type definitions
│   │       │   └── validators.js     # Bootstrap validators
│   │       ├── adapters/             # DOM, IPC, Storage adapters
│   │       ├── config/               # constants, colors, model-metadata
│   │       ├── core/                 # AppState, EventBus, lifecycle, websocket-manager
│   │       ├── managers/             # DOM, file, view managers
│   │       ├── services/             # Business logic (AppState-backed), stream-manager
│   │       ├── handlers/             # Event handlers
│   │       ├── plugins/              # Plugin registry
│   │       ├── ui/                   # UI components, renderers, tool-registry
│   │       ├── viewmodels/           # Data transformation
│   │       └── utils/                # Utility modules + analytics
│   └── backend/       # Python FastAPI backend
│       ├── api/          # FastAPI application
│       │   ├── main.py           # FastAPI app with lifespan, routes, CORS
│       │   ├── dependencies.py   # Dependency injection (DB, services)
│       │   ├── routes/           # API endpoints
│       │   │   ├── chat.py       # WebSocket chat endpoint (/ws/chat)
│       │   │   └── v1/           # Versioned REST API routes
│       │   │       ├── auth.py       # Authentication routes
│       │   │       ├── config.py     # Configuration endpoint
│       │   │       ├── files.py      # File management routes
│       │   │       ├── health.py     # Health check endpoint
│       │   │       ├── messages.py   # Message pagination endpoint
│       │   │       ├── projects.py   # Project management routes
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
│       │   │   ├── auth_service.py       # Authentication
│       │   │   ├── context_service.py    # Context injection service
│       │   │   ├── project_service.py    # Project CRUD operations
│       │   │   └── summarization_service.py # Conversation summarization
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
│       │   ├── agent.py          # Agent/Runner with MCP support
│       │   ├── prompts.py        # System instruction prompts
│       │   └── constants.py      # Pydantic Settings configuration
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
│       │       ├── projects.py   # Project response schemas
│       │       └── sessions.py   # Session response schemas
│       ├── tools/        # Function calling tools (async)
│       │   ├── file_operations.py    # File reading, directory listing
│       │   ├── document_generation.py # Document generation
│       │   ├── text_editing.py       # Text editing operations
│       │   ├── code_interpreter.py   # Sandboxed code execution
│       │   ├── context_search.py     # Project context semantic search
│       │   ├── schema_fetch.py       # Database schema introspection
│       │   ├── wrappers.py           # Session-aware tool wrappers
│       │   └── registry.py           # Tool registration
│       ├── integrations/ # External integrations
│       │   ├── mcp_manager.py       # MCP server lifecycle management
│       │   ├── mcp_registry.py      # MCP server registry and configuration
│       │   ├── mcp_transport.py     # MCP transport layer (WebSocket)
│       │   ├── mcp_websocket_client.py # MCP WebSocket client
│       │   ├── sdk_token_tracker.py # Token tracking
│       │   ├── embedding_service.py # Text embedding generation
│       │   └── event_handlers/      # Streaming event handlers
│       │       ├── agent_events.py      # Agent event handlers
│       │       ├── base.py              # Base handler class
│       │       ├── raw_events.py        # Raw event handlers
│       │       ├── registry.py          # Handler registry
│       │       └── run_item_events.py   # Run item event handlers
│       ├── workers/      # Background workers
│       │   └── embedding_worker.py  # Async embedding processing
│       ├── scripts/      # Utility scripts
│       │   └── migrate_to_cloud.py  # Cloud migration helper
│       └── utils/        # Utility modules
│           ├── logger.py           # Enterprise JSON logging
│           ├── token_utils.py      # Token counting with LRU cache
│           ├── file_utils.py       # File system utilities
│           ├── client_factory.py   # OpenAI client factory
│           ├── db_utils.py         # Database utilities
│           ├── document_processor.py # Document processing
│           ├── http_logger.py      # HTTP request logging
│           ├── json_utils.py       # JSON utilities
│           ├── cache.py            # TTL caching utilities
│           └── metrics.py          # Performance metrics
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

### Renderer Runtime Highlights
- 7-phase bootstrap orchestrator (`bootstrap.js`) with validation and degraded-mode recovery
- `AppState` (`core/state.js`) is the single state source for reactive DOM updates
- Global `EventBus` (`core/event-bus.js`) powers decoupled message routing
- Services communicate with backend via IPC adapter which proxies to FastAPI
- Primary UI components: ChatContainer, InputArea, FilePanel, ModelSelector, ConnectionStatus

## Key Components

### Python FastAPI Backend (`src/backend/`)

**FastAPI Application** (`api/`)
- **main.py**: FastAPI app initialization with lifespan management, route registration, CORS
- **dependencies.py**: Dependency injection for DB pool, services, managers

**API Routes** (`api/routes/`)
- **chat.py**: WebSocket endpoint for real-time chat streaming (`/ws/chat/{session_id}`)
- **v1/sessions.py**: Session CRUD operations (create, list, get, update, delete, pin, rename)
- **v1/messages.py**: Message pagination and history retrieval
- **v1/files.py**: File upload and management
- **v1/config.py**: Model and configuration endpoint
- **v1/health.py**: Health check endpoint
- **v1/auth.py**: Authentication routes

**Middleware** (`api/middleware/`)
- **auth.py**: Authentication middleware
- **exception_handlers.py**: Global exception handlers
- **request_context.py**: Request context middleware

**WebSocket** (`api/websocket/`)
- **manager.py**: WebSocket connection tracking
- **errors.py**: WebSocket error handling
- **task_manager.py**: Async task/cancellation management

**Services** (`api/services/`)
- **chat_service.py**: Chat streaming with Agent/Runner orchestration and interrupt handling
- **session_service.py**: Session management with PostgreSQL persistence
- **file_service.py**: File operations with session-scoped storage
- **auth_service.py**: Authentication service

**Core Business Logic** (`core/`)
- **agent.py**: Agent/Runner implementation with MCP server integration
- **prompts.py**: System instruction prompts and templates
- **constants.py**: Pydantic Settings configuration

**Data Models** (`models/`)
- **api_models.py**: Pydantic models for API requests/responses
- **event_models.py**: WebSocket event models
- **error_models.py**: Error response models
- **ipc_models.py**: IPC message models
- **sdk_models.py**: SDK integration models
- **session_models.py**: Session metadata models
- **schemas/**: Response schema models (auth, base, config, files, health, sessions)

**Tools** (`tools/`)
- **file_operations.py**: Directory listing and file reading with markitdown support
- **document_generation.py**: Document generation with session-scoped output
- **text_editing.py**: Text, regex, and insert editing operations
- **code_interpreter.py**: Sandboxed code execution
- **wrappers.py**: Session-aware wrappers enforcing sandbox `data/files/{session_id}`
- **registry.py**: Tool registration and discovery

**Integrations** (`integrations/`)
- **mcp_manager.py**: MCP server lifecycle management and connection handling
- **mcp_registry.py**: MCP server registry, configuration, and discovery
- **mcp_transport.py**: WebSocket transport layer for MCP servers
- **mcp_websocket_client.py**: WebSocket client for containerized MCP sidecars
- **sdk_token_tracker.py**: Universal token tracking via SDK monkey-patching
- **event_handlers/**: Streaming event handlers for Agent/Runner pattern
  - **agent_events.py**: Agent event handlers
  - **base.py**: Base handler class
  - **raw_events.py**: Raw event handlers
  - **registry.py**: Handler registry
  - **run_item_events.py**: Run item event handlers

**Utilities** (`utils/`)
- **logger.py**: Enterprise JSON logging with rotation and session correlation
- **token_utils.py**: Token counting with LRU caching
- **file_utils.py**: File system utilities
- **client_factory.py**: Azure OpenAI client factory
- **db_utils.py**: Database utilities
- **document_processor.py**: Document processing utilities
- **http_logger.py**: HTTP request logging
- **json_utils.py**: JSON utilities

### Electron Frontend (`src/frontend/`)

**Main Process**
- **main.js**: Main process with HTTP/WebSocket proxy to FastAPI, health monitoring
- **api-client.js**: HTTP client for FastAPI backend communication
- **preload.js**: Secure context-isolated bridge between main and renderer processes
- **logger.js**: Centralized logging with IPC forwarding from renderer to main process
- **utils/**: Main process utilities
  - **binary-message-parser.js**: Binary protocol message parsing
  - **ipc-v2-protocol.js**: IPC v2 protocol implementation

**Renderer Process** (`src/frontend/renderer/`) - Component-based ES6 architecture
- **index.js**: Main entry point orchestrating all renderer modules
- **bootstrap.js**: 7-phase bootstrap orchestrator
- **bootstrap/**: Bootstrap modules
  - **phases/**: Individual bootstrap phases
  - **error-recovery.js**: Error recovery logic
  - **types.js**: Type definitions
  - **validators.js**: Bootstrap validators
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
- **schema_fetch**: Database schema introspection supporting PostgreSQL and SQLite, with column types, constraints, and relationship detection
- **search_project_context**: Semantic similarity search within the project's knowledge base (requires session to be assigned to a project)
- **Session-aware wrappers**: All file/doc tools are wrapped to `data/files/{session_id}` via `wrappers.py`

### MCP Server Integration

MCP servers communicate via **WebSocket** connections to a centralized MCP gateway, enabling:
- **Connection pooling**: Pre-spawned server instances for concurrent request handling
- **Automatic reconnection**: Client handles disconnections with exponential backoff
- **Thread-safe access**: Concurrent tool calls via `asyncio.Lock` protection

**Available MCP Servers:**
- **Sequential Thinking**: Advanced multi-step reasoning with revision capabilities and hypothesis testing
- **Fetch**: HTTP/HTTPS web content retrieval with automatic format handling
- **Tavily Search**: Optional web search when `TAVILY_API_KEY` is configured

Extensible via `integrations/mcp_registry.py` with WebSocket transport in `mcp_websocket_client.py`

### Features
- Session-aware tool wrappers (`tools/wrappers.py`) enforce workspace isolation (data/files/{session_id})
- SDK-level universal token tracking for all tools (native + MCP)
- Exact token counting using tiktoken with LRU caching
- Accumulated tool token tracking separate from conversation tokens

Add new functions by:
1. Implementing in the appropriate `src/backend/tools/*.py` module
2. Registering in `tools/registry.py` (`AGENT_TOOLS` + `FUNCTION_REGISTRY`)
3. If session-scoped, exposing a wrapped version via `create_session_aware_tools()` so session_id is injected automatically

### S3 File Synchronization

Session files are automatically synchronized with S3 for persistence across idle timeouts:

```
Upload Flow:  Local file → S3SyncService.upload_to_s3_background() → s3://{bucket}/{session_id}/
Download Flow: Session reconnect → S3SyncService.rehydrate_session() → Local files restored
```

**Key behaviors:**
- **Automatic upload**: Files created via `generate_document` or `edit_file` are synced to S3
- **Idle cleanup**: Local files are deleted after WebSocket idle timeout (configurable)
- **Transparent rehydration**: On reconnect, files are restored from S3 before chat resumes
- **Presigned URLs**: Direct S3 download links via `/api/v1/files/{session_id}/presign/{filename}`

Requires `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET_NAME` environment variables.

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

1. **Backend changes**: Modify Python files in `src/backend/`
2. **Frontend changes**: Update files in `src/frontend/`
3. **Function additions**: Extend appropriate modules in `src/backend/tools/`

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
python -m py_compile src/backend/api/main.py

# Run FastAPI backend
cd src/backend && uvicorn api.main:app --reload

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

**Projects Table**
- Project organization for grouping related sessions
- Per-user isolation with user_id foreign key
- Supports semantic context accumulation across sessions

**Context Chunks Table (pgvector)**
- Vector embeddings for semantic search (text-embedding-3-small, 1536 dimensions)
- HNSW index for fast approximate nearest neighbor search
- Sources: session summaries, messages, uploaded files

#### Session Features

- **Multi-Session Support**: Create, switch, update, delete, pin sessions
- **Persistent Storage**: All data stored in PostgreSQL
- **Token-Aware Management**: Tracks token usage for context management
- **Auto Titles**: Generates titles after first user message (non-blocking)
- **Pagination**: Efficient message loading with offset/limit
- **Manual Summarization**: On-demand conversation summarization

#### API Endpoints

**Session Management** (`/api/v1/sessions/`)
- `POST /` - Create new session
- `GET /` - List sessions with pagination
- `GET /{id}` - Get session details
- `PATCH /{id}` - Update session (rename, pin, config)
- `DELETE /{id}` - Delete session
- `POST /{id}/summarize` - Manually trigger conversation summarization

**Chat** (`/ws/chat/{session_id}`)
- WebSocket endpoint for real-time chat streaming
- Supports interruption via WebSocket messages
- Streams agent responses, tool calls, and reasoning

**Messages** (`/api/v1/messages/`)
- `GET /{session_id}` - Get messages with pagination

**Projects** (`/api/v1/projects/`)
- `POST /` - Create new project
- `GET /` - List projects with pagination
- `GET /{id}` - Get project details
- `PATCH /{id}` - Update project (name, description)
- `DELETE /{id}` - Delete project

**Context Search** (`/api/v1/context/`)
- `POST /search` - Semantic similarity search within a project's knowledge base

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

The application includes robust error handling and configurable rate limiting:

**Authentication:**
- JWT-based authentication with access/refresh token flow
- bcrypt password hashing via passlib
- Automatic token refresh on 401 errors
- `ALLOW_LOCALHOST_NOAUTH=true` bypasses auth for local development

**Rate Limiting (per user):**
- Auth endpoints: 5 burst / 10 per minute
- File uploads: 10 per minute
- Regular API: 120 per minute

**Error Handling:**
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

### Monitoring

The application exposes Prometheus metrics via `prometheus-fastapi-instrumentator`:

- **Endpoint**: `GET /metrics`
- **Metrics**: Request latency, status codes, active connections
- **Auto-instrumented**: All FastAPI endpoints automatically tracked

## Configuration

### Environment Variables

**Required (All Environments):**
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL (e.g., `https://resource.openai.azure.com/`)
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/chatjuicer`)

**Optional (Local Development):**
- `AZURE_OPENAI_DEPLOYMENT`: Deployment name (defaults to "gpt-5-mini")
- `AZURE_OPENAI_API_VERSION`: API version (defaults to "2024-10-01-preview")
- `REASONING_EFFORT`: Reasoning effort level (`none`, `low`, `medium`, `high`)
- `TAVILY_API_KEY`: Enable Tavily search MCP server

**Cloud-Specific (Production on AWS):**
- `FILE_STORAGE=s3`: Enable S3 file storage (default: `local`)
- `S3_BUCKET`: S3 bucket name for session files
- `S3_REGION`: AWS region (e.g., `us-west-2`)
- `JWT_SECRET`: Secret for JWT token signing (auto-generated by Terraform)
- `ALLOW_LOCALHOST_NOAUTH=false`: Enforce authentication in production
- `SF_USER`, `SF_PASSWORD`, `SF_TOKEN`: Salesforce integration for schema_fetch tool

### Python Dependencies

**Required** (Python 3.13+, from `src/backend/requirements.txt`):
- `fastapi>=0.115.0`: Modern async web framework
- `uvicorn[standard]>=0.32.0`: ASGI server for FastAPI
- `asyncpg>=0.30.0`: Async PostgreSQL driver with connection pooling
- `openai>=2.9.0`: Azure OpenAI client library (AsyncOpenAI)
- `openai-agents>=0.6.2`: Agent/Runner framework with Responses API support
- `markitdown[pdf,docx,pptx,xlsx,xls]>=0.1.4`: Document conversion to markdown
- `tiktoken>=0.12.0`: OpenAI's official token counting library
- `python-json-logger>=4.0.0`: Structured JSON logging with rotation
- `python-dotenv>=1.2.1`: Environment variable management
- `httpx>=0.27.2,<0.28`: Modern HTTP client (pinned for mcp-server-fetch)
- `aiofiles>=25.1.0`: Async file operations for non-blocking I/O
- `pydantic>=2.12.5`: Runtime data validation with type hints
- `pydantic-settings>=2.12.0`: Settings management with environment variables

**Database & Migrations**:
- `alembic>=1.14.0`: Database schema migrations
- `aiomysql>=0.2.0`: MySQL async driver for schema_fetch
- `aioodbc>=0.5.0`: SQL Server via ODBC for schema_fetch

**Authentication**:
- `python-jose[cryptography]>=3.3.0`: JWT token handling
- `bcrypt>=4.2.0`: Password hashing
- `passlib[bcrypt]>=1.7.4`: Password utilities

**Monitoring & Serialization**:
- `prometheus-fastapi-instrumentator>=7.0.0`: Prometheus metrics
- `msgpack>=1.1.2`: Binary serialization for IPC Protocol V2
- `websockets>=13.1`: Async WebSocket client for MCP transport
- `boto3>=1.35.0`: AWS SDK for S3-compatible storage

**External Integrations**:
- `simple-salesforce>=1.12.5`: Salesforce REST API client

### Node.js Dependencies

**Production** (from `package.json`):
- `marked`: Markdown parser
- `marked-footnote`: Footnote support for marked
- `dompurify`: HTML sanitization for security
- `shiki`: Syntax highlighting (Snazzy theme)
- `katex`: Math rendering (LaTeX support)
- `mermaid`: Diagram rendering from text
- `lottie-web`: Loading animations
- `animejs`: Welcome page animations
- `pdfjs-dist`: PDF thumbnail generation
- `msgpack-lite`: Binary protocol serialization

**Development**:
- `electron`: Desktop application framework
- `vite`: Build tool and dev server (v7.x)
- `@tailwindcss/vite`: Tailwind CSS 4.x integration
- `@tailwindcss/typography`: Typography plugin for prose content
- `@biomejs/biome`: JavaScript/TypeScript linter and formatter
- `vitest`: Test framework with coverage

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
   - Ensure `.env` file exists in `src/backend/` directory
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
# Reconfigure src/backend/.env with credentials
make run                # Test the application
```

## Cloud Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.5.0
- SSH key pair for EC2 access

### Infrastructure Setup

**1. Bootstrap State Backend (First Time Only)**

```bash
cd infra/bootstrap
terraform init
terraform apply
```

This creates:
- S3 bucket for Terraform state (`chat-juicer-terraform-state`)
- DynamoDB table for state locking (`chat-juicer-terraform-locks`)

**2. Deploy Infrastructure**

```bash
cd infra

# Create terraform.tfvars with your configuration
cat > terraform.tfvars <<EOF
db_password           = "your-secure-password"
github_token          = "ghp_your_token"
azure_openai_api_key  = "your-azure-key"
azure_openai_endpoint = "https://your-resource.openai.azure.com/"
allowed_cidr_blocks   = ["your.ip.address/32"]
EOF

# Initialize and deploy
terraform init
terraform plan
terraform apply
```

**3. Verify Deployment**

```bash
# Get EC2 public IP from outputs
terraform output ec2_public_ip

# SSH into the instance
ssh ec2-user@<public-ip>

# Check service status
sudo systemctl status chat-juicer
sudo journalctl -u chat-juicer -f
```

### Terraform Modules

| Module | Description |
|--------|-------------|
| `networking` | VPC, public subnets, internet gateway, route tables |
| `storage` | S3 bucket for session files with CORS configuration |
| `database` | RDS PostgreSQL 16 with Performance Insights |
| `compute` | EC2 instance with IAM role, security groups, systemd service |

### Server Management

```bash
# Restart the backend service
sudo systemctl restart chat-juicer

# View logs
sudo journalctl -u chat-juicer -f

# Check MCP sidecars
docker ps
docker-compose -f /opt/chat-juicer/docker/mcp/docker-compose.yml logs
```

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/) and [FastAPI](https://fastapi.tiangolo.com/)
- Powered by [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- Uses the [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) for Agent/Runner pattern
- Database persistence with [PostgreSQL](https://www.postgresql.org/) and [asyncpg](https://github.com/MagicStack/asyncpg)
