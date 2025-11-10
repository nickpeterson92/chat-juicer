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
- 🧠 **Sequential Thinking**: MCP server for advanced multi-step reasoning and problem decomposition
- 🌐 **Web Content Retrieval**: Fetch MCP server for HTTP/HTTPS web content fetching
- 💾 **Two-Layer Session Persistence**: Layered architecture separating LLM context from UI display
- 🔄 **Multi-Session Support**: Create, switch, and manage multiple conversation sessions
- 📊 **Smart Session Management**: TokenAwareSQLiteSession with auto-summarization at 20% threshold
- ⚡ **Streaming Responses**: Real-time AI response streaming with structured event handling
- 🛠️ **Function Calling**: Async native tools and MCP server integration
- 📝 **Structured Logging**: Enterprise-grade JSON logging with rotation and session correlation
- 🔐 **Azure OpenAI Integration**: Secure connection to Azure OpenAI services
- 📊 **Token Management**: SDK-level universal token tracking with exact counting via tiktoken
- ⚡ **Full Async Architecture**: Consistent async/await throughout backend
- 📄 **Document Generation**: Template-based document creation with multi-format support (PDF, Word, Excel, HTML)
- 🔧 **Editing Tools**: Text, regex, and insert operations for document modification
- 🎯 **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
- 🏗️ **Production Features**: Memory management, error recovery, performance optimization

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
- **Frontend**: Electron with memory-bounded state management and health monitoring
- **Persistence**: Two-layer SQLite architecture (LLM context + UI display)
- **Session**: TokenAwareSQLiteSession with 20% threshold auto-summarization
- **Session Manager**: Multi-session lifecycle management with metadata persistence
- **Logging**: Enterprise JSON logging with rotation and session correlation
- **Type System**: Protocols for SDK integration, Pydantic for validation, TypedDict for data

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
├── electron/          # Electron main process and utilities
│   ├── main.js       # Electron main process, IPC handlers, health monitoring
│   ├── preload.js    # Preload script for secure context-isolated IPC
│   ├── logger.js     # Centralized structured logging with IPC forwarding
│   ├── config/
│   │   └── main-constants.js     # Main process configuration constants
│   └── renderer/     # Modular renderer process (ES6 modules)
│       ├── index.js              # Main entry point orchestrating all modules
│       ├── config/constants.js   # Centralized configuration
│       ├── core/state.js         # BoundedMap memory management and AppState pub/sub
│       ├── ui/
│       │   ├── chat-ui.js        # Message rendering and chat interface
│       │   ├── function-card-ui.js # Function call card visualization
│       │   ├── welcome-page.js   # Welcome page UI component
│       │   └── titlebar.js       # Cross-platform custom titlebar
│       ├── handlers/message-handlers-v2.js # EventBus-integrated message handlers
│       ├── services/session-service.js  # Session CRUD operations
│       ├── managers/              # UI state and interaction managers
│       │   ├── theme-manager.js  # Dark mode and theme management
│       │   ├── view-manager.js   # View state (welcome vs chat)
│       │   ├── dom-manager.js    # DOM element management
│       │   └── file-manager.js   # File drag-and-drop handling
│       └── utils/                # Renderer utilities
│           ├── markdown-renderer.js # Markdown rendering with syntax highlighting
│           ├── scroll-utils.js   # Scroll behavior utilities
│           ├── json-cache.js     # JSON parsing cache
│           ├── toast.js          # Toast notification system
│           └── file-utils.js     # File handling utilities
├── ui/               # Frontend static assets
│   ├── index.html    # Main chat UI (loads renderer/index.js as ES6 module)
│   ├── input.css     # Tailwind CSS source
│   ├── chat-juicer-logo-real.svg  # Application logo
│   └── smoke-loading.svg       # Loading animation
├── src/              # Python backend (modular architecture)
│   ├── main.py       # Application entry point
│   ├── core/         # Core business logic
│   │   ├── agent.py            # Agent/Runner implementation with MCP support
│   │   ├── session.py          # TokenAwareSQLiteSession with auto-summarization (Layer 1)
│   │   ├── full_history.py     # FullHistoryStore for UI display (Layer 2)
│   │   ├── session_manager.py  # Multi-session lifecycle management
│   │   ├── session_commands.py # Session command handlers
│   │   ├── prompts.py          # System instruction prompts
│   │   └── constants.py        # Configuration with Pydantic Settings validation
│   ├── models/       # Data models and type definitions
│   │   ├── api_models.py      # Pydantic models for API responses
│   │   ├── event_models.py    # Event and message models
│   │   ├── sdk_models.py      # Protocol typing for SDK integration
│   │   └── session_models.py  # Session metadata models
│   ├── tools/        # Function calling tools
│   │   ├── document_generation.py # Document generation from templates
│   │   ├── file_operations.py     # File reading and directory listing
│   │   ├── text_editing.py        # Text editing operations
│   │   ├── wrappers.py            # Tool wrapper utilities
│   │   └── registry.py            # Tool registration and discovery
│   ├── integrations/ # External integrations
│   │   ├── mcp_servers.py        # MCP server setup and management
│   │   ├── event_handlers.py     # Streaming event handlers
│   │   └── sdk_token_tracker.py  # SDK-level universal token tracking
│   ├── utils/        # Utility modules
│   │   ├── logger.py            # Enterprise JSON logging with rotation
│   │   ├── ipc.py               # IPC manager with pre-cached templates
│   │   ├── token_utils.py       # Token management with LRU caching
│   │   ├── file_utils.py        # File utility functions
│   │   ├── document_processor.py # Document processing utilities
│   │   ├── json_utils.py        # JSON parsing and formatting
│   │   ├── http_logger.py       # HTTP request logging
│   │   ├── client_factory.py    # Azure OpenAI client factory
│   │   ├── validation.py        # Input validation utilities
│   │   └── session_integrity.py # Session integrity validation
│   └── requirements.txt  # Python dependencies
├── sources/          # Source documents for processing
├── output/           # Generated documentation output
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

