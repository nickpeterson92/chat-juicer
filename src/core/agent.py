"""
Agent setup and configuration for Wishgate.
Creates and configures the Agent/Runner with tools and MCP servers.
"""

from __future__ import annotations

from typing import Any, Literal

from agents import Agent, ModelSettings
from openai.types.shared import Reasoning

from core.constants import REASONING_MODELS, get_settings
from utils.logger import logger

# Type alias for valid reasoning effort levels
ReasoningEffort = Literal["minimal", "low", "medium", "high"]


def create_agent(
    deployment: str,
    instructions: str,
    tools: list[Any],
    mcp_servers: list[Any],
    reasoning_effort: str | None = None,
) -> Agent:
    """Create and configure Wishgate Agent with tools and MCP servers.

    Args:
        deployment: Model deployment name
        instructions: System instructions for the agent
        tools: List of function tools
        mcp_servers: List of initialized MCP servers
        reasoning_effort: Optional reasoning effort level (minimal, low, medium, high).
                         If None, uses global default from settings.

    Returns:
        Configured Agent instance
    """
    # Get settings for reasoning effort configuration
    settings = get_settings()

    # Use session-specific reasoning_effort if provided, otherwise use global default
    effort_level = reasoning_effort if reasoning_effort is not None else settings.reasoning_effort

    # Validate effort_level is a valid literal type
    valid_efforts: tuple[ReasoningEffort, ...] = ("minimal", "low", "medium", "high")
    if effort_level not in valid_efforts:
        logger.warning(f"Invalid reasoning_effort '{effort_level}', defaulting to 'medium'")
        effort_level = "medium"

    # Type assertion after validation - we know it's a valid literal now
    validated_effort: ReasoningEffort = effort_level  # type: ignore[assignment]

    # Check if this is a reasoning model that supports reasoning_effort
    is_reasoning_model = any(deployment.startswith(model) for model in REASONING_MODELS)

    # Configure model settings with reasoning effort only for reasoning models
    if is_reasoning_model:
        model_settings = ModelSettings(reasoning=Reasoning(effort=validated_effort))
        logger.info(f"Reasoning model detected - reasoning_effort set to '{effort_level}'")
        # Create agent with reasoning configuration
        agent = Agent(
            name="Wishgate",
            model=deployment,
            instructions=instructions,
            tools=tools,
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
            tools=tools,
            mcp_servers=mcp_servers,
        )

    # Log agent configuration
    logger.info(f"Wishgate Agent created - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(tools)} tools and {len(mcp_servers)} MCP servers")

    return agent
