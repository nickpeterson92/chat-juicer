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

## Features

- 🖥️ **Desktop Application**: Production-grade Electron app with health monitoring and auto-recovery
- 🤖 **Agent/Runner Pattern**: Native OpenAI Agents SDK with automatic tool orchestration
- 🧠 **Sequential Thinking**: MCP server for advanced multi-step reasoning and problem decomposition
- 💾 **Smart Session Management**: TokenAwareSQLiteSession with auto-summarization at 20% threshold
- 🔄 **Streaming Responses**: Real-time AI response streaming with structured event handling
- 🛠️ **Function Calling**: Async native tools and MCP server integration
- 📝 **Structured Logging**: Enterprise-grade JSON logging with rotation and session correlation
- 🔐 **Azure OpenAI Integration**: Secure connection to Azure OpenAI services
- 📊 **Token Management**: SDK-level universal token tracking with exact counting via tiktoken
- ⚡ **Full Async Architecture**: Consistent async/await throughout backend
- 📄 **Document Generation**: Template-based document creation with multi-format support (PDF, Word, Excel, HTML)
- 🔧 **Editing Tools**: Text, regex, and insert operations for document modification
- 🎯 **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
- 🏗️ **Production Features**: Memory management, error recovery, performance optimization

## Architecture## Architecture

Chat Juicer uses OpenAI's **Agent/Runner pattern** which provides:
- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Token-Aware Sessions**: SQLite-based session management with automatic summarization
- **Full Async Architecture**: Consistent async/await for Agent/Runner, MCP servers, and all functions
- **Streaming Events**: Structured event handling for real-time responses
- **Smart State Management**: Session handles conversation context with token tracking
- **SDK-Level Token Tracking**: Universal token tracking via elegant monkey-patching

### Architecture Flow

```mermaid
graph TB
    subgraph "Electron Frontend"
        UI[Chat UI<br/>index.html]
        Renderer[Renderer Process<br/>BoundedMap + AppState]
        Main[Main Process<br/>Health Monitor]
        Preload[Preload Script<br/>Secure IPC Bridge]
    end

    subgraph "Python Backend"
        Agent[Agent/Runner<br/>main.py]
        Session[(TokenAwareSQLiteSession<br/>Auto-summarization @ 20%)]
        Functions[Async Functions<br/>functions.py]
        Models[Pydantic Models<br/>Runtime Validation]
        TokenTracker[SDK Token Tracker<br/>Universal Tracking]
    end

    subgraph "MCP Servers"
        SeqThinking[Sequential Thinking<br/>Multi-step Reasoning]
        Future[Future MCP Servers<br/>GitHub, DB, etc.]
    end

    subgraph "External Services"
        Azure[Azure OpenAI<br/>GPT-5/GPT-4]
        Docs[(Documents<br/>PDF/Word/Excel)]
    end

    subgraph "Logging & Storage"
        Logs[JSON Logs<br/>conversations.jsonl]
        Templates[Document Templates<br/>with placeholders]
        Output[Generated Output<br/>Markdown/Reports]
    end

    UI -->|User Input| Renderer
    Renderer -->|IPC| Preload
    Preload -->|Secure Bridge| Main
    Main -->|Spawn Process| Agent

    Agent -->|Streaming Events| Main
    Agent -->|Tool Calls| Functions
    Agent -->|MCP Protocol| SeqThinking
    Agent -->|MCP Protocol| Future
    Agent -->|API Calls| Azure

    Agent <-->|Context| Session
    Session -->|Token Tracking| TokenTracker

    Functions -->|Read/Process| Docs
    Functions -->|Generate| Output
    Functions -->|Use| Templates

    Agent -->|Structured Logs| Logs
    Main -->|5-min Health Check| Agent

    style UI fill:#e1f5fe
    style Agent fill:#fff3e0
    style Session fill:#f3e5f5
    style Azure fill:#e8f5e9
    style SeqThinking fill:#fce4ec
    style Logs fill:#f5f5f5
```

### Key Architectural Components:
- **Backend**: Python with async functions, Pydantic models, type safety (mypy strict=true)
- **Frontend**: Electron with memory-bounded state management and health monitoring
- **Session**: TokenAwareSQLiteSession with 20% threshold auto-summarization
- **Logging**: Enterprise JSON logging with rotation and session correlation
- **Type System**: Protocols for SDK integration, Pydantic for validation, TypedDict for data

## Prerequisites## Prerequisites

- Node.js 16+ and npm
- Python 3.9+ (for type annotations and modern async features)
- Azure OpenAI resource with deployment (e.g., gpt-5-mini, gpt-4o, gpt-4)
- Azure OpenAI API credentials
- Internet connection for MCP server downloads

