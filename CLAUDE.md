# CLAUDE.md

This file provides guidance to you (Claude) when working with code in this repository.

⚠️ CRITICAL ⚠️ - Open your heart, your mind and your third eye. Take a deep breath and focus. You've got this!

## Project Overview

Chat Juicer is a production-grade Electron + Python desktop application that provides a chat interface for Azure OpenAI using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**. The application features advanced reasoning capabilities through Sequential Thinking, sophisticated document generation, enterprise-grade logging, and comprehensive type safety.

## Current Architecture (Agent/Runner Pattern)

```
chat-juicer/
├── electron/          # Electron main process and utilities
│   ├── main.js       # Electron main process, IPC handlers, health monitoring (5-min intervals)
│   ├── preload.js    # Preload script for secure context-isolated IPC
│   ├── logger.js     # Centralized structured logging with IPC forwarding
│   ├── config/
│   │   └── main-constants.js     # Main process configuration constants
│   └── renderer/     # Modular renderer process (ES6 modules)
│       ├── index.js              # Main entry point orchestrating all modules
│       ├── config/constants.js   # Centralized configuration (timeouts, limits, delimiters)
│       ├── core/state.js         # BoundedMap memory management and AppState pub/sub
│       ├── ui/
│       │   ├── chat-ui.js        # Message rendering and chat interface
│       │   ├── function-card-ui.js # Function call card visualization
│       │   ├── welcome-page.js   # Welcome page UI component
│       │   └── titlebar.js       # Cross-platform custom titlebar
│       ├── handlers/message-handlers.js # Handler registry for streaming events
│       ├── services/session-service.js  # Session CRUD with consistent error handling
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
│   ├── main.py       # Application orchestrator (174 lines, pure coordination)
│   ├── app/          # Application modules (orchestrator pattern)
│   │   ├── state.py          # AppState dataclass (single source of truth)
│   │   ├── bootstrap.py      # Application initialization and configuration
│   │   └── runtime.py        # Core runtime operations (session, message handling)
│   ├── core/         # Core business logic
│   │   ├── agent.py            # Agent/Runner implementation with MCP support
│   │   ├── session.py          # TokenAwareSQLiteSession with auto-summarization (20% threshold - Layer 1)
│   │   ├── full_history.py     # FullHistoryStore for complete UI-facing conversation history (Layer 2)
│   │   ├── session_manager.py  # Multi-session lifecycle management with metadata persistence
│   │   ├── session_commands.py # Session command handlers (create, switch, delete, list)
│   │   ├── prompts.py          # System instruction prompts and templates
│   │   └── constants.py        # Configuration with Pydantic Settings validation
│   ├── models/       # Data models and type definitions
│   │   ├── api_models.py      # Pydantic models for API responses
│   │   ├── event_models.py    # Event and message models for IPC
│   │   ├── sdk_models.py      # Protocol typing for SDK integration
│   │   └── session_models.py  # Session metadata and persistence models
│   ├── tools/        # Function calling tools
│   │   ├── document_generation.py # Document generation from templates
│   │   ├── file_operations.py     # File reading and directory listing
│   │   ├── text_editing.py        # Text, regex, and insert editing operations
│   │   ├── wrappers.py            # Tool wrapper utilities
│   │   └── registry.py            # Tool registration and discovery
│   ├── integrations/ # External integrations
│   │   ├── mcp_servers.py        # MCP server setup and management
│   │   ├── event_handlers.py     # Streaming event handlers
│   │   └── sdk_token_tracker.py  # SDK-level universal token tracking via monkey-patching
│   ├── utils/        # Utility modules
│   │   ├── logger.py            # Enterprise JSON logging with rotation and session correlation
│   │   ├── ipc.py               # IPC manager with pre-cached templates
│   │   ├── token_utils.py       # Token management with LRU caching
│   │   ├── file_utils.py        # File system utility functions
│   │   ├── document_processor.py # Document processing utilities
│   │   ├── json_utils.py        # JSON parsing and formatting utilities
│   │   ├── http_logger.py       # HTTP request logging middleware
│   │   ├── client_factory.py    # Azure OpenAI client factory and configuration
│   │   ├── validation.py        # Input validation and sanitization
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

## Key Architectural Concepts

### Orchestrator Pattern (Main Application)
The Python backend uses a clean orchestrator pattern for maintainability:

**src/app/state.py** (41 lines):
- `AppState` dataclass - single source of truth for application state
- Explicit state passing (no hidden global variables)
- Type-safe state management with full mypy compliance

**src/app/bootstrap.py** (170 lines):
- `initialize_application() -> AppState` - complete application setup
- Environment loading, settings validation, client creation
- MCP server initialization and agent creation
- Session manager setup and integrity validation
- Returns fully populated AppState ready for main loop

**src/app/runtime.py** (369 lines):
- 8 core runtime functions for message processing
- `ensure_session_exists` - lazy session creation with workspace isolation
- `process_user_input` - message streaming and token management
- `handle_session_command_wrapper` - session command dispatch
- `handle_file_upload` - file uploads with session isolation
- All functions receive AppState as explicit parameter

**src/main.py** (174 lines - 69% reduction from 557):
- Pure orchestrator - no business logic, only coordination
- Three phases: Bootstrap → Main Loop → Cleanup
- Command dispatch router (session commands, file uploads, chat messages)
- Graceful shutdown with MCP server cleanup

**Benefits**:
- Clear separation of concerns (state, bootstrap, runtime, orchestrator)
- Improved testability (can test each module independently)
- Better maintainability (changes localized to specific modules)
- Explicit state management (no hidden global mutations)

### Agent/Runner Pattern with MCP
The application uses OpenAI's Agent/Runner pattern which provides:

- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Sequential Thinking**: Advanced reasoning capabilities for complex problem-solving
- **Web Content Retrieval**: HTTP/HTTPS fetching via Fetch MCP server
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Full Async Architecture**: Consistent async/await for Agent/Runner, MCP servers, and all functions
- **Streaming Events**: Structured event handling for real-time responses
- **Token-Aware Sessions**: SQLite-based session management with automatic summarization
- **Type Safety**: Full mypy strict compliance with Pydantic runtime validation

### MCP Server Integration
The application integrates two MCP servers for enhanced capabilities:

**Sequential Thinking Server** (Node.js):
- Breaks down complex problems into manageable steps
- Provides structured reasoning with revision capabilities
- Enables branching and hypothesis testing
- Maintains context across multiple reasoning steps

**Fetch Server** (Python):
- HTTP/HTTPS web content retrieval
- Automatic content format handling
- Supports GET/POST requests with headers and parameters
- Integrated into `.juicer` venv for seamless operation

### Frontend Architecture (Modular ES6)
The renderer process uses a modular architecture for maintainability:

**Entry Point** (`renderer/index.js`):
- Orchestrates all modules via ES6 imports
- DOM element management and event listener coordination
- Main bot output processing loop with JSON protocol parsing
- Session management UI coordination

**Configuration** (`renderer/config/constants.js`):
- Centralized constants (MAX_MESSAGES, timeouts, JSON_DELIMITER, etc.)
- Single source of truth for configuration values

**Core State** (`renderer/core/state.js`):
- `BoundedMap`: Memory-efficient Map with automatic eviction at size limit
- `AppState`: Pub/sub state management with connection state machine
- Structured state organization (connection, message, functions, ui)

**UI Modules** (`renderer/ui/`):
- `chat-ui.js`: Message rendering (addMessage, streaming messages, clear chat)
- `function-card-ui.js`: Function call visualization cards with status updates
- `welcome-page.js`: Welcome page component with session loading
- `titlebar.js`: Cross-platform custom titlebar (Windows/Linux borderless window support)

**Event Handling** (`handlers/message-handlers.js`):
- Handler registry pattern replacing monolithic switch statement
- 14+ specialized handler functions for different message types
- Isolated, testable handlers (10-30 lines each)
- Main `processMessage()` router with error handling

**Services** (`services/session-service.js`):
- Session CRUD operations (load, create, switch, delete)
- Consistent error handling and result objects
- DRY patterns for session management

**Managers** (`renderer/managers/`):
- `theme-manager.js`: Dark mode and theme persistence
- `view-manager.js`: View state management (welcome vs chat)
- `dom-manager.js`: DOM element reference management
- `file-manager.js`: File drag-and-drop handling

**Utilities** (`renderer/utils/`):
- `markdown-renderer.js`: Markdown rendering with syntax highlighting (highlight.js), math (KaTeX), diagrams (Mermaid)
- `scroll-utils.js`: Auto-scroll behavior with user override detection
- `json-cache.js`: JSON parsing cache with LRU eviction
- `toast.js`: Toast notification system
- `file-utils.js`: File handling utilities

**Benefits**:
- Modular structure enables easier testing and maintenance
- Handler registry allows adding new message types without modifying routing logic
- Clear separation of concerns (state, UI, services, handlers, managers)
- ES6 modules with explicit imports/exports
- Manager pattern for complex UI state coordination

### Agent Configuration
```python
agent = Agent(
    name="Chat Juicer",
    model=deployment,
    instructions=SYSTEM_INSTRUCTIONS,
    tools=TOOLS,
    mcp_servers=[seq_thinking_server],
    reasoning_effort="medium"  # Configurable via REASONING_EFFORT env var
)
```

### Reasoning Effort Configuration
Chat Juicer supports configurable reasoning effort for reasoning models (GPT-5, O1, O3):

- **Purpose**: Controls the computational intensity of reasoning operations
- **Trade-offs**: Speed vs. thoroughness vs. cost (reasoning tokens are billed)
- **Configuration**: Set `REASONING_EFFORT` in `.env` file
- **Default**: `medium` (balanced for most use cases)

**Reasoning Levels**:
| Level | Speed | Cost | Reasoning Tokens | Use Case |
|-------|-------|------|------------------|----------|
| minimal | ⚡ Fastest | 💰 Cheapest | Fewest | Simple queries, quick responses |
| low | ⚡ Fast | 💰 Low | Light | Moderate complexity |
| medium | ⚙️ Balanced | 💰💰 Moderate | Balanced | Default, most tasks |
| high | 🐢 Slower | 💰💰💰 Expensive | Maximum | Complex reasoning, critical analysis |

**Token Impact**: Reasoning tokens appear separately in usage metrics as `output_tokens_details.reasoning_tokens`

### Function Architecture
All functions are implemented as async operations organized by module:

**File Operations** (`tools/file_operations.py`):
- **list_directory**: List directory contents with metadata (size, modified time, file count)
- **read_file**: Read files with automatic format conversion via markitdown

**Document Generation** (`tools/document_generation.py`):
- **generate_document**: Generate docs from templates with placeholder replacement

**Text Editing** (`tools/text_editing.py`):
- **text_edit**: Find and replace exact text in documents
- **regex_edit**: Pattern-based editing using regular expressions
- **insert_text**: Add new content before or after existing text

All tools registered in `tools/registry.py` for automatic discovery by Agent/Runner framework.

### Document Generation System
- Process multiple source formats using markitdown (PDF, Word, Excel, HTML, CSV, JSON, images)
- Template-first workflow with placeholder replacement
- Sequential Thinking for complex document structuring
- Token-aware content optimization (removes redundant whitespace, headers)
- Professional documentation generation with Mermaid diagram support

## Essential Commands

### Running the Application

**Using Makefile (Recommended)**
```bash
make run                # Production mode (npm start)
make dev                # Development mode with DevTools (npm run dev)
make backend-only       # Python backend only for testing
```

### Development & Quality

```bash
make test               # Syntax validation and compilation
make validate           # Validate Python code syntax
make lint               # Run ruff linter with auto-fix
make format             # Format code with black
make typecheck          # Run mypy type checking
make fix                # Auto-fix all fixable issues (format + lint with --fix)
make check              # Pre-commit validation gate (format check + lint + typecheck + test)
make precommit          # Run all pre-commit hooks (comprehensive, includes JS/TS)
make quality            # Run format + lint + typecheck (all checks)
make install-dev        # Install dev dependencies (linters, formatters, pre-commit)
make precommit-install  # Install pre-commit git hooks
```

### Logs & Monitoring

```bash
make logs               # Show conversation logs (tail -f, requires jq)
make logs-errors        # Show error logs (tail -f, requires jq)
make logs-all           # Show recent logs from both files
```

### Database Management

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

### Maintenance

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

### Diagnostics

```bash
make health             # Check system health and configuration
                        # - Verifies Node.js, Python, npm, pip
                        # - Checks .env configuration
                        # - Validates dependencies
                        # - Confirms MCP server installation
