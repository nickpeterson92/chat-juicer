# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chat Juicer is an Azure OpenAI chat application using the **Responses API** (not Chat Completions API). This is a critical architectural distinction that affects all interactions with the AI service.

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
3. All function calls are logged via decorators to the structured logger and included in `logs/conversations.jsonl`

## Essential Commands

### Setup
```bash
cd src/
cp .env.example .env
# Edit .env with Azure OpenAI credentials
pip install -r requirements.txt
```

### Running the Application
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
- Deployment must support Responses API (currently "gpt-5-mini")

### Dependencies
Core requirement: `openai-agents>=0.1.0` - provides the `agents` module imported in main.py with:
- `set_default_openai_client()`
- `set_default_openai_api()`  
- `set_tracing_disabled()`

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
1. Add function definition to `tools` array
2. Implement function with decorators: `@log_function_call()` and optionally `@log_timing()`
3. Add function execution in tool call handler
4. Logging is automatic via decorators - no manual logging needed

### Modifying Conversation Flow
Always maintain the `previous_response_id` chain - breaking this loses conversation context.

## Project Constraints

- No test framework configured
- No linting/formatting tools
- Manual validation only
- Single-file architecture (all in `src/main.py`)