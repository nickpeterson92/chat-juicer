# CLAUDE.md

**Dual-platform app**: Electron desktop + browser web app (Cloudflare Pages), both sharing a FastAPI backend. Azure OpenAI chat with Agent/Runner pattern and MCP server support.

## Task Tracking

Use `bd` for task tracking.

## Commands

```bash
make run              # Production
make dev              # Dev mode with DevTools
make test             # All tests
make quality          # Lint + format + typecheck
```

## Database

```bash
PGPASSWORD=localdev psql -h localhost -p 5433 -U chatjuicer -d chatjuicer
```

Tables: `users`, `sessions`, `messages`, `llm_context`, `files`

## Environment

Required: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `DATABASE_URL`

Optional: `REASONING_EFFORT` (none/low/medium/high), `TAVILY_API_KEY`

## Code Style

- **Logging**: Only actionable info (errors, warnings, state changes). No progress logs, no emojis. Format: `[ModuleName] Description`
- **Architecture**: Three-tier (Renderer → Main Process → FastAPI). AppState is single source of truth in frontend.
- **Backend**: FastAPI with dependency injection, async throughout, Pydantic models

## Key Entry Points

- Frontend: `src/frontend/main.js` (Electron), `src/frontend/renderer/bootstrap.js` (UI)
- Backend: `src/backend/api/main.py` (FastAPI), `src/backend/core/agent.py` (Agent/Runner)
- Chat: `src/backend/api/routes/chat.py` (WebSocket), `src/backend/api/services/chat_service.py`

## Skills (load on demand)

- `/architecture` - Full project structure and diagrams
- `/websocket-protocol` - WebSocket message formats
- `/adding-features` - How to add endpoints, tools, MCP servers
