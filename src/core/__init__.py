"""
Core Application Layer - Agent Orchestration and Session Management
====================================================================

Provides the core business logic for Chat Juicer's Agent/Runner implementation.

Modules:
    agent: Agent creation and configuration with tools and MCP servers
    session: Token-aware SQLiteSession with automatic conversation summarization
    prompts: System instructions, document/conversation summarization prompts
    constants: Configuration values, token limits, and Pydantic settings validation

Key Components:

Agent Configuration (agent.py):
    Creates Agent instances with tools and MCP servers. The Agent/Runner framework
    automatically handles tool orchestration, streaming, and error recovery.

Token-Aware Sessions (session.py):
    Extends SQLiteSession with automatic summarization based on token thresholds.
    Monitors conversation length and triggers summarization at configurable percentages
    of model token limits (e.g., 20% of GPT-5's 272k = 54.4k token trigger).

System Prompts (prompts.py):
    Contains the core system instructions for the agent, including:
    - Template-first workflow (always check templates/ before asking user)
    - Parallel reads enforcement (10x performance improvement)
    - Markdown formatting requirements
    - Document and conversation summarization strategies

Configuration (constants.py):
    Centralized configuration using Pydantic Settings for validation:
    - Azure OpenAI credentials and endpoints
    - Model token limits (GPT-5: 272k, GPT-4o: 128k, etc.)
    - Summarization thresholds and file processing limits
    - Logging configuration and session parameters

Example:
    Creating an agent with token-aware session::

        from core.agent import create_agent
        from core.constants import DEFAULT_MODEL, get_settings
        from core.prompts import SYSTEM_INSTRUCTIONS
        from core.session import TokenAwareSQLiteSession

        settings = get_settings()
        agent = create_agent(
            deployment=DEFAULT_MODEL,
            instructions=SYSTEM_INSTRUCTIONS,
            tools=AGENT_TOOLS,
            mcp_servers=mcp_servers
        )

        session = TokenAwareSQLiteSession(
            session_id="session_123",
            agent=agent,
            model=DEFAULT_MODEL,
            threshold=0.2  # Summarize at 20% of token limit
        )

See Also:
    :mod:`tools`: Function calling tools for the Agent
    :mod:`integrations.mcp_servers`: MCP server setup and management
"""
