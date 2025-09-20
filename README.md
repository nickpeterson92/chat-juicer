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

- 🖥️ **Desktop Application**: Native Electron app with modern UI and health monitoring
- 🤖 **Agent/Runner Pattern**: Modern OpenAI architecture with automatic orchestration
- 🧠 **Sequential Thinking**: MCP server for advanced multi-step reasoning and problem decomposition
- 💾 **Smart Session Management**: Token-aware SQLite sessions with automatic summarization at 80% threshold
- 🔄 **Streaming Responses**: Real-time AI response streaming with structured event handling
- 🛠️ **Function Calling**: Native tools and MCP server integration with race condition mitigation
- 📝 **Conversation Logging**: Structured JSON logging with rotating file management
- 🔐 **Azure OpenAI Integration**: Secure connection to Azure OpenAI services
- 📊 **Token Management**: Exact token counting with tiktoken, automatic optimization, and model-aware limits
- ⚡ **Async Architecture**: Async/await for Agent/Runner, MCP servers, and functions
- 📄 **Document Generation**: Template-based document creation with multi-format support (PDF, Word, Excel, HTML)
- 🔧 **Editing Tools**: Text, regex, and insert operations for document modification
- 🎯 **Error Resilience**: Graceful handling of rate limits, streaming errors, and connection issues

## Architecture

Chat Juicer uses OpenAI's **Agent/Runner pattern** which provides:
- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Token-Aware Sessions**: SQLite-based session management with automatic summarization
- **Hybrid Async Model**: Async/await for Agent/Runner and MCP servers, synchronous for functions
- **Streaming Events**: Structured event handling for real-time responses
- **Smart State Management**: Session handles conversation context with token tracking
- **Race Condition Mitigation**: Configurable delays for tool calls to prevent syncing errors server-side (currently disabled with client side sessions)

## Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- Azure OpenAI resource with deployment (e.g., gpt-4, gpt-3.5-turbo)
- Azure OpenAI API credentials
- Internet connection for MCP server downloads

## Requirements

### Node.js Dependencies
- `electron`: Desktop application framework (devDependency)
- Node.js 16+ and npm required

### Python Dependencies
- Python 3.8+ required
- See dependencies section below for package list

## Installation

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
│   ├── main.js       # Electron main process, IPC handlers
│   ├── preload.js    # Preload script for secure IPC
│   ├── renderer.js   # Renderer process script
│   └── logger.js     # Electron-side structured logging
├── ui/               # Frontend assets
│   └── index.html    # Main chat UI
├── src/              # Python backend (Agent/Runner pattern)
│   ├── main.py       # Agent/Runner implementation with MCP support
│   ├── session.py    # TokenAwareSQLiteSession for auto-summarization
│   ├── functions.py  # Document generation and file tools (synchronous)
│   ├── tool_patch.py # Tool call delay patches for race condition mitigation
│   ├── logger.py     # Python logging framework (JSON format)
│   ├── utils.py      # Token management and rate limiting utilities
│   ├── constants.py  # Centralized configuration constants
│   └── requirements.txt  # Python dependencies
├── sources/          # Source documents for processing
├── output/           # Generated documentation output
├── templates/        # Document templates with {{placeholders}}
├── logs/             # Log files (gitignored)
│   ├── conversations.jsonl  # Structured conversation logs
│   └── errors.jsonl  # Error logs
└── docs/             # Documentation
    └── agent-runner-migration-analysis.md  # Migration documentation
```

## Key Components

### Python Backend (`src/`)

- **main.py**: Agent/Runner implementation with MCP server integration and streaming event handling
- **session.py**: TokenAwareSQLiteSession class extending SDK's SQLiteSession with automatic summarization
- **functions.py**: Synchronous function implementations for file operations and document generation
- **tool_patch.py**: Monkey patches for adding configurable delays to mitigate race conditions in tool calls
- **logger.py**: Structured JSON logging for conversations and errors with rotating file handlers
- **utils.py**: Token management utilities including exact counting, optimization, and rate limiting
- **constants.py**: Centralized configuration including tool delays, token limits, and system instructions

### Electron Frontend (`electron/`)

- **main.js**: Main process handling window creation and IPC communication
- **preload.js**: Secure bridge between main and renderer processes
- **renderer.js**: UI interaction logic and Python process management
- **logger.js**: Frontend logging utilities

## Function Calling

The application supports both native functions and MCP server tools:

### Native Functions (Synchronous)
- **list_directory**: Directory listing with metadata (size, modified time, file count)
- **read_file**: File reading with automatic format conversion via markitdown (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON, images)
- **generate_document**: Template-based document generation with placeholder replacement
- **text_edit**: Find and replace exact text in documents (or delete by setting replace_with='')
- **regex_edit**: Pattern-based editing using regular expressions
- **insert_text**: Add new content before or after existing text

### MCP Server Integration
- **Sequential Thinking**: Advanced multi-step reasoning with revision capabilities and hypothesis testing
- Extensible to add more MCP servers (filesystem, GitHub, databases, etc.)

### Features
- Automatic tool orchestration by Agent/Runner framework
- Exact token counting using tiktoken for all content
- Content optimization to reduce token usage (removes redundant whitespace, headers)
- Race condition mitigation with configurable delays (0.2s default)
- Tool call tracking and token accumulation in session

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
- **Smart Triggers**: Summarizes at 80% of model's token limit (configurable)
- **Model-Aware Limits**: GPT-5 (250k), GPT-4 (120k), GPT-3.5 (15k)
- **Context Preservation**: Keeps last 2 user messages unsummarized
- **Seamless Experience**: Transparent summarization without user interruption
- **Tool Token Tracking**: Accumulates tokens from tool calls separately
- **In-Memory Database**: Fast session storage during app lifetime

### Rate Limiting & Error Handling
The application includes robust error handling:
- Automatic rate limit detection with user-friendly messages
- Graceful handling of RS_ and FC_ streaming errors
- Race condition mitigation for MCP/tool calls (configurable 0.2s delays)
- Connection error recovery with auto-restart
- Process health monitoring every 30 seconds
- Centralized configuration in `constants.py`

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
