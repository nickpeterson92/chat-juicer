"""
Wishgate - Production-grade AI chat with document generation
================================================================

Agent/Runner pattern with MCP server support for Azure OpenAI.

Key Features:
    - **Agent/Runner Pattern**: Native OpenAI Agents SDK with automatic tool orchestration
    - **MCP Integration**: Sequential Thinking server for advanced reasoning
    - **Token-Aware Sessions**: Automatic conversation summarization at configurable thresholds
    - **Document Generation**: Multi-format conversion (PDF, Word, Excel, HTML, etc.)
    - **Type Safety**: Full mypy strict compliance with Pydantic runtime validation
    - **Enterprise Logging**: Structured JSON logs with rotation and session correlation

Modules:
    core: Agent setup, session management, system prompts, configuration
    tools: Document generation, file operations, text editing functions
    models: Pydantic models for API responses and type safety
    utils: Logging, token management, IPC communication, file utilities
    integrations: MCP servers, event handlers, SDK-level token tracking

Architecture:
    The application uses a hybrid Electron + Python architecture. The Python backend
    runs as a subprocess, communicating with the Electron frontend via stdin/stdout
    using JSON-delimited messages. The Agent/Runner framework handles tool orchestration
    automatically, with MCP servers providing additional capabilities like Sequential Thinking.

Example:
    Basic agent setup::

        from core.agent import create_agent
        from core.constants import get_settings
        from core.session import TokenAwareSQLiteSession
        from tools.registry import AGENT_TOOLS
        from integrations.mcp_servers import setup_mcp_servers

        # Initialize MCP servers
        mcp_servers = await setup_mcp_servers()

        # Create agent with tools and MCP servers
        settings = get_settings()
        agent = create_agent(
            deployment=settings.azure_openai_deployment,
            instructions=SYSTEM_INSTRUCTIONS,
            tools=AGENT_TOOLS,
            mcp_servers=mcp_servers
        )

        # Create token-aware session
        session = TokenAwareSQLiteSession(
            session_id="session_123",
            agent=agent,
            model=settings.azure_openai_deployment
        )

See Also:
    - CLAUDE.md: Comprehensive project documentation and architecture details
    - docs/: Sphinx-generated API reference documentation
"""
