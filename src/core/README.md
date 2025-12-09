# Core Module (Business Logic)

Purpose: houses agent/session logic, history persistence, prompts, and settings—everything the orchestrator calls but does not implement itself.

## Key files
- `agent.py` – Agent/Runner construction with MCP servers + model settings.
- `session.py` – `TokenAwareSQLiteSession` (Layer 1 context store with auto-summarization).
- `full_history.py` – `FullHistoryStore` (Layer 2 full UI history).
- `session_manager.py` – multi-session lifecycle, handle cleanup, session switching.
- `session_commands.py` – IPC command handlers (create/load/delete/etc.).
- `session_builder.py` – helpers to assemble session state.
- `prompts.py` – system instructions and prompt templates.
- `constants.py` – Pydantic settings/feature flags.

## Patterns
- Dual-layer history: always write Layer 1 and Layer 2 together unless explicitly repopulating.
- Agent/Runner: configure tools + MCP servers here; runtime only invokes.
- Explicit state: functions receive `AppState`; no module-level state.
- Async everywhere: DB/file/network ops are awaited with error-boundary logging.

## Extending
- New session command: add handler in `session_commands.py`, register routing in runtime, keep state mutations centralized.
- New history behavior: extend `session.py`/`full_history.py` with tests covering summarization + metadata.
- New prompt/settings: adjust `prompts.py` or `constants.py`; ensure defaults flow through bootstrap.
