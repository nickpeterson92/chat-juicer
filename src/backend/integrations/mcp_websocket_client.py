"""WebSocket MCP Client for containerized MCP servers.

This client connects to MCP servers via WebSocket and provides
the same interface as agents SDK clients.
"""

import asyncio
import contextlib
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
    Supports multiplexing via background listener loop.
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

        # Multiplexing state
        self._pending_requests: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._listen_task: asyncio.Task[None] | None = None
        self._write_lock = asyncio.Lock()

    async def __aenter__(self) -> "WebSocketMCPClient":
        """Connect and initialize MCP server."""
        try:
            # Connect to WebSocket
            # Note: websockets.connect has its own open_timeout (default 10s)
            self._ws = await websockets.connect(self.ws_url, open_timeout=MCP_CONNECT_TIMEOUT)
            logger.info(f"{self.server_name}: WebSocket connected")

            # Start background listener loop
            self._listen_task = asyncio.create_task(self._listen_loop())

            # Perform handshake
            _ = await self._send_request(
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "chat-juicer", "version": "1.0.0"},
                },
                timeout=MCP_CONNECT_TIMEOUT,
            )

            logger.info(f"{self.server_name}: Initialized successfully")

            # Send initialized notification
            init_notif = {"jsonrpc": "2.0", "method": "notifications/initialized"}
            await self._ws.send(json.dumps(init_notif))

            self._initialized = True
            return self

        except Exception as e:
            logger.error(f"{self.server_name}: Connection failed: {e}")
            await self._cleanup()
            raise

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Close WebSocket connection."""
        await self._cleanup()

    async def _cleanup(self) -> None:
        """Cleanup resources and pending requests."""
        self._initialized = False

        # Cancel listener task
        if self._listen_task:
            self._listen_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listen_task
            self._listen_task = None

        # Cancel all pending requests
        for future in self._pending_requests.values():
            if not future.done():
                future.cancel()
        self._pending_requests.clear()

        # Close WebSocket
        if self._ws:
            await self._ws.close()
            logger.info(f"{self.server_name}: WebSocket closed")

    async def _listen_loop(self) -> None:
        """Background loop to receive messages and dispatch to pending requests."""
        if not self._ws:
            return

        try:
            async for message in self._ws:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    logger.warning(f"{self.server_name}: Received invalid JSON")
                    continue

                # Check if it's a response to a request
                if "id" in data:
                    msg_id = data["id"]
                    if msg_id in self._pending_requests:
                        future = self._pending_requests.pop(msg_id)
                        if not future.done():
                            if "error" in data:
                                future.set_exception(RuntimeError(f"MCP error: {data['error']}"))
                            else:
                                future.set_result(data)
                    else:
                        # Could be a request from server or notification with ID (rare)
                        # For now, we ignore server-initiated requests as we strictly act as a client
                        logger.debug(f"{self.server_name}: Received message with unknown ID: {msg_id}")
                else:
                    # Notification or other message type
                    logger.debug(f"{self.server_name}: Received notification: {data.get('method')}")

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"{self.server_name}: Listen loop error: {e}")
            # Fail all pending requests on connection error
            error = RuntimeError(f"Connection lost: {e}")
            for future in self._pending_requests.values():
                if not future.done():
                    future.set_exception(error)
            self._pending_requests.clear()

    def _next_id(self) -> int:
        """Generate next message ID."""
        self._msg_id += 1
        return self._msg_id

    async def _send_request(self, method: str, params: dict[str, Any], timeout: float) -> dict[str, Any]:
        """Send a JSON-RPC request and wait for the response."""
        if not self._ws:
            raise RuntimeError("WebSocket not connected")

        async with self._write_lock:
            msg_id = self._next_id()
            future: asyncio.Future[dict[str, Any]] = asyncio.Future()
            self._pending_requests[msg_id] = future

            req = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "method": method,
                "params": params,
            }
            await self._ws.send(json.dumps(req))

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(msg_id, None)
            raise RuntimeError(f"Request {method} timed out after {timeout}s") from None
        except Exception as e:
            self._pending_requests.pop(msg_id, None)
            raise e

    async def list_tools(self, *args: Any, **kwargs: Any) -> list[MCPTool]:
        """List available tools from MCP server."""
        if not self._initialized:
            raise RuntimeError("Client not initialized")

        response = await self._send_request("tools/list", {}, timeout=MCP_LIST_TOOLS_TIMEOUT)
        tools_data = response.get("result", {}).get("tools", [])
        return [MCPTool(**t) for t in tools_data]

    async def call_tool(self, tool_name: str, arguments: dict[str, Any], *args: Any, **kwargs: Any) -> MCPResult:
        """Call a tool on the MCP server."""
        if not self._initialized:
            raise RuntimeError("Client not initialized")

        response = await self._send_request(
            "tools/call", {"name": tool_name, "arguments": arguments}, timeout=MCP_CALL_TOOL_TIMEOUT
        )

        result_data = response.get("result", {})
        return MCPResult(**result_data)