## Key Components

### Python Backend (`src/`)

**Core Business Logic** (`core/`)
- **agent.py**: Agent/Runner implementation with MCP server integration and streaming event handling
- **session.py**: TokenAwareSQLiteSession with automatic summarization and layered persistence (Layer 1)
- **full_history.py**: FullHistoryStore for complete UI-facing conversation history (Layer 2)
- **session_manager.py**: Session lifecycle management with metadata persistence (sessions.json)
- **constants.py**: Centralized configuration with Pydantic Settings validation

**Data Models** (`models/`)
- **api_models.py**: Pydantic models for API responses and function returns
- **event_models.py**: Event and message models for IPC communication
- **sdk_models.py**: Protocol definitions for type-safe SDK integration

**Tools** (`tools/`)
- **document_generation.py**: Template-based document generation with placeholder replacement
- **file_operations.py**: Directory listing and file reading with markitdown support
- **text_editing.py**: Text, regex, and insert editing operations
- **registry.py**: Tool registration and discovery system

**Integrations** (`integrations/`)
- **mcp_servers.py**: MCP server setup and management (Sequential Thinking)
- **event_handlers.py**: Streaming event handlers for Agent/Runner pattern
- **sdk_token_tracker.py**: Universal token tracking via SDK monkey-patching

**Utilities** (`utils/`)
- **logger.py**: Enterprise JSON logging with rotation and session correlation
- **ipc.py**: IPC manager with pre-cached templates for performance
- **utils.py**: Token management utilities with LRU caching
- **file_utils.py**: File system utility functions
- **document_processor.py**: Document processing and optimization utilities

**Entry Point**
- **main.py**: Application entry point and async event loop management

### Electron Frontend (`electron/`)

**Main Process**
- **main.js**: Main process with health monitoring (5-min intervals), auto-recovery, graceful shutdown
- **preload.js**: Secure context-isolated bridge between main and renderer processes
- **logger.js**: Centralized logging with IPC forwarding from renderer to main process

**Renderer Process** (`electron/renderer/`) - Modular ES6 architecture
- **index.js**: Main entry point orchestrating all renderer modules
- **config/constants.js**: Centralized configuration values (timeouts, limits, delimiters)
- **core/state.js**: State management with BoundedMap for memory safety and AppState pub/sub
- **ui/chat-ui.js**: Message rendering and chat interface operations
- **ui/function-card-ui.js**: Function call card visualization and management
- **handlers/message-handlers-v2.js**: EventBus-integrated message handlers for streaming events
- **services/session-service.js**: Session CRUD operations with consistent error handling

