# App Module (Lifecycle Shell)

Purpose: orchestrate startup/runtime/cleanup while keeping business logic in `core/` and `tools/`. Holds the single source of truth `AppState` that is passed to every async function (no globals).

## Key files
- `state.py` – `AppState` dataclass with all runtime handles/config.
- `bootstrap.py` – builds `AppState`, loads settings, wires agent + sessions + MCP servers.
- `runtime.py` – main loop and IPC entrypoints; delegates to `core/` handlers.

## Flow
1) Bootstrap: construct state, hydrate sessions, prepare agent/tools/integrations.
2) Runtime: receive IPC events, route to `core.session_commands`/services, stream agent output.
3) Cleanup: close sessions/handles, flush logs, teardown integrations.

## Guidelines
- Keep files thin: orchestration only, no business rules.
- Pass `AppState` explicitly; avoid module globals.
- Use structured logger (no prints); wrap boundary I/O in try/except with context.
- When adding a lifecycle step, place sequencing here and keep logic in `core/`/`tools/`.