make status             # Alias for health check
```

## Critical Implementation Details

### Environment Requirements
Required:
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Format `https://resource.openai.azure.com/`
- `AZURE_OPENAI_DEPLOYMENT`: Model deployment name (e.g., "gpt-5-mini")

Optional:
- `REASONING_EFFORT`: Control reasoning effort for reasoning models (`minimal`, `low`, `medium`, `high`)
  - **minimal**: Fastest responses, fewest reasoning tokens (cheapest)
  - **low**: Light reasoning
  - **medium**: Balanced (default, recommended for most use cases)
  - **high**: Maximum thoroughness, most reasoning tokens (most expensive)

### Dependencies

#### Python Dependencies (src/requirements.txt)
- `openai>=1.0.0` - Azure OpenAI client library (AsyncOpenAI)
- `openai-agents>=0.3.3` - Agent/Runner framework with MCP support and SQLiteSession
- `markitdown>=0.1.0` - Document conversion to markdown (install with [all] for full format support)
- `tiktoken>=0.5.0` - Exact token counting for all models
- `python-json-logger>=2.0.0` - Structured JSON logging with rotating file handlers
- `python-dotenv>=1.0.0` - Environment variable management
- `httpx>=0.25.0` - Modern HTTP client (dependency of openai)

#### Node Dependencies (package.json)
**Production**:
- `marked` - Markdown parser
- `marked-footnote` - Footnote support for marked
- `dompurify` - HTML sanitization
- `highlight.js` - Syntax highlighting
- `katex` - Math rendering
- `mermaid` - Diagram rendering

