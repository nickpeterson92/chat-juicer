"""
Agent setup and configuration for Chat Juicer.
Creates and configures the Agent/Runner with tools and MCP servers.
"""

from __future__ import annotations

from typing import Any

from agents import Agent

from utils.logger import logger


def create_agent(deployment: str, instructions: str, tools: list[Any], mcp_servers: list[Any]) -> Agent:
    """Create and configure Chat Juicer Agent with tools and MCP servers.

    Args:
        deployment: Model deployment name
        instructions: System instructions for the agent
        tools: List of function tools
        mcp_servers: List of initialized MCP servers

    Returns:
        Configured Agent instance
    """
    # Create agent with tools and MCP servers
    agent = Agent(
        name="Chat Juicer",
        model=deployment,
        instructions=instructions,
        tools=tools,
        mcp_servers=mcp_servers,
    )

    # Log agent configuration
    logger.info(f"Chat Juicer Agent created - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(tools)} tools and {len(mcp_servers)} MCP servers")

    return agent
