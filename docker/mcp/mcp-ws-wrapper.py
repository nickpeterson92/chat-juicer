"""
MCP Server WebSocket Bridge
Bidirectional WebSocket-to-stdio bridge for containerized MCP servers
"""

import asyncio
import json
import os
import sys

from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect

app = FastAPI()

# Get server command from environment
SERVER_CMD = os.getenv("MCP_SERVER_CMD", "").split() if os.getenv("MCP_SERVER_CMD") else []
if not SERVER_CMD:
    print("ERROR: MCP_SERVER_CMD environment variable not set", file=sys.stderr)
    sys.exit(1)


class MCPBridge:
    """Bridges WebSocket connection to stdio MCP server process."""

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.process: asyncio.subprocess.Process | None = None
        self.running = False

    async def start(self) -> None:
        """Start MCP server process and bridge communication."""
        # Spawn stdio MCP server
        self.process = await asyncio.create_subprocess_exec(
            *SERVER_CMD,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self.running = True

        # Start bidirectional forwarding
        await asyncio.gather(self._forward_ws_to_stdio(), self._forward_stdio_to_ws(), return_exceptions=True)

    async def _forward_ws_to_stdio(self) -> None:
        """Forward messages from WebSocket to stdio."""
        try:
            while self.running and self.process and self.process.stdin:
                # Receive JSON-RPC message from WebSocket
                data = await self.websocket.receive_text()

                # Forward to stdio (add newline for line-based protocol)
                self.process.stdin.write((data + "\n").encode())
                await self.process.stdin.drain()

        except WebSocketDisconnect:
            self.running = False
        except Exception as e:
            print(f"WS→stdio error: {e}", file=sys.stderr)
            self.running = False

    async def _forward_stdio_to_ws(self) -> None:
        """Forward messages from stdio to WebSocket."""
        try:
            while self.running and self.process and self.process.stdout:
                # Read line from stdio
                line = await self.process.stdout.readline()
                if not line:
                    break

                response_text = line.decode().strip()
                if not response_text:
                    continue

                # Handle SSE format from servers like Sequential Thinking
                json_str = response_text[6:] if response_text.startswith("data: ") else response_text

                # Validate it's JSON before sending
                try:
                    json.loads(json_str)
                    await self.websocket.send_text(json_str)
                except json.JSONDecodeError:
                    # Skip invalid JSON (debug output, etc.)
                    continue

        except Exception as e:
            print(f"stdio→WS error: {e}", file=sys.stderr)
            self.running = False

    async def cleanup(self) -> None:
        """Cleanup resources."""
        self.running = False
        if self.process:
            try:
                self.process.kill()
                await self.process.wait()
            except Exception:
                pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for MCP communication."""
    await websocket.accept()

    bridge = MCPBridge(websocket)
    try:
        await bridge.start()
    finally:
        await bridge.cleanup()


@app.post("/messages")
async def post_message(request: Request) -> Any:
    """POST endpoint for SSE client-to-server messages.

    Note: This is stateless - spawns a process, sends message, gets response.
    For proper bidirectional communication, use WebSocket endpoint.
    """
    from fastapi.responses import JSONResponse

    try:
        # Get JSON-RPC message from request
        message = await request.json()

        # Spawn process, send message, wait for response
        process = await asyncio.create_subprocess_exec(
            *SERVER_CMD,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Send message
        if process.stdin:
            message_json = json.dumps(message) + "\n"
            process.stdin.write(message_json.encode())
            await process.stdin.drain()

        # Read response (with timeout)
        _ = await asyncio.wait_for(process.stdout.readline() if process.stdout else asyncio.sleep(0), timeout=5.0)

        # Cleanup
        process.kill()
        await process.wait()

        return JSONResponse(content={"status": "sent"})

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


@app.get("/sse")
async def sse_endpoint(request: Request) -> Any:
    """SSE endpoint for MCP communication (MCPServerSse compatibility).

    Each client gets its own dedicated MCP server process to avoid
    concurrent stdout reading conflicts.
    """
    from fastapi.responses import StreamingResponse

    async def event_stream() -> Any:
        """Stream SSE events from a dedicated MCP server process."""
        process = None
        try:
            # Spawn dedicated MCP server for this client
            process = await asyncio.create_subprocess_exec(
                *SERVER_CMD,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            print(f"SSE client: spawned dedicated process pid={process.pid}", file=sys.stderr, flush=True)

            # Send initial connection event
            yield ": connected\n\n"

            # Stream output indefinitely
            if process.stdout:
                while True:
                    try:
                        # Read with timeout so we can send keep-alives
                        line = await asyncio.wait_for(
                            process.stdout.readline(),
                            timeout=15.0,  # 15 second timeout
                        )

                        if not line:
                            # Process ended
                            print(f"SSE client: process {process.pid} ended", file=sys.stderr, flush=True)
                            break

                        response_text = line.decode().strip()
                        if not response_text:
                            continue

                        # Handle SSE format from servers like Sequential Thinking
                        if response_text.startswith("data: "):
                            # Already in SSE format
                            yield response_text + "\n\n"
                        else:
                            # Wrap in SSE format
                            yield f"data: {response_text}\n\n"

                    except asyncio.TimeoutError:
                        # Send keep-alive comment to prevent timeout
                        yield ": keep-alive\n\n"
                        continue
                    except Exception as e:
                        error_msg = f"SSE stream read error: {type(e).__name__}: {e}"
                        print(error_msg, file=sys.stderr, flush=True)
                        yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                        break

        except Exception as e:
            error_msg = f"SSE client error: {type(e).__name__}: {e}"
            print(error_msg, file=sys.stderr, flush=True)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Cleanup dedicated process
            if process:
                try:
                    process.kill()
                    await process.wait()
                    print(f"SSE client: cleaned up process {process.pid}", file=sys.stderr, flush=True)
                except Exception:
                    pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@app.get("/")
async def root(request: Request) -> Any:
    """Root endpoint - serves SSE stream for SDK compatibility."""
    # Forward to SSE endpoint
    return await sse_endpoint(request)


@app.get("/info")
async def info() -> dict[str, Any]:
    """Server info endpoint."""
    return {
        "server": " ".join(SERVER_CMD),
        "protocol": "mcp-sse",
        "endpoints": ["/ws", "/messages", "/sse", "/"],
        "status": "ready",
    }


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
