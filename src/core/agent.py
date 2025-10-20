"""
Agent setup and configuration for Wishgate.
Creates and configures the Agent/Runner with tools and MCP servers.
"""

from __future__ import annotations

from typing import Any

from agents import Agent, ModelSettings
from openai.types.shared import Reasoning

from core.constants import REASONING_MODELS, get_settings
from integrations.builtin_tools_registry import filter_builtin_tools, initialize_all_builtin_tools
from utils.logger import logger


def create_agent(
    deployment: str,
    tools: list[Any],
    mcp_servers: list[Any],
    builtin_tools_config: list[str] | None = None,
    mcp_server_names: list[str] | None = None,
    session_file_ids: list[str] | None = None,
) -> Agent:
    """Create and configure Wishgate Agent with tools, MCP servers, and built-in tools.

    Dynamically builds system instructions based on enabled tools and MCP servers.

    Args:
        deployment: Model deployment name
        tools: List of function tools
        mcp_servers: List of initialized MCP servers
        builtin_tools_config: List of built-in tool keys to enable (e.g., ["web_search", "code_interpreter"])
        mcp_server_names: List of MCP server names for prompt generation (e.g., ["sequential-thinking"])
        session_file_ids: OpenAI file IDs to pass to code interpreter (optional)

    Returns:
        Configured Agent instance
    """
    from core.prompts import build_system_instructions

    # Get settings for reasoning effort configuration
    settings = get_settings()

    # Initialize built-in tools based on configuration (with session file IDs for code interpreter)
    all_builtin_tools = initialize_all_builtin_tools(session_file_ids=session_file_ids)
    enabled_builtin_tools = filter_builtin_tools(all_builtin_tools, builtin_tools_config)

    # Combine custom tools with enabled built-in tools
    all_tools = tools + enabled_builtin_tools

    # Build dynamic system instructions based on enabled tools and MCP servers
    instructions = build_system_instructions(mcp_servers=mcp_server_names, builtin_tools=builtin_tools_config)

    logger.info(f"Built-in tools enabled: {builtin_tools_config or []}")
    logger.info(f"MCP servers enabled: {mcp_server_names or []}")
    logger.info(f"Total tools: {len(tools)} custom + {len(enabled_builtin_tools)} built-in = {len(all_tools)}")

    # Check if this is a reasoning model that supports reasoning_effort
    is_reasoning_model = any(deployment.startswith(model) for model in REASONING_MODELS)

    # Configure model settings with reasoning effort only for reasoning models
    if is_reasoning_model:
        model_settings = ModelSettings(reasoning=Reasoning(effort=settings.reasoning_effort))
        logger.info(f"Reasoning model detected - reasoning_effort set to '{settings.reasoning_effort}'")
        # Create agent with reasoning configuration
        agent = Agent(
            name="Wishgate",
            model=deployment,
            instructions=instructions,
            tools=all_tools,
            mcp_servers=mcp_servers,
            model_settings=model_settings,
        )
    else:
        logger.info("Non-reasoning model detected - reasoning_effort not applied")

        # Create agent without model_settings
        agent = Agent(
            name="Wishgate",
            model=deployment,
            instructions=instructions,
            tools=all_tools,
            mcp_servers=mcp_servers,
        )

    # Log agent configuration
    logger.info(f"Wishgate Agent created - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(all_tools)} total tools and {len(mcp_servers)} MCP servers")

    return agent
