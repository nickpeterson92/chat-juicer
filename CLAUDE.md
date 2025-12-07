# CLAUDE.md

This file provides guidance to you (Claude) when working with code in this repository.

⚠️ **CRITICAL** ⚠️ - Open your heart, your mind and your third eye. Take a deep breath and focus.

🚨 **NEVER** use emojis in logging statements! 🚨

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
│   └── renderer/     # Component-based renderer process (ES6 modules)
│       ├── index.js              # Entry point (imports CSS + bootstrapSimple)
│       ├── bootstrap.js          # 7-phase bootstrap orchestrator
│       ├── bootstrap/            # Error recovery, validators, phases 1-7
│       │   └── phases/phase1-7   # Adapters → State/DOM → Services → Components → Handlers → Plugins → Data
│       ├── adapters/             # DOM, IPC, Storage adapters + barrel
│       ├── config/               # constants, colors, model-metadata
│       ├── core/                 # AppState + EventBus + lifecycle helpers
│       │   ├── component-lifecycle.js
│       │   ├── event-bus.js
│       │   ├── lifecycle-manager.js
│       │   └── state.js
│       ├── managers/             # DOM + view + file rendering helpers
│       │   ├── dom-manager.js
│       │   ├── file-manager.js
│       │   └── view-manager.js
│       ├── services/             # Business logic (AppState-backed)
│       │   ├── message-service.js, file-service.js
│       │   ├── function-call-service.js, session-service.js
│       ├── handlers/             # Event wiring
│       │   ├── message-handlers-v2.js  # EventBus-driven streaming + tool cards
│       │   ├── session-list-handlers.js
│       │   ├── chat-events.js, file-events.js, session-events.js
│       ├── plugins/              # Plugin registry + core plugins
│       │   ├── core-plugins.js, plugin-interface.js, index.js
│       ├── ui/                   # UI layer
│       │   ├── components/       # ChatContainer, ConnectionStatus, FilePanel, InputArea, ModelSelector
│       │   ├── renderers/        # session-list-renderer.js + index.js
│       │   ├── chat-ui.js, function-card-ui.js, welcome-page.js, titlebar.js
│       │   └── utils/welcome-animations.js
│       ├── viewmodels/           # message-viewmodel.js, session-viewmodel.js
│       └── utils/                # css-variables, markdown-renderer, scroll-utils, toast, chat-model-updater, etc.
├── ui/               # Frontend static assets
│   ├── index.html    # Main chat UI (loads renderer/index.js as ES6 module)
│   ├── input.css     # Tailwind CSS source
│   ├── chat-juicer-logo-real.svg  # Application logo
│   └── smoke-loading.svg       # Loading animation
├── src/              # Python backend (modular architecture)
│   ├── main.py       # Application orchestrator (174 lines, pure coordination)
│   ├── __init__.py   # Package initialization
│   ├── .env.example  # Environment variable template
│   ├── requirements.txt  # Python dependencies (Python 3.13+ required)
│   ├── app/          # Application modules (orchestrator pattern)
│   │   ├── __init__.py
│   │   ├── state.py          # AppState dataclass (single source of truth)
│   │   ├── bootstrap.py      # Application initialization and configuration
│   │   └── runtime.py        # Core runtime operations (8 functions: session, message handling)
│   ├── core/         # Core business logic
│   │   ├── __init__.py
│   │   ├── agent.py            # Agent/Runner implementation with MCP support
│   │   ├── session.py          # TokenAwareSQLiteSession with auto-summarization (20% threshold - Layer 1)
│   │   ├── full_history.py     # FullHistoryStore for complete UI-facing conversation history (Layer 2)
│   │   ├── session_manager.py  # Multi-session lifecycle management with file handle cleanup
│   │   ├── session_commands.py # Session command handlers (create, switch, delete, list)
│   │   ├── prompts.py          # System instruction prompts and templates
│   │   └── constants.py        # Configuration with Pydantic Settings validation
│   ├── models/       # Data models and type definitions (Pydantic)
│   │   ├── __init__.py
│   │   ├── api_models.py      # Pydantic models for API responses
│   │   ├── event_models.py    # Event and message models for IPC
│   │   ├── ipc_models.py      # IPC message structure models
│   │   ├── sdk_models.py      # Protocol typing for SDK integration
│   │   └── session_models.py  # Session metadata and persistence models
│   ├── tools/        # Function calling tools (async)
│   │   ├── __init__.py
│   │   ├── document_generation.py # Document generation from templates
│   │   ├── file_operations.py     # File reading and directory listing (markitdown)
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

