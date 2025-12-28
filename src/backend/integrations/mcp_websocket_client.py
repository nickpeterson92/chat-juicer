"""WebSocket MCP Client for containerized MCP servers.

This client connects to MCP servers via WebSocket and provides
the same interface as agents SDK clients.
"""

import asyncio
import json
import logging

from typing import Any

import websockets

try:
    from websockets.asyncio.client import ClientConnection
except ImportError:
    # Fallback for older versions or if type checking environment differs
    from typing import Any as ClientConnection  # type: ignore


from core.constants import (
    MCP_CALL_TOOL_TIMEOUT,
    MCP_CONNECT_TIMEOUT,
    MCP_LIST_TOOLS_TIMEOUT,
)
from models.mcp_models import MCPResult, MCPTool

logger = logging.getLogger(__name__)


class WebSocketMCPClient:
    """MCP client using WebSocket transport.

    This is a lightweight wrapper around websockets that implements
    the MCP protocol handshake and provides tool calling capabilities.
    """

    def __init__(self, ws_url: str, server_name: str):
        """Initialize WebSocket MCP client.

        Args:
            ws_url: WebSocket URL (e.g., "ws://localhost:8081/ws")
            server_name: Human-readable server name for logging
        """
        self.ws_url = ws_url
        self.server_name = server_name
        self.name = server_name  # SDK compatibility
        self.use_structured_content = True  # SDK compatibility
        self._ws: ClientConnection | None = None
        self._msg_id = 0
        self._initialized = False

    async def __aenter__(self) -> "WebSocketMCPClient":
        """Connect and initialize MCP server."""
        try:
            # Connect to WebSocket
            # Note: websockets.connect has its own open_timeout (default 10s)
            self._ws = await websockets.connect(self.ws_url, open_timeout=MCP_CONNECT_TIMEOUT)
            logger.info(f"{self.server_name}: WebSocket connected")

            # Send initialize request
            init_msg = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "chat-juicer", "version": "1.0.0"},
                },
            }

            if self._ws:
                await self._ws.send(json.dumps(init_msg))
            else:
                raise RuntimeError("WebSocket not connected")
            logger.debug(f"{self.server_name}: Sent initialize request")

            # Wait for initialize response
            response_text = await asyncio.wait_for(self._ws.recv(), timeout=MCP_CONNECT_TIMEOUT)
            response = json.loads(response_text)

            if "error" in response:
                raise RuntimeError(f"Initialize failed: {response['error']}")

            logger.info(f"{self.server_name}: Initialized successfully")

            # Send initialized notification
            init_notif = {"jsonrpc": "2.0", "method": "notifications/initialized"}
            await self._ws.send(json.dumps(init_notif))

            self._initialized = True
            return self

        except Exception as e:
            logger.error(f"{self.server_name}: Connection failed: {e}")
            if self._ws:
                await self._ws.close()
            raise

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Close WebSocket connection."""
        if self._ws:
            await self._ws.close()
            logger.info(f"{self.server_name}: WebSocket closed")
        self._initialized = False

    def _next_id(self) -> int:
        """Generate next message ID."""
        self._msg_id += 1
        return self._msg_id

    async def list_tools(self, *args: Any, **kwargs: Any) -> list[MCPTool]:
        """List available tools from MCP server."""
        if not self._initialized or not self._ws:
            raise RuntimeError("Client not initialized")

        msg = {"jsonrpc": "2.0", "id": self._next_id(), "method": "tools/list", "params": {}}

        await self._ws.send(json.dumps(msg))
        response_text = await asyncio.wait_for(self._ws.recv(), timeout=MCP_LIST_TOOLS_TIMEOUT)
        response = json.loads(response_text)

        if "error" in response:
            raise RuntimeError(f"list_tools failed: {response['error']}")

        tools_data = response.get("result", {}).get("tools", [])

        # Return list of MCPTool models (Pydantic based)
        return [MCPTool(**t) for t in tools_data]

    async def call_tool(self, tool_name: str, arguments: dict[str, Any], *args: Any, **kwargs: Any) -> MCPResult:
        """Call a tool on the MCP server."""
        if not self._initialized or not self._ws:
            raise RuntimeError("Client not initialized")

        msg = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }

        await self._ws.send(json.dumps(msg))
        response_text = await asyncio.wait_for(self._ws.recv(), timeout=MCP_CALL_TOOL_TIMEOUT)
        response = json.loads(response_text)

        if "error" in response:
            raise RuntimeError(f"call_tool failed: {response['error']}")

        result_data = response.get("result", {})

        # Return MCPResult model (Pydantic based) with aliased content
        return MCPResult(**result_data)