## Requirements## Requirements

### Node.js Dependencies
- `electron`: Desktop application framework (devDependency)
- Node.js 16+ and npm required

### Python Dependencies
- Python 3.9+ required (for modern type hints and async features)
- Full type safety with mypy strict=true
- See dependencies section below for package list

## Installation## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/chat-juicer.git
   cd chat-juicer
   ```

2. **Install Node dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   cd src/
   pip install -r requirements.txt

   # For full document format support (PDF, Word, Excel, etc.):
   pip install 'markitdown[all]'
   ```

4. **Install MCP Server (for Sequential Thinking)**
   ```bash
   # Install globally for the Sequential Thinking MCP server
   npm install -g @modelcontextprotocol/server-sequential-thinking
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

### Running the Application

**Launch the Electron desktop app:**
```bash
npm start
```

**Development mode with DevTools:**
```bash
npm run dev
```

**Python backend only (for testing):**
```bash
python src/main.py
```

### Chat Commands

- Type your message and press Enter to send
- Type `quit`, `exit`, or `bye` to end the conversation
- Use Ctrl+C to force quit if needed

## Project Structure

```
chat-juicer/
├── electron/          # Electron main process and utilities
│   ├── main.js       # Electron main process, IPC handlers, health monitoring
│   ├── preload.js    # Preload script for secure context-isolated IPC
│   ├── renderer.js   # Renderer with BoundedMap memory management and AppState pub/sub
│   └── logger.js     # Centralized structured logging with IPC forwarding
├── ui/               # Frontend assets
│   └── index.html    # Main chat UI with markdown rendering
├── src/              # Python backend (modular architecture)
│   ├── main.py       # Application entry point
│   ├── core/         # Core business logic
│   │   ├── agent.py       # Agent/Runner implementation with MCP support
│   │   ├── session.py     # TokenAwareSQLiteSession with auto-summarization
│   │   └── constants.py   # Configuration with Pydantic Settings validation
│   ├── models/       # Data models and type definitions
│   │   ├── api_models.py   # Pydantic models for API responses
│   │   ├── event_models.py # Event and message models
│   │   └── sdk_models.py   # Protocol typing for SDK integration
│   ├── tools/        # Function calling tools
│   │   ├── document_generation.py # Document generation from templates
│   │   ├── file_operations.py     # File reading and directory listing
│   │   ├── text_editing.py        # Text editing operations
│   │   └── registry.py            # Tool registration and discovery
│   ├── integrations/ # External integrations
│   │   ├── mcp_servers.py        # MCP server setup and management
│   │   ├── event_handlers.py     # Streaming event handlers
│   │   ├── sdk_token_tracker.py  # SDK-level universal token tracking
│   │   └── tool_patch.py         # Tool call delay patches (disabled)
│   ├── infrastructure/ # Infrastructure and utilities
│   │   ├── logger.py            # Enterprise JSON logging with rotation
│   │   ├── ipc.py               # IPC manager with pre-cached templates
│   │   ├── utils.py             # Token management with LRU caching
│   │   ├── file_utils.py        # File utility functions
│   │   └── document_processor.py # Document processing utilities
│   └── requirements.txt  # Python dependencies
├── sources/          # Source documents for processing
├── output/           # Generated documentation output
├── templates/        # Document templates with {{placeholders}}
├── logs/             # Log files (gitignored)
│   ├── conversations.jsonl  # Structured conversation logs with token metadata
│   └── errors.jsonl  # Error and debugging logs
└── docs/             # Documentation
    ├── agent-runner-migration-analysis.md  # Migration documentation
    └── token-streaming-implementation.md   # Token streaming details
