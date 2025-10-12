"""
MCP (Model Context Protocol) server initialization and management.
Configures and launches MCP servers for agent reasoning capabilities.
"""

from __future__ import annotations

from typing import Any

from agents.mcp import MCPServerStdio

from utils.logger import logger


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
            }
        )
        await seq_thinking.__aenter__()  # type: ignore[no-untyped-call]
        servers.append(seq_thinking)
        logger.info("Sequential Thinking MCP server initialized")
    except Exception as e:
        logger.warning(f"Sequential Thinking server not available: {e}")

    # Fetch Server - HTTP/web content retrieval (Python-based)
    try:
        fetch_server = MCPServerStdio(
            params={
                "command": ".juicer/bin/python3",
                "args": ["-m", "mcp_server_fetch"],
            }
        )
        await fetch_server.__aenter__()  # type: ignore[no-untyped-call]
        servers.append(fetch_server)
        logger.info("Fetch MCP server initialized")
    except Exception as e:
        logger.warning(f"Fetch server not available: {e}")

    return servers
