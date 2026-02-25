---
name: adding-features
description: How to add new API endpoints, function tools, and MCP servers
---

# Adding Features

## Adding New API Endpoints

1. Create route in `src/backend/api/routes/v1/`
2. Add service logic in `src/backend/api/services/`
3. Register route in `src/backend/api/main.py`

Example route:
```python
# src/backend/api/routes/v1/example.py
from fastapi import APIRouter, Depends
from src.backend.api.dependencies import get_example_service

router = APIRouter(prefix="/example", tags=["example"])

@router.get("/{id}")
async def get_example(id: str, service = Depends(get_example_service)):
    return await service.get(id)
```

Register in main.py:
```python
from src.backend.api.routes.v1 import example
app.include_router(example.router, prefix="/api/v1")
```

## Adding New Function Tools

1. Implement in `src/backend/tools/*.py`
2. Register in `src/backend/tools/registry.py`
3. Add session-aware wrapper if needed in `src/backend/tools/wrappers.py`

Example tool:
```python
# src/backend/tools/my_tool.py
async def my_tool(param: str) -> str:
    """Tool description for the LLM."""
    return f"Result: {param}"
```

Register:
```python
# src/backend/tools/registry.py
from src.backend.tools.my_tool import my_tool
TOOLS = [..., my_tool]
```

## Adding New MCP Servers

In `src/backend/integrations/mcp_servers.py`:
```python
from agents.mcp import MCPServerStdio

new_server = MCPServerStdio(
    params={
        "command": "npx",
        "args": ["-y", "@mcp/server-name"]
    }
)
```

Add to the MCP pool in `src/backend/integrations/mcp_pool.py`.

## Key Dependencies

Python (requirements.txt):
- `fastapi` - Web framework
- `asyncpg` - Async PostgreSQL
- `uvicorn` - ASGI server
- `openai>=1.0.0` - Azure OpenAI client
- `openai-agents>=0.3.3` - Agent/Runner framework
- `pydantic>=2.5.0` - Data validation

Node (package.json):
- `electron` - Desktop framework
- `marked` - Markdown parser
- `highlight.js` - Syntax highlighting
- `katex` - Math rendering
- `mermaid` - Diagrams
