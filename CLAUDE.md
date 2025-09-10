# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chat Juicer is an Electron + Python desktop application that provides a chat interface for Azure OpenAI using the **Agent/Runner pattern** with native **MCP (Model Context Protocol) server support**. The application features advanced reasoning capabilities through Sequential Thinking and sophisticated document generation.

## Current Architecture (Agent/Runner Pattern)

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
│   ├── functions.py  # Document generation and file tools (synchronous)
│   ├── tool_patch.py # Tool call delay patches for race condition mitigation
│   ├── logger.py     # Python logging framework (JSON format)
│   ├── utils.py      # Token management and rate limiting utilities
│   ├── constants.py  # Centralized configuration constants
│   └── requirements.txt  # Python dependencies
├── sources/          # Source documents for processing
├── generated/        # Generated documentation output
├── templates/        # Document templates with {{placeholders}}
├── logs/             # Log files (gitignored)
└── docs/             # Documentation
    └── agent-runner-migration-analysis.md  # Migration documentation
```

## Key Architectural Concepts

### Agent/Runner Pattern with MCP
The application now uses OpenAI's Agent/Runner pattern which provides:

- **Native MCP Server Integration**: Direct support for Model Context Protocol servers
- **Sequential Thinking**: Advanced reasoning capabilities for complex problem-solving
- **Automatic Tool Orchestration**: Framework handles function calling automatically
- **Async/Await Architecture**: Modern async patterns for Agent/Runner and MCP servers
- **Streaming Events**: Structured event handling for real-time responses

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
Available functions remain the same:
1. **list_directory**: List directory contents with metadata
2. **read_file**: Read files with automatic format conversion
3. **generate_document**: Generate docs from templates

### Document Generation System
- Process multiple source formats using markitdown
- Sequential Thinking for complex document structuring
- Token-aware content optimization
- Professional documentation generation

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
- `openai-agents>=0.2.0` - Agent/Runner framework with MCP support
- `markitdown>=0.1.0` - Document conversion to markdown
- `tiktoken>=0.5.0` - Exact token counting
- `python-json-logger>=2.0.0` - Structured JSON logging
- `python-dotenv>=1.0.0` - Environment variable management

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
- Conversation history maintained in messages array
- Agent handles context automatically
- No manual response_id tracking needed

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
- MCP servers run as subprocesses

## Important Implementation Notes

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
