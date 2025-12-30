# Integrations Module (MCP/External Glue)

Purpose: manage external integrations (especially MCP servers) and related event handling/token tracking used by the agent runtime.

## Files

- `mcp_registry.py` - Registry of available MCP servers and their capabilities.
- `mcp_servers.py` - Server definitions and startup helpers.
- `mcp_manager.py` - Singleton manager for MCP clients (WebSocket multiplexing handles concurrency).
- `sdk_token_tracker.py` - Track SDK token usage across tool calls.
- `event_handlers/` - Modular event handler registry for streaming events:
  - `registry.py` - Handler registration and lookup.
  - `base.py` - Base types and utilities.
  - `agent_events.py` - Agent lifecycle events.
  - `run_item_events.py` - Tool/message item events.
  - `raw_events.py` - Raw response events.

## Patterns

- Keep integration setup here; `api/main.py` lifespan initializes manager and passes to services.
- MCP clients use WebSocket multiplexing - single connection per server type handles concurrent requests.
- Maintain clear separation between registration (registry) and runtime control (manager/handlers).
- Use structured logging with context; handle failures with explicit exceptions.

## Extending

- To add an MCP server: define it in `mcp_servers.py`, register in `mcp_registry.py`, manager will auto-connect.
- For new event types: add handler in `event_handlers/`, register in `event_handlers/registry.py`.
- For new external hooks, add small composable helpers and surface through registry functions.