## Key Architectural Concepts

### Renderer Runtime Highlights
- 7-phase bootstrap (`bootstrap.js`) wiring adapters → AppState/DOM → services → components → event handlers → plugins → initial data, with phase validation and degraded-mode recovery.
- Global `EventBus` (`core/event-bus.js`) drives message routing; `message-handlers-v2.js` maps backend events (`message:*`) to chat updates, function cards, and analytics.
- `AppState` (`core/state.js`) is the single source of truth for connection, sessions, messages, functions, UI, Python status, and files; components subscribe for reactive DOM updates.
- Services (`session-service.js`, `file-service.js`, `function-call-service.js`, `message-service.js`) are pure business logic and require `appState` in constructors (state-backed, no DOM).
- UI components: ChatContainer (streaming + tool card aware), InputArea (model selector hook), FilePanel (tabbed sources/output with handle cleanup), ModelSelector (shared welcome/chat with optional backend sync), ConnectionStatus.
- View management: `view-manager.js` controls welcome → chat transitions, seeds ModelSelector, and syncs MCP/model config before the first message; `file-manager.js` is migrating to AppState-driven rendering via `loadFilesIntoState`.

### Orchestrator Pattern (Main Application)
The Python backend uses a clean orchestrator pattern for maintainability:

**src/app/state.py**:
- `AppState` dataclass - single source of truth for application state
- Explicit state passing (no hidden global variables)
- Type-safe state management with full mypy compliance

**src/app/bootstrap.py**:
- `initialize_application() -> AppState` - complete application setup
- Environment loading, settings validation, client creation
- MCP server initialization (sequential, fetch, optional Tavily) and agent creation
- Session manager setup, metadata/database sync, and integrity validation
- Returns fully populated AppState ready for main loop

**src/app/runtime.py**:
- Core runtime functions for message processing
- `ensure_session_exists` - lazy session creation with workspace isolation
- `process_user_input` - message streaming, token management, post-run summarization check, and metadata update in finally
- `handle_session_command_wrapper` - session command dispatch
- `handle_file_upload` - file uploads with session isolation
- `update_session_metadata` - message counts, tool token accumulation, auto-title trigger
- `send_session_created_event` - deferred until after first message completes
- All functions receive AppState as explicit parameter

**src/main.py**:
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

- **Native MCP Server Integration**: Sequential Thinking + Fetch by default, Tavily search when configured
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Full Async Architecture**: Consistent async/await for Agent/Runner, MCP servers, and all functions
- **Streaming Events**: Structured event handling for real-time responses (including argument deltas and reasoning)
- **Token-Aware Sessions**: SQLite-based session management with automatic summarization and post-run token checks
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
- Integrated into `.juicer` venv for seamless operation

**Tavily Search** (Node.js, optional):
- Enabled when `TAVILY_API_KEY` is present
- Provides search/crawl MCP endpoints via npx

### Frontend Architecture (Component-Based ES6)
The renderer process uses a component-based modular architecture for maintainability and reusability:

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

**UI Components** (`renderer/ui/components/`):
- `chat-container.js`: Message container component
  - Manages message display area with scroll behavior
  - Encapsulated container logic for maintainability
- `connection-status.js`: Connection status indicator component
  - Real-time connection state visualization
  - Integrated with AppState connection state machine