## Function Calling

The application supports both native functions and MCP server tools:

### Native Functions (Async)
- **list_directory**: Directory listing with metadata (size, modified time, file count)
- **read_file**: File reading with automatic format conversion via markitdown (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON, images)
- **generate_document**: Template-based document generation with placeholder replacement
- **text_edit**: Find and replace exact text in documents (or delete by setting replace_with='')
- **regex_edit**: Pattern-based editing using regular expressions
- **insert_text**: Add new content before or after existing text

### MCP Server Integration
- **Sequential Thinking** (Node.js): Advanced multi-step reasoning with revision capabilities and hypothesis testing
- **Fetch Server** (Python): HTTP/HTTPS web content retrieval with automatic format handling and parameter support
- Extensible to add more MCP servers (filesystem, GitHub, databases, etc.)

### Features
- Automatic tool orchestration by Agent/Runner framework
- SDK-level universal token tracking for all tools (native, MCP, future agents)
- Exact token counting using tiktoken with LRU caching
- Content optimization to reduce token usage (removes redundant whitespace, headers)
- Accumulated tool token tracking separate from conversation tokens

Add new functions by:
1. Defining the function in `src/functions.py`
2. Adding it to the `TOOLS` array
3. Registering in `FUNCTION_REGISTRY`
4. Function automatically available to Agent (including MCP tools)

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
- Optimized for Agent/Runner framework consumption
- Stored in `data/chat_history.db` (agent_messages table)
- May be summarized when token limit approaches
- Essential for maintaining proper model context with all execution details

**Layer 2 (UI Display - FullHistoryStore)**
- User-facing conversation history (user/assistant/system messages only)
- Filtered to exclude SDK internal items (tool_call_item, reasoning_item, etc.)
- Stored in session-specific tables (full_history_chat_[SESSION_ID])
- Never summarized - complete conversation history preserved
- Optimized for UI rendering and session switching

#### Session Features

- **Multi-Session Support**: Create, switch, and manage multiple conversation sessions
- **Persistent Storage**: Both layers survive application restarts
- **Token-Aware Summarization**: Automatically summarizes Layer 1 at 20% of model limit
- **Model-Aware Limits**: GPT-5 (272k), GPT-4o (128k), GPT-4 (128k), GPT-3.5-turbo (15.3k)
- **Context Preservation**: Keeps last 2 user-assistant exchanges unsummarized
- **Seamless Switching**: Fast session switching with reduced payload size
- **Tool Token Tracking**: Accumulates tokens from all tool calls (native, MCP, agents)

#### Session Commands

The application includes IPC-based session management:
- **Create**: Start new conversation sessions with automatic titles
- **Switch**: Change active session and restore full conversation history
- **List**: View all available sessions with metadata
- **Delete**: Remove sessions and clean up both persistence layers
- **Summarize**: Manually trigger conversation summarization

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

**Layer 2 Tables (Application Managed)**
```sql
-- One table per session: full_history_chat_[SESSION_ID]
CREATE TABLE full_history_chat_[SESSION_ID] (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL,        -- user, assistant, system, tool
    content TEXT NOT NULL,     -- Clean message content
    metadata TEXT,             -- Optional JSON metadata
    created_at TIMESTAMP
)
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
      "message_count": 24
    }
  }
}
```

### Rate Limiting & Error Handling
The application includes robust error handling:
- Automatic rate limit detection with user-friendly messages
- Graceful handling of RS_ and FC_ streaming errors (now resolved with client-side sessions)
- Connection error recovery with auto-restart
- Process health monitoring every 5 minutes (optimized from 30 seconds)
- Connection state machine (CONNECTED/DISCONNECTED/RECONNECTING/ERROR)
- Centralized configuration in `constants.py` with Pydantic validation

### Token Counting & Optimization
Using tiktoken for exact token counting:
- Precise token counts for all content (not estimates)
- Automatic content optimization for documents >1000 tokens
- Removes unnecessary headers, footers, and redundant whitespace
- Reports exact tokens saved through optimization
- Model-aware encoding (supports GPT-4, GPT-3.5, and newer models)
- Utilities centralized in `utils.py` for reusability

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
