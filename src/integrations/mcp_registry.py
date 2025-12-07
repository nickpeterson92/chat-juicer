"""
MCP Server Registry - Centralized MCP server configuration and management.
Provides named access to MCP servers and filtering based on user configuration.
"""

from __future__ import annotations

from typing import Any, TypedDict, cast

from agents.mcp import MCPServerStdio, MCPServerStdioParams

from core.constants import get_settings
from integrations.mcp_servers import MCP_SERVER_TIMEOUT_SECONDS
from utils.logger import logger


class MCPServerConfig(TypedDict, total=False):
    """MCP Server configuration structure."""

    name: str
    description: str
    command: str
    args: list[str]
    env_key: str  # Optional: Settings attribute name for API key (e.g., "tavily_api_key")


# MCP Server Definitions
MCP_SERVER_CONFIGS: dict[str, MCPServerConfig] = {
    "sequential": {
        "name": "Sequential Thinking",
        "description": "Advanced reasoning with step-by-step problem solving and hypothesis testing",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    },
    "fetch": {
        "name": "Web Fetch",
        "description": "HTTP/HTTPS web content retrieval with HTML to markdown conversion",
        "command": ".juicer/bin/python3",
        "args": ["-m", "mcp_server_fetch"],
    },
    "tavily": {
        "name": "Tavily Search",
        "description": "Web search, extraction, and crawling via Tavily API",
        "command": "npx",
        "args": ["-y", "tavily-mcp@latest"],
        "env_key": "tavily_api_key",  # Maps to Settings.tavily_api_key
    },
}

# Default MCP servers enabled for new sessions
DEFAULT_MCP_SERVERS = ["sequential", "fetch", "tavily"]


async def initialize_mcp_server(server_key: str) -> MCPServerStdio | None:
    """Initialize a single MCP server by its registry key.

    Args:
        server_key: Key from MCP_SERVER_CONFIGS (e.g., "sequential", "fetch", "tavily")

    Returns:
        Initialized MCPServerStdio instance or None if initialization failed
    """
    if server_key not in MCP_SERVER_CONFIGS:
        logger.warning(f"Unknown MCP server key: {server_key}")
        return None

    config = MCP_SERVER_CONFIGS[server_key]

    # Build params dict with command and args
    params: dict[str, Any] = {
        "command": config["command"],
        "args": config["args"],
    }

    # Handle environment variables for servers requiring API keys
    env_key = config.get("env_key")
    if env_key:
        settings = get_settings()
        api_key = getattr(settings, env_key, None)
        if not api_key:
            logger.info(f"{config['name']} skipped - {env_key.upper()} not configured")
            return None
        # Map env_key to expected env var name (e.g., tavily_api_key -> TAVILY_API_KEY)
        env_var_name = env_key.upper()
        params["env"] = {env_var_name: api_key}

    try:
        server = MCPServerStdio(
            params=cast(MCPServerStdioParams, params),
            client_session_timeout_seconds=MCP_SERVER_TIMEOUT_SECONDS,
        )
        await server.__aenter__()  # type: ignore[no-untyped-call]
        logger.info(f"{config['name']} MCP server initialized (timeout: {MCP_SERVER_TIMEOUT_SECONDS}s)")
        return server
    except Exception as e:
        logger.warning(f"{config['name']} server not available: {e}")
        return None


async def initialize_all_mcp_servers() -> dict[str, Any]:
    """Initialize all available MCP servers and return as a dictionary.

    Returns:
        Dictionary mapping server keys to initialized MCPServerStdio instances
    """
    servers: dict[str, Any] = {}

    for server_key in MCP_SERVER_CONFIGS:
        server = await initialize_mcp_server(server_key)
        if server:
            servers[server_key] = server

    logger.info(f"Initialized {len(servers)}/{len(MCP_SERVER_CONFIGS)} MCP servers")
    return servers


def filter_mcp_servers(all_servers: dict[str, Any], config: list[str] | None = None) -> list[Any]:
    """Filter MCP servers based on user configuration.

    Args:
        all_servers: Dictionary of all available MCP servers
        config: List of server keys to include (None = use DEFAULT_MCP_SERVERS)

    Returns:
        List of MCPServerStdio instances matching the configuration
    """
    if config is None:
        config = DEFAULT_MCP_SERVERS

    # Filter servers and maintain order
    filtered = []
    for server_key in config:
        if server_key in all_servers:
            filtered.append(all_servers[server_key])
        else:
            logger.warning(f"MCP server '{server_key}' not available (skipping)")

    logger.debug(f"Filtered MCP servers: {len(filtered)}/{len(all_servers)} selected")
    return filtered


def get_mcp_server_info() -> dict[str, dict[str, str]]:
    """Get information about all available MCP servers for UI display.

    Returns:
        Dictionary mapping server keys to their metadata (name, description)
    """
    return {
        key: {"name": config["name"], "description": config["description"]}
        for key, config in MCP_SERVER_CONFIGS.items()
    }


__all__ = [
    "DEFAULT_MCP_SERVERS",
    "MCP_SERVER_CONFIGS",
    "filter_mcp_servers",
    "get_mcp_server_info",
    "initialize_all_mcp_servers",
    "initialize_mcp_server",
]
