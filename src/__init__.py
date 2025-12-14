"""
Chat Juicer - Production-grade AI chat with document generation
================================================================

FastAPI backend with Agent/Runner pattern and MCP server support for Azure OpenAI.

Key Features:
    - **FastAPI Backend**: WebSocket-based streaming with PostgreSQL persistence
    - **Agent/Runner Pattern**: Native OpenAI Agents SDK with automatic tool orchestration
    - **MCP Integration**: Sequential Thinking server for advanced reasoning
    - **Token-Aware Sessions**: Automatic conversation summarization at configurable thresholds
    - **Document Generation**: Multi-format conversion (PDF, Word, Excel, HTML, etc.)
    - **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
    - **Enterprise Logging**: Structured JSON logs with rotation and session correlation

Modules:
    api: FastAPI routes, services, middleware, and WebSocket handling
    core: Agent setup, system prompts, configuration constants
    tools: Document generation, file operations, text editing functions
    models: Pydantic models for API responses and type safety
    utils: Logging, token management, file utilities
    integrations: MCP servers, event handlers, SDK-level token tracking

Architecture:
    The application uses an Electron + FastAPI architecture. The FastAPI backend
    provides REST and WebSocket endpoints, with PostgreSQL for persistence.
    The Agent/Runner framework handles tool orchestration automatically,
    with MCP servers providing additional capabilities like Sequential Thinking.

See Also:
    - CLAUDE.md: Comprehensive project documentation and architecture details
    - docs/: Sphinx-generated API reference documentation
"""
