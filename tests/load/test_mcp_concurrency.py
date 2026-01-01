"""MCP server concurrency tests.

Validates that MCP servers handle concurrent tool calls efficiently
via WebSocket multiplexing.

Run with:
    pytest tests/load/test_mcp_concurrency.py -v --no-cov -s
"""

from __future__ import annotations

import asyncio
import time

from dataclasses import dataclass

import pytest


@dataclass
class ToolCallResult:
    """Result of a tool call."""

    index: int
    elapsed_ms: float
    success: bool
    error: str | None = None


async def call_mcp_tool_via_api(
    host: str,
    session_id: str,
    index: int,
    token: str | None = None,
) -> ToolCallResult:
    """Call MCP tool via WebSocket chat.

    Note: This is an indirect test - we send a message that triggers
    Sequential Thinking, and measure the response time.
    """
    import websockets

    start = time.monotonic()

    try:
        # Derive WS URL
        ws_host = host.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_host}/ws/chat/{session_id}"
        if token:
            ws_url += f"?token={token}"

        async with websockets.connect(ws_url, open_timeout=10.0) as ws:
            # Send a message that should trigger tool use
            # This tests the full path: WS -> ChatService -> MCP -> response
            await ws.send(
                '{"type": "message", "messages": [{"role": "user", "content": "Think step by step: what is 2+2?"}]}'
            )

            # Wait for assistant_start event (indicates processing began)
            async for msg in ws:
                import json

                data = json.loads(msg)
                if data.get("type") == "assistant_start":
                    elapsed = (time.monotonic() - start) * 1000
                    return ToolCallResult(index=index, elapsed_ms=elapsed, success=True)

                if data.get("type") == "error":
                    return ToolCallResult(
                        index=index,
                        elapsed_ms=(time.monotonic() - start) * 1000,
                        success=False,
                        error=data.get("message"),
                    )

            return ToolCallResult(
                index=index,
                elapsed_ms=(time.monotonic() - start) * 1000,
                success=False,
                error="No response received",
            )

    except Exception as e:
        return ToolCallResult(
            index=index,
            elapsed_ms=(time.monotonic() - start) * 1000,
            success=False,
            error=str(e),
        )


@pytest.mark.asyncio
@pytest.mark.skip(reason="Requires running backend with MCP servers - run manually")
async def test_mcp_concurrent_tool_calls(target_host: str) -> None:
    """Test concurrent MCP tool calls via chat.

    This test validates that the MCP singleton + multiplexing
    handles concurrent requests efficiently.
    """
    import httpx

    num_concurrent = 5

    print(f"\nTesting {num_concurrent} concurrent MCP tool calls")

    async with httpx.AsyncClient(base_url=f"{target_host}/api/v1", timeout=30.0) as client:
        # Create sessions for each concurrent call
        sessions = []
        for i in range(num_concurrent):
            response = await client.post("/sessions", json={"title": f"MCP Test {i}"})
            if response.status_code == 200:
                sessions.append(response.json().get("session_id"))

        if len(sessions) < num_concurrent:
            pytest.skip(f"Could only create {len(sessions)} sessions")

        try:
            # Fire concurrent tool calls
            tasks = [call_mcp_tool_via_api(target_host, sid, i) for i, sid in enumerate(sessions)]

            start = time.monotonic()
            results = await asyncio.gather(*tasks)
            total_time = (time.monotonic() - start) * 1000

            # Analyze concurrency
            successful = [r for r in results if r.success]
            if successful:
                individual_times = [r.elapsed_ms for r in successful]
                sum_sequential = sum(individual_times)
                max_time = max(individual_times)

                print(f"\nResults: {len(successful)}/{num_concurrent} successful")
                print(f"Individual times: {[f'{t:.0f}ms' for t in individual_times]}")
                print(f"Total wall time: {total_time:.0f}ms")
                print(f"Sum if sequential: {sum_sequential:.0f}ms")
                print(f"Concurrency ratio: {len(successful) * max_time / sum_sequential:.2f}x")

            else:
                print(f"All failed: {[r.error for r in results]}")

        finally:
            # Cleanup
            for sid in sessions:
                await client.delete(f"/sessions/{sid}")


@pytest.mark.asyncio
async def test_session_creation_concurrency(target_host: str) -> None:
    """Test concurrent session creation (database stress)."""
    import httpx

    num_sessions = 20

    print(f"\nCreating {num_sessions} sessions concurrently against {target_host}")

    async def create_session(client: httpx.AsyncClient, i: int) -> tuple[int, bool, float, str | None]:
        start = time.monotonic()
        try:
            response = await client.post("/sessions", json={"title": f"Concurrent {i}"})
            elapsed = (time.monotonic() - start) * 1000
            success = response.status_code == 200
            session_id = response.json().get("session_id") if success else None
            return i, success, elapsed, session_id
        except Exception:
            return i, False, (time.monotonic() - start) * 1000, None

    async with httpx.AsyncClient(base_url=f"{target_host}/api/v1", timeout=60.0) as client:
        tasks = [create_session(client, i) for i in range(num_sessions)]

        start = time.monotonic()
        results = await asyncio.gather(*tasks)
        total_time = (time.monotonic() - start) * 1000

        successful = [(i, t, sid) for i, s, t, sid in results if s]

        print(f"\nResults: {len(successful)}/{num_sessions} successful")
        if successful:
            times = [t for _, t, _ in successful]
            print(f"Avg: {sum(times)/len(times):.0f}ms, Max: {max(times):.0f}ms")

        print(f"Total wall time: {total_time:.0f}ms")

        # Cleanup
        for _, _, sid in successful:
            if sid:
                await client.delete(f"/sessions/{sid}")

        assert len(successful) >= num_sessions * 0.9, "Less than 90% success rate"
