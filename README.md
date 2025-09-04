# Chat Juicer

An Electron + Python application for Azure OpenAI chat interactions using the Responses API, providing a desktop interface for AI conversations with integrated function calling capabilities.

## Features

- 🖥️ **Desktop Application**: Native Electron app with modern UI
- 🔄 **Streaming Responses**: Real-time AI response streaming
- 🛠️ **Function Calling**: Integrated tool and function execution
- 📝 **Conversation Logging**: Structured JSON logging for all interactions
- 🔐 **Azure OpenAI Integration**: Secure connection to Azure OpenAI services
- 📊 **Token Counting**: Exact token counting with tiktoken and content optimization

## Architecture

Chat Juicer uses Azure OpenAI's **Responses API** (not Chat Completions API) which provides:
- Stateful conversation management via `previous_response_id`
- Server-side context retention
- Efficient token usage without resending full history

## Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- Azure OpenAI resource with deployment supporting Responses API
- Azure OpenAI API credentials

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
   ```

4. **Configure environment variables**
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
│   ├── main.js       # Electron main process
│   ├── preload.js    # Preload script for IPC
│   ├── renderer.js   # Renderer process script
│   └── logger.js     # Electron-side logging
├── ui/               # Frontend assets
│   └── index.html    # Main UI
├── src/              # Python backend
│   ├── main.py       # Main chat loop and streaming handler
│   ├── azure_client.py  # Azure OpenAI setup and configuration
│   ├── functions.py  # Function handlers and tool definitions
│   └── logger.py     # Python logging framework
├── logs/             # Log files (auto-generated)
│   ├── conversations.jsonl  # Structured conversation logs
│   └── errors.jsonl  # Error logs
└── docs/             # Documentation
```

## Key Components

### Python Backend (`src/`)

- **main.py**: Handles the chat loop, streaming responses, and function execution
- **azure_client.py**: Manages Azure OpenAI client initialization and configuration
- **functions.py**: Implements tool definitions and function handlers
- **logger.py**: Provides structured JSON logging for conversations and errors

### Electron Frontend (`electron/`)

- **main.js**: Main process handling window creation and IPC communication
- **preload.js**: Secure bridge between main and renderer processes
- **renderer.js**: UI interaction logic and Python process management
- **logger.js**: Frontend logging utilities

## Function Calling

The application supports function calling with:
- Directory listing and file system exploration
- File reading with automatic format conversion (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON)
- Document template loading and generation
- Exact token counting using tiktoken
- Content optimization to reduce token usage
- Extensible function registry for custom tools

Add new functions by:
1. Defining the function in `src/functions.py`
2. Adding it to the `TOOLS` array
3. Registering in `FUNCTION_REGISTRY`

## Logging

Structured logs are automatically generated in `logs/`:
- **conversations.jsonl**: Complete conversation history with metadata
- **errors.jsonl**: Error tracking and debugging information

## Development

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

## Configuration

### Environment Variables

- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key (required)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL (required)
- `AZURE_OPENAI_DEPLOYMENT`: Deployment name (optional, defaults to "gpt-5-mini")
- `AZURE_OPENAI_API_VERSION`: API version (optional, defaults to "2024-10-01-preview")

### Python Dependencies

Required dependencies (from `src/requirements.txt`):
- `openai-agents>=0.1.0`: Provides agents module for Responses API support
- `openai>=1.0.0`: Azure OpenAI client library
- `python-dotenv>=1.0.0`: Environment variable management (.env file loading)
- `markitdown>=0.1.0`: Document conversion to markdown (PDF, Word, Excel, HTML, etc.)
- `tiktoken>=0.5.0`: OpenAI's official token counting library for exact token counts
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