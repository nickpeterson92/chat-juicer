"""
MCP (Model Context Protocol) server initialization and management.
Configures and launches MCP servers for agent reasoning capabilities.
"""

from __future__ import annotations

from typing import Any

from agents.mcp import MCPServerStdio

from utils.logger import logger

# MCP server timeout in seconds (default SDK timeout is 5s which is too short)
# Network requests and reasoning operations can take longer
MCP_SERVER_TIMEOUT_SECONDS = 60.0


async def setup_mcp_servers() -> list[Any]:
    """Configure and initialize MCP servers.

    Returns:
        List of initialized MCP server instances
    """
    servers = []

    # Sequential Thinking Server - our primary reasoning tool
    try:
        seq_thinking = MCPServerStdio(
            params={
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
            },
            client_session_timeout_seconds=MCP_SERVER_TIMEOUT_SECONDS,
        )
        await seq_thinking.__aenter__()  # type: ignore[no-untyped-call]
        servers.append(seq_thinking)
        logger.info(f"Sequential Thinking MCP server initialized (timeout: {MCP_SERVER_TIMEOUT_SECONDS}s)")
    except Exception as e:
        logger.warning(f"Sequential Thinking server not available: {e}")

    # Fetch Server - HTTP/web content retrieval (Python-based)
    try:
        fetch_server = MCPServerStdio(
            params={
                "command": ".juicer/bin/python3",
                "args": ["-m", "mcp_server_fetch"],
            },
            client_session_timeout_seconds=MCP_SERVER_TIMEOUT_SECONDS,
        )
        await fetch_server.__aenter__()  # type: ignore[no-untyped-call]
        servers.append(fetch_server)
        logger.info(f"Fetch MCP server initialized (timeout: {MCP_SERVER_TIMEOUT_SECONDS}s)")
    except Exception as e:
        logger.warning(f"Fetch server not available: {e}")

    return servers
