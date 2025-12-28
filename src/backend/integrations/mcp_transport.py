"""
MCP Transport Abstraction Layer.

Supports WebSocket (Phase 2) transport for containerized MCP servers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from utils.logger import logger

# Phase 2: WebSocket transport
from .mcp_websocket_client import WebSocketMCPClient


class MCPTransport(ABC):
    """Abstract base for MCP server transports."""

    @abstractmethod
    async def connect(self) -> Any:
        """Connect to MCP server and return client instance.

        Returns:
            MCP server client instance
        """
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from MCP server and cleanup resources."""
        pass


class WebSocketTransport(MCPTransport):
    """Phase 2: WebSocket transport for containerized MCP servers.

    Uses WebSocket for persistent bidirectional communication with Docker containers.
    Perfect match for MCP's stream-based protocol.
    """

    def __init__(self, ws_url: str, server_name: str):
        """Initialize WebSocket transport.

        Args:
            ws_url: WebSocket endpoint URL (e.g., "ws://localhost:8081/ws")
            server_name: Human-readable server name for logging
        """
        self.ws_url = ws_url
        self.server_name = server_name
        self._client: Any | None = None

    async def connect(self) -> Any:
        """Connect to MCP server via WebSocket.

        Uses custom WebSocketMCPClient for true bidirectional communication.
        """
        try:
            self._client = WebSocketMCPClient(self.ws_url, self.server_name)
            await self._client.__aenter__()

            logger.info(f"{self.server_name} connected via WebSocket ({self.ws_url})")
            return self._client

        except Exception as e:
            logger.error(f"Failed to connect to {self.server_name}: {e}")
            raise RuntimeError(
                f"Cannot connect to {self.server_name} at {self.ws_url}. "
                "Ensure container is running via docker-compose."
            ) from e

    async def disconnect(self) -> None:
        """Disconnect from WebSocket MCP server."""
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
                logger.info(f"{self.server_name} WebSocket disconnected")
            except Exception as e:
                logger.warning(f"Error disconnecting {self.server_name}: {e}")
            finally:
                self._client = None


async def create_transport(config: dict[str, Any]) -> MCPTransport:
    """Factory function to create appropriate transport based on config.

    Args:
        config: Server configuration dictionary

    Returns:
        MCPTransport instance (WebSocket)

    Raises:
        ValueError: If transport mode is unknown
    """
    transport_mode = config.get("transport", "websocket")

    if transport_mode == "websocket":
        return WebSocketTransport(
            ws_url=config["url"],
            server_name=config["name"],
        )
    else:
        raise ValueError(f"Unknown transport mode: {transport_mode}")
