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

An Electron + Python desktop application for Azure OpenAI chat interactions using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**, providing advanced reasoning capabilities through Sequential Thinking and sophisticated document generation.

## Features

- 🖥️ **Desktop Application**: Native Electron app with modern UI
- 🤖 **Agent/Runner Pattern**: Modern OpenAI architecture with automatic orchestration
- 🧠 **Sequential Thinking**: MCP server for advanced multi-step reasoning
- 🔄 **Streaming Responses**: Real-time AI response streaming with structured events
- 🛠️ **Function Calling**: Native and MCP tool integration with automatic execution
- 📝 **Conversation Logging**: Structured JSON logging for all interactions
- 🔐 **Azure OpenAI Integration**: Secure connection to Azure OpenAI services
- 📊 **Token Counting**: Exact token counting with tiktoken and content optimization
- ⚡ **Async Architecture**: Full async/await support for better performance
- 📄 **Document Generation**: Template-based document creation with multi-format support

## Architecture

Chat Juicer uses OpenAI's **Agent/Runner pattern** which provides:
- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Sequential Thinking**: Advanced reasoning capabilities for complex problem-solving
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Async/Await Architecture**: Modern async patterns throughout the application
- **Streaming Events**: Structured event handling for real-time responses
- **Stateless Design**: Conversation state managed server-side (only tracks current response_id)

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
│   ├── functions.py  # Document generation and file tools
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
- **functions.py**: Function implementations for file operations and document generation
- **tool_patch.py**: Monkey patches for adding delays to mitigate race conditions in tool calls
- **logger.py**: Structured JSON logging for conversations and errors
- **utils.py**: Token management utilities including exact counting, optimization, and rate limiting
- **constants.py**: Centralized configuration including tool delays, file sizes, and other constants

### Electron Frontend (`electron/`)

- **main.js**: Main process handling window creation and IPC communication
- **preload.js**: Secure bridge between main and renderer processes
- **renderer.js**: UI interaction logic and Python process management
- **logger.js**: Frontend logging utilities

## Function Calling

The application supports both native functions and MCP server tools:

### Native Functions
- **list_directory**: Directory listing with metadata
- **read_file**: File reading with automatic format conversion (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON)
- **generate_document**: Document generation from templates

### MCP Server Integration
- **Sequential Thinking**: Advanced multi-step reasoning and problem decomposition
- Extensible to add more MCP servers (filesystem, GitHub, databases, etc.)

### Features
- Automatic tool orchestration by Agent/Runner framework
- Exact token counting using tiktoken
- Content optimization to reduce token usage
- Race condition mitigation with configurable delays

Add new functions by:
1. Defining the function in `src/functions.py`
2. Adding it to the `TOOLS` array
3. Registering in `FUNCTION_REGISTRY`
4. Function automatically available to Agent (including MCP tools)

## Logging

Structured logs are automatically generated in `logs/`:
- **conversations.jsonl**: Complete conversation history with metadata
- **errors.jsonl**: Error tracking and debugging information

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

### Rate Limiting & Error Handling
The application includes robust error handling:
- Automatic rate limit handling with exponential backoff
- Up to 5 retry attempts with configurable delays
- Real-time UI notifications for rate limits
- Race condition mitigation for MCP/tool calls (configurable delays)
- Graceful handling of RS_ and FC_ streaming errors
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
- `openai-agents>=0.1.0`: Agent/Runner framework with MCP support
- `openai>=1.0.0`: Azure OpenAI client library
- `python-dotenv>=1.0.0`: Environment variable management (.env file loading)
- `markitdown[all]>=0.1.0`: Document conversion to markdown (PDF, Word, Excel, HTML, etc.)
- `tiktoken>=0.5.0`: OpenAI's official token counting library for exact token counts
- `httpx>=0.25.0`: Modern HTTP client for handling network errors and retries
- `python-json-logger>=2.0.0`: Structured JSON logging (required)
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
