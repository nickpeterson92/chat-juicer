# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chat Juicer is an Electron + Python desktop application that provides a chat interface for Azure OpenAI using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**. The application features advanced reasoning capabilities through Sequential Thinking and sophisticated document generation.

## Current Architecture (Agent/Runner Pattern)

```
chat-juicer/
├── electron/          # Electron main process and utilities
│   ├── main.js       # Electron main process, IPC handlers, health monitoring
│   ├── preload.js    # Preload script for secure IPC with logging API
│   ├── renderer.js   # Renderer process script with structured logging (no console.*)
│   └── logger.js     # Electron-side structured logging with levels
├── ui/               # Frontend assets
│   └── index.html    # Main chat UI with markdown rendering
├── src/              # Python backend (Agent/Runner pattern)
│   ├── main.py       # Agent/Runner implementation with MCP support
│   ├── session.py    # TokenAwareSQLiteSession with auto-summarization
│   ├── functions.py  # Document generation and file tools (synchronous)
│   ├── tool_patch.py # Tool call delay patches for race condition mitigation
│   ├── logger.py     # Python logging framework (JSON format, token metadata, rotating files)
│   ├── utils.py      # Token management and content optimization utilities
│   ├── constants.py  # Centralized configuration constants
│   ├── sdk_token_tracker.py # SDK-level automatic token tracking for all tool calls
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

## Key Architectural Concepts

### Agent/Runner Pattern with MCP
The application uses OpenAI's Agent/Runner pattern which provides:

- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Sequential Thinking**: Advanced reasoning capabilities for complex problem-solving
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Hybrid Async Architecture**: Async/await for Agent/Runner and MCP servers, synchronous for functions
- **Streaming Events**: Structured event handling for real-time responses
- **Token-Aware Sessions**: SQLite-based session management with automatic summarization

### MCP Server Integration
The application integrates the Sequential Thinking MCP server:
- Breaks down complex problems into manageable steps
- Provides structured reasoning with revision capabilities
- Enables branching and hypothesis testing
- Maintains context across multiple reasoning steps

### Agent Configuration
```python
agent = Agent(
    name="Chat Juicer",
    model=deployment,
    instructions=SYSTEM_INSTRUCTIONS,
    tools=TOOLS,
    mcp_servers=[seq_thinking_server]
)
```

### Function Architecture
Available functions (all synchronous):
1. **list_directory**: List directory contents with metadata (size, modified time, file count)
2. **read_file**: Read files with automatic format conversion via markitdown
3. **generate_document**: Generate docs from templates with placeholder replacement
4. **text_edit**: Find and replace exact text in documents
5. **regex_edit**: Pattern-based editing using regular expressions
6. **insert_text**: Add new content before or after existing text

### Document Generation System
- Process multiple source formats using markitdown (PDF, Word, Excel, HTML, CSV, JSON, images)
- Template-first workflow with placeholder replacement
- Sequential Thinking for complex document structuring
- Token-aware content optimization (removes redundant whitespace, headers)
- Professional documentation generation with Mermaid diagram support

## Essential Commands

### Setup
```bash
# Install Node dependencies
npm install

# Install Python dependencies
cd src/
pip install -r requirements.txt

# Install MCP server globally
npm install -g @modelcontextprotocol/server-sequential-thinking

# Configure environment
cp .env.example .env
# Edit .env with Azure OpenAI credentials
```

### Running the Application

#### Electron App (Primary)
```bash
npm start
# Or for development mode with DevTools:
npm run dev
```

#### Python Backend Only (Testing)
```bash
python src/main.py
```

### Validation
```bash
# Syntax check
python -m py_compile src/main.py

# Check all Python files
python -m compileall src/
```

## Critical Implementation Details

### Environment Requirements
Required:
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Format `https://resource.openai.azure.com/`
- `AZURE_OPENAI_DEPLOYMENT`: Model deployment name (e.g., "gpt-5-mini")

### Dependencies

#### Python Dependencies (src/requirements.txt)
- `openai>=1.0.0` - Azure OpenAI client library (AsyncOpenAI)
- `openai-agents>=0.2.0` - Agent/Runner framework with MCP support and SQLiteSession
- `markitdown>=0.1.0` - Document conversion to markdown (install with [all] for full format support)
- `tiktoken>=0.5.0` - Exact token counting for all models
- `python-json-logger>=2.0.0` - Structured JSON logging with rotating file handlers
- `python-dotenv>=1.0.0` - Environment variable management
- `httpx>=0.25.0` - Modern HTTP client (dependency of openai)

#### Node Dependencies
- `electron` - Desktop application framework
- `@modelcontextprotocol/server-sequential-thinking` - MCP server for reasoning

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
- Session tracks tokens and triggers summarization at 20% of model limit (54,400 tokens for GPT-5)
- Model-aware token limits: GPT-5 (272k), GPT-4o (128k), GPT-3.5-turbo (15.3k)
- In-memory SQLite database for fast session storage during app lifetime
- Accumulated tool tokens tracked separately from conversation tokens
- SDK-level automatic token tracking for all tool calls (native, MCP, future agents)
- Minimal client state - session handles all conversation management

## Common Development Tasks

### Adding New Functions
1. Define function in `TOOLS` array in `src/functions.py`
2. Implement the function returning JSON string
3. Register in `FUNCTION_REGISTRY` dict
4. Function automatically available to Agent (including MCP tools)

### Adding New MCP Servers
```python
# In setup_mcp_servers() function
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
The Sequential Thinking server is configured in `setup_mcp_servers()` and can be extended with additional MCP servers for:
- File system operations
- GitHub integration
- Database access
- Custom reasoning patterns

## Project Constraints

- No formal test framework configured
- Manual validation required
- Agent/Runner pattern with async for MCP and streaming
- MCP servers run as subprocesses via npx
- Functions remain synchronous (not async)
- Tool call delays configured at 0.2s to prevent race conditions (currently disabled with client-side sessions)

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
- Async/await throughout for better concurrency
- MCP servers add minimal overhead
- Streaming maintains real-time responsiveness
- Automatic rate limiting still applies

### Migration from Responses API
The project has been fully migrated from the Responses API to Agent/Runner pattern:
- No more manual response_id tracking
- Automatic function orchestration
- Native MCP server support
- Cleaner, more maintainable code
- ~50% reduction in boilerplate

## Summary

Chat Juicer now leverages the modern Agent/Runner pattern with native MCP server integration, providing:

Key strengths:
- **Sequential Thinking**: Advanced reasoning capabilities
- **Native MCP Support**: Direct integration without bridge functions
- **Modern Architecture**: Async/await for streaming and MCP with structured events
- **Cleaner Code**: Significant reduction in boilerplate
- **Future-Proof**: Aligned with OpenAI's strategic direction

The application combines real-time AI chat with sophisticated reasoning and document generation capabilities through a clean Electron interface with native MCP server support.