- `file-panel.js`: File management component with proper lifecycle
  - File handle cleanup via `closeAllHandles()` method
  - Prevents "too many open files" errors during session deletion
  - Safe DOM manipulation with event listener cleanup
- `input-area.js`: Chat input field component
  - Input controls, send button, file upload integration
  - Model selector integration for chat view
  - Enter/Shift+Enter keyboard handling
- `model-selector.js`: Reusable model and reasoning effort selection component
  - Shared across welcome page and chat page (DRY principle)
  - Supports local-only mode (welcome) and auto-sync mode (chat)
  - Prefetched configuration for instant loading
- `index.js`: Clean component exports for simplified imports

**UI Renderers** (`renderer/ui/renderers/`):
- `file-list-renderer.js`: File list visualization
  - Renders uploaded files with metadata (size, type)
  - File removal and preview controls
- `function-card-renderer.js`: Function call card rendering
  - Visual representation of tool calls with status
  - Argument display and result formatting
- `message-renderer.js`: Message formatting and rendering
  - Markdown rendering with syntax highlighting
  - Role-based styling (user, assistant, system)
- `session-list-renderer.js`: Session list rendering
  - Session metadata display (title, timestamp, message count)
  - Active session highlighting and selection controls
- `index.js`: Clean renderer exports

**UI Modules** (`renderer/ui/`):
- `chat-ui.js`: Message rendering operations
- `function-card-ui.js`: Function call visualization cards with status updates
- `welcome-page.js`: Welcome page component with session loading
- `titlebar.js`: Cross-platform custom titlebar (Windows/Linux borderless window support)

**Event Handling** (`handlers/`):
- `message-handlers-v2.js`: EventBus-integrated message handlers for decoupled architecture
  - 14+ specialized handler functions registered with EventBus
  - Event-driven message processing with pub/sub pattern
  - Isolated, testable handlers (10-30 lines each)
- `session-list-handlers.js`: Session list interactions
  - Proper cleanup before deletion (closeAllHandles)
  - Prevents resource leaks during session management

**Services** (`services/session-service.js`):
- Session CRUD operations (load, create, switch, delete)
- Consistent error handling and result objects
- DRY patterns for session management

**Managers** (`renderer/managers/`):
- `view-manager.js`: View state management (welcome vs chat) with model selector coordination
- `dom-manager.js`: DOM element reference management
- `file-manager.js`: File operations and drag-and-drop handling

**Utilities** (`renderer/utils/`):
- `markdown-renderer.js`: Markdown rendering with syntax highlighting (highlight.js), math (KaTeX), diagrams (Mermaid)
- `scroll-utils.js`: Auto-scroll behavior with user override detection
- `json-cache.js`: JSON parsing cache with LRU eviction
- `toast.js`: Toast notification system
- `file-utils.js`: File handling utilities

**Benefits**:
- Component-based architecture enables code reuse (ModelSelector shared across views)
- Proper lifecycle management prevents resource leaks
- Handler registry allows adding new message types without modifying routing logic
- Clear separation of concerns (state, UI, components, services, handlers, managers)
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
| none | ⚡ Fastest | 💰 Cheapest | None | No reasoning, direct responses |
| low | ⚡ Fast | 💰 Low | Light | Moderate complexity |
| medium | ⚙️ Balanced | 💰💰 Moderate | Balanced | Default, most tasks |
| high | 🐢 Slower | 💰💰💰 Expensive | Maximum | Complex reasoning, critical analysis |

**Token Impact**: Reasoning tokens appear separately in usage metrics as `output_tokens_details.reasoning_tokens`

### Function Architecture
All tools are async and organized under `src/tools/`:

**File Operations** (`tools/file_operations.py`):
- **list_directory**: List directory contents with metadata (size, modified time, file count)
- **read_file**: Read files with automatic format conversion via markitdown; supports head/tail previews
- **search_files**: Glob search with max-results guardrails

