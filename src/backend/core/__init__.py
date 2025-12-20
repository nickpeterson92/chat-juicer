"""
Core Application Layer - Agent Orchestration and Configuration
==============================================================

Provides the core business logic for Chat Juicer's Agent/Runner implementation.

Modules:
    agent: Agent creation and configuration with tools and MCP servers
    prompts: System instructions, document/conversation summarization prompts
    constants: Configuration values, token limits, and Pydantic settings validation

Key Components:

Agent Configuration (agent.py):
    Creates Agent instances with tools and MCP servers. The Agent/Runner framework
    automatically handles tool orchestration, streaming, and error recovery.

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

See Also:
    :mod:`api.services`: FastAPI services for session and chat management
    :mod:`tools`: Function calling tools for the Agent
    :mod:`integrations.mcp_servers`: MCP server setup and management
"""
