"""
Built-in Tools Registry - Centralized OpenAI built-in tools configuration.
Provides named access to built-in tools (web_search, code_interpreter) with metadata.
"""

from __future__ import annotations

from typing import Any, TypedDict

from agents import CodeInterpreterTool, WebSearchTool

from utils.logger import logger


class BuiltinToolConfig(TypedDict):
    """Built-in tool configuration structure."""

    name: str
    description: str
    enabled_by_default: bool


# Built-in Tool Definitions
BUILTIN_TOOL_CONFIGS: dict[str, BuiltinToolConfig] = {
    "web_search": {
        "name": "Web Search",
        "description": "Real-time web search powered by OpenAI for current information and facts",
        "enabled_by_default": False,
    },
    "code_interpreter": {
        "name": "Code Interpreter",
        "description": "Execute Python code in sandboxed environment for calculations, data analysis, and charts",
        "enabled_by_default": False,
    },
}

# Default built-in tools enabled for new sessions
DEFAULT_BUILTIN_TOOLS: list[str] = []


def initialize_builtin_tool(tool_key: str, session_file_ids: list[str] | None = None) -> Any | None:
    """Initialize a single built-in tool by its registry key.

    Args:
        tool_key: Key from BUILTIN_TOOL_CONFIGS (e.g., "web_search", "code_interpreter")
        session_file_ids: OpenAI file IDs to pass to code interpreter (optional)

    Returns:
        Initialized tool instance or None if initialization failed
    """
    if tool_key not in BUILTIN_TOOL_CONFIGS:
        logger.warning(f"Unknown built-in tool key: {tool_key}")
        return None

    config = BUILTIN_TOOL_CONFIGS[tool_key]
    try:
        if tool_key == "web_search":
            tool: WebSearchTool | CodeInterpreterTool = WebSearchTool()
        elif tool_key == "code_interpreter":
            # CodeInterpreterTool requires a CodeInterpreter config with type and container
            from openai.types.responses.tool_param import CodeInterpreter

            tool = CodeInterpreterTool(
                tool_config=CodeInterpreter(
                    type="code_interpreter", container={"type": "auto", "file_ids": session_file_ids or []}
                )
            )
        else:
            logger.warning(f"No implementation for tool: {tool_key}")
            return None

        logger.info(f"{config['name']} built-in tool initialized")
        return tool
    except Exception as e:
        logger.warning(f"{config['name']} tool not available: {e}")
        return None


def initialize_all_builtin_tools(session_file_ids: list[str] | None = None) -> dict[str, Any]:
    """Initialize all available built-in tools and return as a dictionary.

    Args:
        session_file_ids: OpenAI file IDs to pass to code interpreter (optional)

    Returns:
        Dictionary mapping tool keys to initialized tool instances
    """
    tools: dict[str, Any] = {}

    for tool_key in BUILTIN_TOOL_CONFIGS:
        tool = initialize_builtin_tool(tool_key, session_file_ids=session_file_ids)
        if tool:
            tools[tool_key] = tool

    logger.info(f"Initialized {len(tools)}/{len(BUILTIN_TOOL_CONFIGS)} built-in tools")
    return tools


def filter_builtin_tools(all_tools: dict[str, Any], config: list[str] | None = None) -> list[Any]:
    """Filter built-in tools based on user configuration.

    Args:
        all_tools: Dictionary of all available built-in tools
        config: List of tool keys to include (None = use DEFAULT_BUILTIN_TOOLS)

    Returns:
        List of tool instances matching the configuration
    """
    if config is None:
        config = DEFAULT_BUILTIN_TOOLS

    # Filter tools and maintain order
    filtered = []
    for tool_key in config:
        if tool_key in all_tools:
            filtered.append(all_tools[tool_key])
        else:
            logger.warning(f"Built-in tool '{tool_key}' not available (skipping)")

    logger.debug(f"Filtered built-in tools: {len(filtered)}/{len(all_tools)} selected")
    return filtered


def get_builtin_tool_info() -> dict[str, dict[str, str]]:
    """Get information about all available built-in tools for UI display.

    Returns:
        Dictionary mapping tool keys to their metadata (name, description)
    """
    return {
        key: {
            "name": config["name"],
            "description": config["description"],
        }
        for key, config in BUILTIN_TOOL_CONFIGS.items()
    }


__all__ = [
    "BUILTIN_TOOL_CONFIGS",
    "DEFAULT_BUILTIN_TOOLS",
    "filter_builtin_tools",
    "get_builtin_tool_info",
    "initialize_all_builtin_tools",
    "initialize_builtin_tool",
]
