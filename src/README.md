# Chat Juicer Backend

Backend entry lives in `main.py` and follows an orchestrator pattern: `main.py` only wires bootstrap → runtime → cleanup while business logic resides in the module directories below. All backend code is async, type-annotated, AppState-driven, and uses the shared JSON logger (no prints).

## Layout
- `app/` – lifecycle shell: bootstrap, runtime loop, and `AppState` (SSOT passed everywhere).
- `core/` – business logic: agent/runner config, dual-layer history, session manager/commands, prompts, settings.
- `models/` – Pydantic schemas for API/IPCs/SDK/events/sessions; single source for validation + serialization.
- `tools/` – function-calling tool surface and registry; session-aware file/document/text utilities.
- `integrations/` – external/MCP glue: registries, server wiring, event handlers, SDK token tracking.
- `utils/` – shared helpers: logging, IPC, token LRU, file/document helpers, validation.

## Runtime flow (high level)
1) Bootstrap: build `AppState`, load settings, assemble agent + MCP servers, open sessions.
2) Runtime: handle IPC events, stream agent responses, coordinate tool calls, persist dual-layer history.
3) Cleanup: close sessions/handles, flush logs, release integrations.

## Conventions
- No module globals; always pass `AppState`.
- Async/await everywhere; handle I/O with awaits and boundary try/except + structured logging.
- Keep orchestration in `main.py`/`app/`; keep logic in `core/`/`tools/`/`integrations/`.

## Extending
Add features by placing orchestration hooks in `app/` and business logic in `core/` or `tools/`, using `models/` for validation. Each module directory includes its own README for deeper guidance.
