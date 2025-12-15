# Core Module

Core business logic for agent configuration, prompts, and application constants.

## Key Files

- `agent.py` – Agent/Runner construction with MCP servers + model settings.
- `prompts.py` – System instructions and prompt templates.
- `constants.py` – Pydantic settings, feature flags, and configuration constants.

## Related Modules

Session and history management have moved to `api/services/`:

- `api/services/token_aware_session.py` – `PostgresTokenAwareSession` (Layer 1: LLM context with auto-summarization)
- `api/services/postgres_session.py` – Low-level PostgreSQL session storage
- `api/services/session_service.py` – Session lifecycle management (create/load/delete)
- `api/services/chat_service.py` – Chat orchestration with Agent/Runner streaming

## Patterns

- **Dual-layer history**: Layer 1 (LLM context, token-managed) + Layer 2 (UI history, complete)
- **Agent/Runner**: Configure tools + MCP servers here; runtime invokes via `api/services/chat_service.py`
- **Async everywhere**: DB/file/network ops are awaited with error-boundary logging

## Extending

- **New prompt/settings**: Adjust `prompts.py` or `constants.py`; ensure defaults flow through bootstrap
- **New agent tools**: Register in `tools/registry.py`, wrap with session context in `tools/wrappers.py`
