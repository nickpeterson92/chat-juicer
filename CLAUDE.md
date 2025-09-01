# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chat Juicer is an Electron + Python application for Azure OpenAI chat using the **Responses API** (not Chat Completions API). This is a critical architectural distinction that affects all interactions with the AI service.

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

### Function Calling Architecture
Function calls follow this specific pattern:
1. Build temporary context: user message → function call → function output  
2. Maintain conversation state using `previous_response_id` after function execution
3. All function calls are logged to the structured logger and included in `logs/conversations.jsonl`

## Essential Commands

### Setup
```bash
cd src/
cp .env.example .env
# Edit .env with Azure OpenAI credentials
pip install -r requirements.txt
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

### Validation (No formal test suite exists)
```bash
# Syntax check
python -m py_compile src/main.py

# Manual testing only - no automated tests
python src/main.py
# Test: basic chat, function calls, quit commands
```

## Critical Implementation Details

### Environment Requirements
- `AZURE_OPENAI_API_KEY`: Required
- `AZURE_OPENAI_ENDPOINT`: Required (format: `https://resource.openai.azure.com/`)
- `AZURE_OPENAI_DEPLOYMENT`: Optional, defaults to "gpt-5-mini"
- Deployment must support Responses API

### Dependencies

#### Python Dependencies
- `openai-agents>=0.1.0` - provides the `agents` module with:
  - `set_default_openai_client()`
  - `set_default_openai_api()`  
  - `set_tracing_disabled()`
- `python-json-logger>=2.0.0` - JSON formatted logging
- `python-dotenv` - Environment variable management
- `openai` - Azure OpenAI client

#### Node Dependencies
- `electron` - Desktop application framework

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

## Common Development Tasks

### Adding New Functions
1. Add function definition to `TOOLS` array in `src/functions.py`
2. Implement the function in `src/functions.py`
3. Register function in `FUNCTION_REGISTRY` dict in `src/functions.py`
4. Function calls are automatically logged via the main loop

### Modifying Conversation Flow
Always maintain the `previous_response_id` chain - breaking this loses conversation context.

## Project Constraints

- No test framework configured
- No linting/formatting tools
- Manual validation only
- Modular architecture with separation of concerns