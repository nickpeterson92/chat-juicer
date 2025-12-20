# Chat Juicer Backend

FastAPI backend with PostgreSQL persistence, Agent/Runner pattern, and MCP server support. Entry point is `api/main.py` which configures routes, middleware, and lifespan management.

## Layout

- `api/` - FastAPI application: routes, services, middleware, WebSocket management, dependency injection.
- `core/` - Business logic: agent/runner config, prompts, settings/constants.
- `models/` - Pydantic schemas for API/IPC/SDK/events/sessions; single source for validation + serialization.
- `tools/` - Function-calling tool surface and registry; session-aware file/document/text utilities.
- `integrations/` - External/MCP glue: registries, server pool, event handlers, SDK token tracking.
- `utils/` - Shared helpers: logging, token LRU, file/document helpers, client factories, validation.

## Runtime Flow

1. **Startup (lifespan)**: Initialize PostgreSQL pool, MCP server pool, OpenAI client, WebSocket manager.
2. **Request handling**: FastAPI routes + WebSocket endpoints; dependency injection provides services.
3. **Chat streaming**: `ChatService` orchestrates Agent/Runner with MCP servers, streams via WebSocket.
4. **Shutdown**: Close pools, cleanup MCP servers, flush logs.

## Key Patterns

- **Dependency Injection**: Services injected via FastAPI's `Depends()` - no global state.
- **Async everywhere**: All I/O uses async/await with structured error handling.
- **Dual-layer history**: Layer 1 (LLM context, token-managed) + Layer 2 (UI history, complete).
- **MCP Server Pool**: Pre-spawned servers for concurrent request handling.

## Extending

Add features by:
- Routes in `api/routes/`, services in `api/services/`
- Business logic in `core/` or `tools/`
- Schemas in `models/` for validation
- Each module directory includes its own README for deeper guidance.