**Document Generation** (`tools/document_generation.py`):
- **generate_document**: Save generated content to `output/` with optional backups and session sandboxing

**Text Editing** (`tools/text_editing.py`):
- **edit_file**: Batch text edits with git-style diffs and whitespace-flexible matching (auto-prefixes `output/` unless scoped)

Registration & isolation:
- `tools/registry.py` exposes `AGENT_TOOLS` + `FUNCTION_REGISTRY`
- `tools/wrappers.py` builds session-aware wrappers via `create_session_aware_tools(session_id)` to enforce workspace isolation (data/files/{session_id})

### Document Handling
- `read_file` converts many formats via markitdown and auto-summarizes documents exceeding the configured token threshold.
- `generate_document` writes to session-scoped `output/` with optional backups; no implicit templating is applied.
- Session-aware wrappers ensure all file operations stay inside `data/files/{session_id}`.

## Frontend Logging Guidelines

The frontend uses a minimal logging strategy to keep the console clean and useful:

### Logging Rules

1. **Only log errors** - Use `console.error()` for actual errors that need attention
2. **No progress logs** - Don't log phase completions, plugin installations, or component mounting
3. **No debug logs in production** - Remove or guard verbose debug logs with `import.meta.env.DEV`
4. **Use consistent prefixes** - Format: `[ModuleName] Error description`
5. **Never use emojis** - Keep logs professional and grep-friendly

### Allowed Logging

```javascript
// Errors - always allowed
console.error("[session] Failed to create session:", error);
console.error("[Bootstrap] Failed:", error);

// Warnings - for recoverable issues
console.warn("[Bootstrap] Continuing in degraded mode:", message);

// Debug (dev-only) - guard with import.meta.env.DEV
if (import.meta.env.DEV) {
  console.debug("[EventBus] debug:event", data);
}
```

### Forbidden Logging

```javascript
// NO: Progress/status logs
console.log("Phase 5 complete");
console.log("[Plugin] Installed");

// NO: Verbose debug logs
console.log("Received message:", message);
console.log("Creating function card:", { callId, name });

// NO: Emojis in logs
console.log("Starting...");
console.log("Complete");
```

### Important Logging Infrastructure

- **Main process**: Use `electron/logger.js` Logger class with levels and file rotation
- **Renderer process**: Use `window.electronAPI.log()` for important events that need persistence
- **Development**: Debug API available at `window.__CHAT_JUICER_DEBUG__` for interactive debugging

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

## Color System Architecture

Chat Juicer uses a **hybrid color system** combining CSS custom properties with Tailwind CSS v4 for optimal maintainability and developer experience.

**Key Concepts**:
- **28 semantic tokens** defined in `ui/input.css` (single source of truth)
- **Tailwind v4 utilities** via arbitrary values: `bg-[var(--color-surface-1)]`
- **Single unified color system** with consistent visual design
- **JavaScript utilities** for dynamic color access (`css-variables.js`)

**Token Categories**:
- **Surfaces** (6): `--color-surface-1/2/3`, overlays, hover, active states
- **Text** (5): `--color-text-primary/secondary/assistant/user/on-surface`
- **Borders** (4): `--color-border-primary/secondary/focus/hover`
- **Brand** (3): `--color-brand-primary/secondary`, gradient
- **Status** (4): `--color-status-info/success/warning/error`
- **Special** (6): Function states, scrollbars, overlays

**Usage Examples**:

```html
<!-- HTML: Use Tailwind arbitrary values -->
<div class="bg-[var(--color-surface-1)] text-[var(--color-text-primary)]">
  Content
</div>
```

```javascript
// JavaScript: Read CSS variables at runtime
import { getBrandPrimaryColor } from './utils/css-variables.js';
const brandColor = getBrandPrimaryColor(); // '#0066cc'
```

**Maintenance**: See `claudedocs/COLOR_SYSTEM_MASTER_DESIGN.md` Part 5 for how to add new colors or change values.

