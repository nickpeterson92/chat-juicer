# Integrations Module (MCP/External Glue)

Purpose: manage external integrations (especially MCP servers) and related event handling/token tracking used by the agent and runtime.

## Files
- `mcp_registry.py` – registry of MCP servers and capabilities.
- `mcp_servers.py` – server definitions and startup helpers.
- `event_handlers.py` – integration event wiring.
- `sdk_token_tracker.py` – track SDK token usage and limits.

## Patterns
- Keep integration setup here; orchestrator (`app/`) only calls into these helpers.
- Maintain clear separation between registration (registry) and runtime control (servers/handlers).
- Use structured logging with context; handle failures with explicit exceptions.

## Extending
- To add an MCP server: define it in `mcp_servers.py`, register in `mcp_registry.py`, and ensure bootstrap/runtime pass it to the agent.
- For new external hooks, add small, composable helpers and surface them through registry functions rather than direct imports.