**Development**:
- `electron` - Desktop application framework
- `vite` - Build tool and dev server
- `@tailwindcss/vite` - Tailwind CSS 4.x integration
- `@tailwindcss/typography` - Typography plugin
- `@biomejs/biome` - JavaScript/TypeScript linter and formatter

**MCP Servers**:
- `@modelcontextprotocol/server-sequential-thinking` - Sequential reasoning MCP server (npm global)

### Streaming Event Handling
The Agent/Runner pattern provides structured events:
1. `run_item_stream_event` - Message and tool events
2. `agent_updated_stream_event` - Agent state changes
3. Automatic conversion to Electron IPC format

### MCP Server Management
- Servers initialized with `MCPServerStdio`
- Automatic tool discovery and registration
- Graceful cleanup on shutdown
- Async/await for MCP server management

### State Management
- TokenAwareSQLiteSession manages conversation context with automatic summarization
- Session tracks tokens and triggers summarization at 20% of model limit (e.g., 54,400 tokens for GPT-5's 272k limit)
- Model-aware token limits: GPT-5 (272k), GPT-4o (128k), GPT-4 (128k), GPT-3.5-turbo (15.3k)
- Persistent SQLite database for fast session storage
- Accumulated tool tokens tracked separately from conversation tokens
- SDK-level automatic token tracking for all tool calls (native, MCP, future agents)
- Minimal client state - session handles all conversation management

## Troubleshooting

### Quick Diagnosis

```bash
make health             # Check system health and configuration
make logs-errors        # View error logs in real-time
make test               # Validate Python syntax
```

### Common Issues

1. **Setup failures**
   - Run `make health` to identify missing dependencies
   - Check Python version: `python3 --version` (need 3.13+)
   - Check Node version: `node --version` (need 16+)
   - Verify virtual environment: `ls -la .juicer/`

2. **"API key not found" error**
   - Verify `src/.env` exists and is configured
   - Check `make health` output for environment status
   - Ensure no placeholder values remain in .env

3. **MCP server not working**
   - Check installation: `which server-sequential-thinking`
   - Reinstall: `make install-mcp` or `sudo make install-mcp`
   - Verify global packages: `npm list -g --depth=0`

4. **Python import errors**
   - Ensure using .juicer venv: `make install-python`
   - Check dependencies: `.juicer/bin/pip list`
   - Reinstall: `make clean-venv && make install-python`

5. **Build or validation errors**
   - Run `make test` for detailed syntax validation
   - Check `make logs-errors` for runtime issues
   - Verify all files compile: `python -m compileall src/`

### Clean Install Workflow

If experiencing persistent issues:

```bash
make reset              # Complete reset (removes .env)
make setup              # Fresh automated installation
# Edit src/.env with credentials
make health             # Verify configuration
make test               # Validate syntax
make run                # Start application
```

## Common Development Tasks

### Adding New Functions
1. Create function implementation in appropriate `tools/*.py` module
2. Define tool schema following Agent/Runner pattern
3. Register in `tools/registry.py` using `FUNCTION_REGISTRY` dict
4. Function automatically available to Agent (including MCP tools)

### Adding New MCP Servers
```python
# In integrations/mcp_servers.py setup_mcp_servers() function
new_server = MCPServerStdio(
    params={
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-name"]
    }
)
await new_server.__aenter__()
servers.append(new_server)
```

### Customizing Sequential Thinking
The Sequential Thinking server is configured in `integrations/mcp_servers.py` and can be extended with additional MCP servers for:
- File system operations
- GitHub integration
- Database access
- Custom reasoning patterns

## Project Constraints

- No formal test framework configured (pragmatic choice given rapidly evolving AI SDKs)
- Manual validation required
- Agent/Runner pattern with full async architecture
- MCP servers run as subprocesses via npx
- All functions now async (updated from original sync implementation)

## Important Implementation Notes

### Logging Architecture
- Structured JSON logging with rotating files (conversations.jsonl, errors.jsonl)
- All logs include session_id automatically injected by ChatLogger
- Function operations log exact token counts for cost/usage analysis
- Renderer process logs forwarded to main process via IPC for centralized logging
- Replaced console.* statements with structured logging throughout

### Testing Approach
- Test Agent/Runner integration thoroughly
- Verify MCP server communication
- Check streaming event handling
- Ensure Electron IPC compatibility
- Test all function calls with new pattern

### Performance Considerations
- Full async/await architecture for optimal concurrency
- MCP servers add minimal overhead
- Streaming maintains real-time responsiveness
- SDK-level token tracking with zero overhead when disabled
- LRU caching for token counting (last 128 unique text/model pairs)
- Pre-cached IPC templates for reduced serialization

### Migration from Responses API
The project has been fully migrated from the Responses API to Agent/Runner pattern:
- No more manual response_id tracking
- Automatic function orchestration
- Native MCP server support
- Cleaner, more maintainable code
- ~50% reduction in boilerplate

## Summary

Chat Juicer is a production-grade application leveraging the modern Agent/Runner pattern with native MCP server integration, providing:

Key strengths:
- **Sequential Thinking**: Advanced reasoning capabilities with revision and hypothesis testing
- **Native MCP Support**: Direct integration without bridge functions
- **Full Async Architecture**: Consistent async/await throughout backend
- **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
- **Production Features**: Health monitoring, memory management, error recovery
- **Enterprise Logging**: Structured JSON with rotation and session correlation
- **Token Management**: SDK-level universal tracking with exact counting
- **Future-Proof**: Aligned with OpenAI's strategic direction

The application combines real-time AI chat with sophisticated reasoning and document generation capabilities through a production-ready Electron interface with native MCP server support.