**Implementation Status**:
- Phase 1 Complete (Foundation) - CSS variables and Tailwind configuration ✅
- Phase 2 Complete (HTML Migration) - All HTML arbitrary values migrated to semantic tokens ✅

### Phase 2 HTML Migration (Completed 2025-11-13)

The HTML codebase has been fully migrated from arbitrary color values to semantic tokens:

**Migration Pattern**:
```html
<!-- Before: Hardcoded colors with conditional variants -->
<div class="bg-[#f8f8f6] dark:bg-[#141622]">

<!-- After: Single semantic token -->
<div class="bg-surface-1">
```

**Completed Replacements** (7 total):
- Body background: `bg-white dark:bg-[#191b29]` → `bg-surface-2`
- Sidebar: `bg-[#f8f8f6] dark:bg-[#141622]` → `bg-surface-1`
- Files panel: `bg-[#f8f8f6] dark:bg-[#141622]` → `bg-surface-1`
- Chat header: `bg-[#f8f8f6] dark:bg-[#141622]` → `bg-surface-1`
- Chat container: `bg-[#f8f8f6] dark:bg-[#141622]` → `bg-surface-1`
- Input area: `bg-[#f8f8f6] dark:bg-[#141622]` → `bg-surface-1`

**Benefits Realized**:
- Eliminated 14 hardcoded color values (7 conditional pairs)
- Reduced CSS class verbosity (1 class vs 2 classes per element)
- Consistent color application via CSS variables (no JavaScript required)
- Single source of truth for color values

**Validation**: All changes tested thoroughly. Zero visual differences from baseline. Color system performs optimally.

## Critical Implementation Details

### Environment Requirements
Required:
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Format `https://resource.openai.azure.com/`
- `AZURE_OPENAI_DEPLOYMENT`: Model deployment name (e.g., "gpt-5-mini")

Optional:
- `REASONING_EFFORT`: Control reasoning effort for reasoning models (`none`, `low`, `medium`, `high`)
  - **none**: No reasoning, fastest responses (cheapest)
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

### Resource Management
The application includes robust resource management to prevent file handle exhaustion:

**Session Deletion (3-Layer Defense)**:
1. **Frontend Cleanup**: FilePanel component explicitly closes all file handles before deletion
   - `closeAllHandles()` method removes file previews and event listeners
   - DOM cloning technique forces garbage collection
2. **Backend Garbage Collection**: Python `gc.collect()` + 50ms delay before `shutil.rmtree()`
   - Forces Python to close unreferenced file handles
   - Allows OS time to release handles
3. **Increased Limits**: File descriptor limit increased from 256→4096 at startup (macOS/Linux)
   - Prevents "too many open files" errors (errno 24)
   - Configured in `bootstrap.py` initialization

**Benefits**:
- Reliable session deletion without orphaned directories
- Prevents file handle exhaustion in production
- Graceful degradation on Windows (no resource module)
- Comprehensive error messages for debugging

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

## Project Architecture Notes

- Agent/Runner pattern with full async architecture
- MCP servers run as subprocesses via npx
- All functions now async (updated from original sync implementation)
- Production-grade testing infrastructure: 1,192 tests with 87% coverage (614 Python + 578 JavaScript)

## Important Implementation Notes

### Logging Architecture
- Structured JSON logging with rotating files (conversations.jsonl, errors.jsonl)
- All logs include session_id automatically injected by ChatLogger
- Function operations log exact token counts for cost/usage analysis
- Renderer process logs forwarded to main process via IPC for centralized logging
- Replaced console.* statements with structured logging throughout

### Testing Infrastructure
The project maintains comprehensive test coverage with modern tooling:

**Tests**:
- Python tests live under `tests/` (app/core/models/utils) using pytest and fixtures.
- Frontend tests cover renderer services/components/utilities (see `tests/` JS files).
- Use `make test` / `make quality` / `make precommit` for common flows.

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