```

## Key Components

### Python Backend (`src/`)

**Core Business Logic** (`core/`)
- **agent.py**: Agent/Runner implementation with MCP server integration and streaming event handling
- **session.py**: TokenAwareSQLiteSession class with automatic summarization at 20% token threshold
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
- **tool_patch.py**: Configurable delays for tool calls (currently set to 0.0 - disabled)

**Infrastructure** (`infrastructure/`)
- **logger.py**: Enterprise JSON logging with rotation and session correlation
- **ipc.py**: IPC manager with pre-cached templates for performance
- **utils.py**: Token management utilities with LRU caching
- **file_utils.py**: File system utility functions
- **document_processor.py**: Document processing and optimization utilities

**Entry Point**
- **main.py**: Application entry point and async event loop management

### Electron Frontend### Electron Frontend (`electron/`)

- **main.js**: Main process with health monitoring (5-min intervals), auto-recovery, graceful shutdown
- **preload.js**: Secure context-isolated bridge between main and renderer processes
- **renderer.js**: UI state management with BoundedMap for memory safety and AppState pub/sub
- **logger.js**: Centralized logging with IPC forwarding from renderer to main process

## Function Calling## Function Calling

The application supports both native functions and MCP server tools:

### Native Functions (Async)
- **list_directory**: Directory listing with metadata (size, modified time, file count)
- **read_file**: File reading with automatic format conversion via markitdown (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON, images)
- **generate_document**: Template-based document generation with placeholder replacement
- **text_edit**: Find and replace exact text in documents (or delete by setting replace_with='')
- **regex_edit**: Pattern-based editing using regular expressions
- **insert_text**: Add new content before or after existing text

### MCP Server Integration### MCP Server Integration
- **Sequential Thinking**: Advanced multi-step reasoning with revision capabilities and hypothesis testing
- Extensible to add more MCP servers (filesystem, GitHub, databases, etc.)

### Features
- Automatic tool orchestration by Agent/Runner framework
- SDK-level universal token tracking for all tools (native, MCP, future agents)
- Exact token counting using tiktoken with LRU caching
- Content optimization to reduce token usage (removes redundant whitespace, headers)
- Tool call delays configurable but disabled (0.0s) after moving to client-side sessions
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

### Code Quality Tools

The project uses pre-commit hooks to ensure code quality. Install development dependencies:

```bash
# Install development tools
pip install -r requirements-dev.txt

# Install pre-commit hooks
pre-commit install
```

Now code quality checks run automatically on `git commit`. To run manually:

```bash
# Run all hooks on all files
pre-commit run --all-files

# Or run individual tools:
black src/              # Format code
ruff check src/ --fix   # Lint and auto-fix
mypy src/               # Type checking
```

### Adding New Features

1. **Backend changes**: Modify Python files in `src/`
2. **Frontend changes**: Update Electron files in `electron/` and `ui/`
3. **Function additions**: Extend `src/functions.py`

### Testing

Manual testing workflow:
```bash
# Syntax validation
python -m py_compile src/main.py

# Run backend tests
python src/main.py

# Test Electron app
npm start
```

## Features in Detail

### Session Management & Summarization
The application features advanced session management:
- **TokenAwareSQLiteSession**: Extends SDK's SQLiteSession with automatic summarization
- **Smart Triggers**: Summarizes at 20% of model's token limit (configurable via CONVERSATION_SUMMARIZATION_THRESHOLD)
- **Model-Aware Limits**: GPT-5 (272k), GPT-4o (128k), GPT-4 (128k), GPT-3.5-turbo (15.3k)
- **Context Preservation**: Keeps last 2 user messages unsummarized
- **Seamless Experience**: Transparent summarization without user interruption
- **Tool Token Tracking**: Accumulates tokens from tool calls separately
- **In-Memory Database**: Fast session storage during app lifetime

### Rate Limiting & Error Handling
The application includes robust error handling:
- Automatic rate limit detection with user-friendly messages
- Graceful handling of RS_ and FC_ streaming errors (now resolved with client-side sessions)
- Tool call delays configurable but disabled (MCP_TOOL_DELAY=0.0, NATIVE_TOOL_DELAY=0.0)
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

Required dependencies (from `src/requirements.txt`):
- `openai>=1.0.0`: Azure OpenAI client library (AsyncOpenAI)
- `openai-agents>=0.2.0`: Agent/Runner framework with MCP support and SQLiteSession
- `markitdown>=0.1.0`: Document conversion to markdown (PDF, Word, Excel, HTML, etc.)
- `tiktoken>=0.5.0`: OpenAI's official token counting library for exact token counts
- `python-json-logger>=2.0.0`: Structured JSON logging for conversations and errors
- `python-dotenv>=1.0.0`: Environment variable management (.env file loading)
- `httpx>=0.25.0`: Modern HTTP client (dependency of openai library)
## Troubleshooting

### Common Issues

1. **"API key not found" error**
   - Ensure `.env` file exists in `src/` directory
   - Verify `AZURE_OPENAI_API_KEY` is set correctly

2. **Connection errors**
   - Check `AZURE_OPENAI_ENDPOINT` format (must include `https://`)
   - Verify network connectivity to Azure

3. **Python not found**
   - Ensure Python 3.8+ is installed and in PATH
   - Try using `python3` instead of `python`

4. **Electron window doesn't open**
   - Check Node.js version (requires 16+)
   - Run `npm install` to ensure dependencies are installed

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Powered by [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- Uses the OpenAI Agents library for streaming support

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review logs in `logs/` directory for debugging
