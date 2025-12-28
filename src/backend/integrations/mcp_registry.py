"""
MCP Server Registry - Centralized MCP server configuration and management.
Provides named access to MCP servers and filtering based on user configuration.
"""

from __future__ import annotations

from typing import Any, TypedDict

from core.constants import get_settings
from utils.logger import logger

# MCP server timeout in seconds (default SDK timeout is 5s which is too short)
MCP_SERVER_TIMEOUT_SECONDS = 60.0


class MCPServerConfig(TypedDict, total=False):
    """MCP Server configuration structure."""

    name: str
    description: str
    env_key: str  # Optional: Settings attribute name for API key (e.g., "tavily_api_key")
    transport: str  # "stdio" or "websocket"
    url: str  # WebSocket URL if transport is websocket


# MCP Server Definitions
# Using WebSocket transport for containerized servers
MCP_SERVER_CONFIGS: dict[str, MCPServerConfig] = {
    "sequential": {
        "name": "Sequential Thinking",
        "description": "Advanced reasoning with step-by-step problem solving and hypothesis testing",
        "transport": "websocket",  # WebSocket transport
        "url": "ws://localhost:8081/ws",  # WebSocket endpoint
    },
    "fetch": {
        "name": "Web Fetch",
        "description": "HTTP/HTTPS web content retrieval with HTML to markdown conversion",
        "transport": "websocket",  # WebSocket transport
        "url": "ws://localhost:8082/ws",  # WebSocket endpoint
    },
    "tavily": {
        "name": "Tavily Search",
        "description": "Web search, extraction, and crawling via Tavily API",
        "transport": "websocket",  # WebSocket transport
        "url": "ws://localhost:8083/ws",  # WebSocket endpoint
        "env_key": "tavily_api_key",
    },
}

# Default MCP servers enabled for new sessions
DEFAULT_MCP_SERVERS = ["sequential", "fetch", "tavily"]


async def initialize_mcp_server(server_key: str) -> Any | None:
    """Initialize a single MCP server using WebSocket transport.

    Args:
        server_key: Key from MCP_SERVER_CONFIGS (e.g., "sequential", "fetch", "tavily")

    Returns:
        Initialized MCP server instance or None if initialization failed
    """
    if server_key not in MCP_SERVER_CONFIGS:
        logger.warning(f"Unknown MCP server key: {server_key}")
        return None

    config = MCP_SERVER_CONFIGS[server_key]

    # Check for required API keys
    env_key = config.get("env_key")
    if env_key:
        settings = get_settings()
        api_key = getattr(settings, env_key, None)
        if not api_key:
            logger.info(f"{config['name']} skipped - {env_key.upper()} not configured")
            return None

    try:
        # Use transport abstraction (WebSocket)
        from integrations.mcp_transport import create_transport

        transport = await create_transport(config)
        server = await transport.connect()
        return server
    except ImportError:
        logger.warning(f"{config['name']} server not available - transport module not found")
        return None
    except Exception as e:
        logger.warning(f"{config['name']} server not available: {e}")
        return None


async def initialize_all_mcp_servers() -> dict[str, Any]:
    """Initialize all available MCP servers and return as a dictionary.

    Returns:
        Dictionary mapping server keys to initialized MCP server instances
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
        List of MCP server client instances matching the configuration
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
