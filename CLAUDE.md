# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chat Juicer is an Electron + Python desktop application that provides a chat interface for Azure OpenAI using the **Responses API** (stateful, not Chat Completions API). The application includes sophisticated document generation capabilities for technical documentation automation.

## Current Architecture

```
chat-juicer/
├── electron/          # Electron main process and utilities
│   ├── main.js       # Electron main process, IPC handlers
│   ├── preload.js    # Preload script for secure IPC
│   ├── renderer.js   # Renderer process script
│   └── logger.js     # Electron-side structured logging
├── ui/               # Frontend assets
│   └── index.html    # Main chat UI
├── src/              # Python backend (modularized)
│   ├── main.py       # Main chat loop, streaming handler
│   ├── azure_client.py  # Azure OpenAI setup and configuration
│   ├── functions.py  # Document generation and file tools
│   ├── logger.py     # Python logging framework (JSON format)
│   ├── utils.py      # Token management and rate limiting utilities
│   ├── constants.py  # Centralized configuration constants
│   ├── requirements.txt  # Python dependencies
│   └── .env.example  # Environment variable template
├── sources/          # Source documents for processing
│   ├── *.md         # Markdown source documents
│   ├── *.csv        # CSV data files
│   └── (various)    # API specs, transcripts, requirements
├── generated/        # Generated documentation output
├── templates/        # Document templates with {{placeholders}}
├── logs/             # Log files (gitignored)
│   ├── conversations.jsonl  # Structured conversation logs
│   └── errors.jsonl  # Error logs
└── docs/             # Documentation
```

## Key Architectural Concepts

### Responses API vs Chat Completions API
The codebase uses Azure OpenAI's **Responses API** which differs fundamentally from the Chat Completions API:

- **Responses API (this project)**: Stateful, maintains server-side conversation context via `previous_response_id`
- **Chat Completions API (NOT used)**: Stateless, requires sending full message history with each request

When modifying conversation flow, always:
1. Preserve the `previous_response_id` chain for conversation continuity
2. Only send the current user input, not full history
3. Use `store: true` to enable response retrieval
4. Breaking the ID chain loses conversation context

### Function Calling Architecture
The application now includes sophisticated document processing functions:

#### Available Functions
1. **list_directory**: List directory contents with metadata
2. **read_file**: Read files with automatic format conversion (PDF, Word, Excel, HTML, CSV, JSON)
3. **load_template**: Load documentation templates
4. **generate_document**: Generate docs from templates with placeholder replacement
5. **write_document**: Write documents with backup options

Function calls follow this pattern:
1. User message triggers function detection
2. Execute functions from FUNCTION_REGISTRY
3. Build context with results using `previous_response_id`
4. All function calls are logged to `logs/conversations.jsonl`

### Document Generation System
The application can process source documents and generate technical documentation:
- Read multiple source formats using markitdown
- Load templates with {{placeholders}}
- Generate professional documentation
- Exact token counting with tiktoken
- Content optimization for large documents

## Essential Commands

### Setup
```bash
# Install Node dependencies
npm install

# Install Python dependencies
cd src/
pip install -r requirements.txt

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

# Manual testing - no automated test suite
python src/main.py
```

## Critical Implementation Details

### Environment Requirements
Required:
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Format `https://resource.openai.azure.com/`

Optional:
- `AZURE_OPENAI_DEPLOYMENT`: Defaults to "gpt-5-mini"
- `AZURE_OPENAI_API_VERSION`: Defaults to "2024-10-01-preview"
- `DEBUG`: Enable debug logging

**Note**: Deployment must support Responses API

### Dependencies

#### Python Dependencies (src/requirements.txt)
- `openai>=1.0.0` - Azure OpenAI client library
- `openai-agents>=0.1.0` - Provides agents module for Responses API:
  - `set_default_openai_client()`
  - `set_default_openai_api()`
  - `set_tracing_disabled()`
- `markitdown>=0.1.0` - Document conversion to markdown (PDF, Word, Excel, HTML)
- `tiktoken>=0.5.0` - Exact token counting for content optimization
- `python-json-logger>=2.0.0` - Structured JSON logging
- `python-dotenv>=1.0.0` - Environment variable management

#### Node Dependencies
- `electron` - Desktop application framework (devDependency)
- Node.js 16+ and npm required

### Streaming Response Handling
The code processes multiple event types in order:
1. `response.created` - Capture response ID
2. `response.output_text.delta` - Stream text output
3. `response.output_item.done` - Handle function calls
4. `response.done` - Complete response

### State Management
- Track `previous_response_id` throughout conversation
- Update after each response completion
- Pass to subsequent requests for continuity
- Never send full conversation history

### Token Management
- Use `utils.estimate_tokens()` for quick estimates
- Use `utils.count_tokens_exact()` for precise counts using tiktoken
- Use `utils.optimize_content()` to reduce tokens in large documents
- Automatic optimization for documents >1000 tokens

### Rate Limiting
- Automatic retry with exponential backoff
- Configuration in `constants.py`:
  - MAX_RETRIES: 5
  - BASE_DELAY: 1 second
  - MAX_DELAY: 10 seconds
- Handled by `utils.handle_rate_limit()`

## Common Development Tasks

### Adding New Functions
1. Define function in `TOOLS` array in `src/functions.py`
2. Implement the function returning JSON string
3. Register in `FUNCTION_REGISTRY` dict
4. Function automatically available to AI

Example:
```python
# In TOOLS array
{
    "type": "function",
    "name": "my_function",
    "description": "What it does",
    "parameters": {...}
}

# Implementation
def my_function(param1: str) -> str:
    result = do_something(param1)
    return json.dumps(result)

# Register
FUNCTION_REGISTRY = {
    "my_function": my_function,
    # ... other functions
}
```

### Modifying Conversation Flow
Always maintain the `previous_response_id` chain - breaking this loses conversation context.

### Working with Documents
1. Place source documents in `sources/`
2. Create templates in `templates/` with {{placeholders}}
3. Use functions to generate documentation
4. Output saved to `generated/`

## Project Constraints

- No test framework configured
- No linting/formatting tools  
- Manual validation only
- Modular architecture with separation of concerns

## Important Implementation Notes

### Testing Approach
Since there's no formal test suite:
- Manual testing is critical
- Test all function calls after changes
- Verify streaming output works correctly
- Check error handling and rate limiting
- Ensure conversation continuity is maintained

### Code Quality
Without linting tools, maintain consistency:
- Python: Follow PEP 8 conventions
- JavaScript: Use consistent indentation (2 spaces)
- Add comments for complex logic
- Keep functions focused and small
- Use descriptive variable names

### Performance Considerations
- Token optimization is automatic for large documents
- Streaming ensures real-time responsiveness
- Rate limiting prevents API throttling
- Separate processes (Electron + Python) for stability

## Summary

Chat Juicer combines real-time AI chat with sophisticated document generation capabilities. The architecture leverages Azure OpenAI's Responses API for efficient stateful conversations while providing powerful document processing tools through a clean Electron interface.

Key strengths:
- Stateful conversation management
- Universal document format support
- Token-aware processing
- Professional documentation generation
- Robust error handling and logging

When working on this codebase, prioritize maintaining the `previous_response_id` chain, preserving the modular architecture, and ensuring all changes are manually tested thoroughly.