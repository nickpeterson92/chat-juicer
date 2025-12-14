"""
Agent setup and configuration for Chat Juicer.
Creates and configures the Agent/Runner with tools and MCP servers.
"""

from __future__ import annotations

from typing import Any, Literal, TypeGuard, get_args

from agents import Agent, ModelSettings
from openai.types.shared import Reasoning

from core.constants import REASONING_MODELS
from utils.logger import logger

# Type alias for valid reasoning effort levels (accepts both none and minimal for compatibility)
ReasoningEffort = Literal["none", "minimal", "low", "medium", "high"]

# Models that use 'none' instead of 'minimal' (5.1+ series)
MODELS_USING_NONE = {"gpt-5.1", "gpt-5.2", "o3", "o4"}


def is_valid_reasoning_effort(value: str) -> TypeGuard[ReasoningEffort]:
    """Type guard to validate reasoning effort level.

    Args:
        value: String value to check

    Returns:
        True if value is a valid ReasoningEffort literal
    """
    return value in get_args(ReasoningEffort)


def normalize_reasoning_effort(effort: str, deployment: str) -> str:
    """Normalize reasoning effort based on model version.

    GPT-5.1+ uses 'none' for no reasoning, GPT-5.0 uses 'minimal'.
    This maps between them based on the target model.

    Args:
        effort: The reasoning effort level
        deployment: Model deployment name

    Returns:
        Normalized effort level for the target model
    """
    # Check if this is a model that uses 'none' (5.1+ series)
    uses_none = any(deployment.startswith(model) for model in MODELS_USING_NONE)

    if uses_none and effort == "minimal":
        # 5.1+ models: map 'minimal' -> 'none'
        logger.info(f"Mapping 'minimal' -> 'none' for model {deployment}")
        return "none"
    elif not uses_none and effort == "none":
        # 5.0 and older: map 'none' -> 'minimal'
        logger.info(f"Mapping 'none' -> 'minimal' for model {deployment}")
        return "minimal"

    return effort


def create_agent(
    deployment: str,
    instructions: str,
    tools: list[Any],
    mcp_servers: list[Any],
    reasoning_effort: str | None = None,
) -> Agent:
    """Create and configure Chat Juicer Agent with tools and MCP servers.

    Args:
        deployment: Model deployment name
        instructions: System instructions for the agent
        tools: List of function tools
        mcp_servers: List of initialized MCP servers
        reasoning_effort: Optional reasoning effort level (minimal, low, medium, high).
                         If None, uses global default from settings.

    Returns:
        Configured Agent instance

    Note:
        For concurrent request isolation, pass a custom model_provider via RunConfig
        to Runner.run_streamed() rather than trying to set client on Agent.
    """
    # Use session-specific reasoning_effort if provided, otherwise use default
    effort_level = reasoning_effort if reasoning_effort is not None else "medium"

    # Validate and narrow type using TypeGuard
    if is_valid_reasoning_effort(effort_level):
        validated_effort: ReasoningEffort = effort_level
    else:
        logger.warning(f"Invalid reasoning_effort '{effort_level}', defaulting to 'medium'")
        validated_effort = "medium"

    # Normalize effort for model compatibility (none <-> minimal mapping)
    normalized_effort = normalize_reasoning_effort(validated_effort, deployment)

    # Check if this is a reasoning model that supports reasoning_effort
    is_reasoning_model = any(deployment.startswith(model) for model in REASONING_MODELS)

    # Build common agent kwargs
    agent_kwargs: dict[str, Any] = {
        "name": "Chat Juicer",
        "model": deployment,
        "instructions": instructions,
        "tools": tools,
        "mcp_servers": mcp_servers,
    }

    # Configure model settings with reasoning effort only for reasoning models
    if is_reasoning_model:
        model_settings = ModelSettings(reasoning=Reasoning(effort=normalized_effort))  # type: ignore[arg-type]
        logger.info(f"Reasoning model detected - reasoning_effort set to '{normalized_effort}'")
        agent_kwargs["model_settings"] = model_settings
    else:
        logger.info("Non-reasoning model detected - reasoning_effort not applied")

    # Create agent
    agent = Agent(**agent_kwargs)

    # Log agent configuration
    logger.info(f"Chat Juicer Agent created - Deployment: {deployment}")
    logger.info(f"Agent configured with {len(tools)} tools and {len(mcp_servers)} MCP servers")

    return agent
