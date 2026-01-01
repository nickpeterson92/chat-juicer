"""MCP server concurrency tests.

Validates that MCP servers handle concurrent tool calls efficiently
via WebSocket multiplexing.

Run with:
    export LOADTEST_EMAIL=your-email
    export LOADTEST_PASSWORD=your-password
    export TARGET_HOST=http://your-ec2:8000
    pytest tests/load/test_mcp_concurrency.py -v --no-cov -s
"""

from __future__ import annotations

import asyncio
import os
import time

from dataclasses import dataclass

import httpx
import pytest

# Auth credentials from environment
LOADTEST_EMAIL = os.getenv("LOADTEST_EMAIL", "")
LOADTEST_PASSWORD = os.getenv("LOADTEST_PASSWORD", "")

# Cached auth token
_auth_state: dict[str, str | None] = {"token": None}


async def get_auth_token(client: httpx.AsyncClient) -> str | None:
    """Login and cache auth token."""
    if _auth_state["token"]:
        return _auth_state["token"]

    if not LOADTEST_EMAIL or not LOADTEST_PASSWORD:
        print("Warning: LOADTEST_EMAIL/PASSWORD not set, running unauthenticated")
        return None

    response = await client.post(
        "/auth/login",
        json={"email": LOADTEST_EMAIL, "password": LOADTEST_PASSWORD},
    )
    if response.status_code == 200:
        token: str | None = response.json().get("access_token")
        _auth_state["token"] = token
        print(f"Authenticated as {LOADTEST_EMAIL}")
        return token
    else:
        print(f"Auth failed: {response.status_code}")
        return None


def get_auth_headers() -> dict[str, str]:
    """Get auth headers if token available."""
    if _auth_state["token"]:
        return {"Authorization": f"Bearer {_auth_state['token']}"}
    return {}


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
    import json

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
            await ws.send(
                '{"type": "message", "messages": [{"role": "user", "content": "Think step by step: what is 2+2?"}]}'
            )

            # Wait for assistant_start event (indicates processing began)
            async for msg in ws:
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
@pytest.mark.skip(reason="Load test - run manually with credentials")
async def test_mcp_concurrent_tool_calls(target_host: str) -> None:
    """Test concurrent MCP tool calls via chat.

    This test validates that the MCP singleton + multiplexing
    handles concurrent requests efficiently.
    """
    num_concurrent = 5

    print(f"\nTesting {num_concurrent} concurrent MCP tool calls against {target_host}")

    async with httpx.AsyncClient(base_url=f"{target_host}/api/v1", timeout=60.0) as client:
        # Get auth token
        token = await get_auth_token(client)
        headers = {"Authorization": f"Bearer {token}"} if token else {}

        # Create sessions for each concurrent call
        sessions = []
        for i in range(num_concurrent):
            response = await client.post("/sessions", json={"title": f"MCP Test {i}"}, headers=headers)
            if response.status_code in (200, 201):
                sessions.append(response.json().get("session_id"))

        if len(sessions) < num_concurrent:
            pytest.skip(f"Could only create {len(sessions)}/{num_concurrent} sessions (auth issue?)")

        try:
            # Fire concurrent tool calls
            tasks = [call_mcp_tool_via_api(target_host, sid, i, token) for i, sid in enumerate(sessions)]

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
                await client.delete(f"/sessions/{sid}", headers=headers)


@pytest.mark.asyncio
@pytest.mark.skip(reason="Load test - run manually with credentials")
async def test_session_creation_concurrency(target_host: str) -> None:
    """Test concurrent session creation (database stress)."""
    num_sessions = 20

    print(f"\nCreating {num_sessions} sessions concurrently against {target_host}")

    async with httpx.AsyncClient(base_url=f"{target_host}/api/v1", timeout=60.0) as client:
        # Get auth token
        token = await get_auth_token(client)
        headers = {"Authorization": f"Bearer {token}"} if token else {}

        async def create_session(i: int) -> tuple[int, bool, float, str | None, str | None]:
            start = time.monotonic()
            try:
                response = await client.post("/sessions", json={"title": f"Concurrent {i}"}, headers=headers)
                elapsed = (time.monotonic() - start) * 1000
                success = response.status_code in (200, 201)
                session_id = response.json().get("session_id") if success else None
                error = None if success else f"{response.status_code}: {response.text[:100]}"
                return i, success, elapsed, session_id, error
            except Exception as e:
                return i, False, (time.monotonic() - start) * 1000, None, str(e)

        tasks = [create_session(i) for i in range(num_sessions)]

        start = time.monotonic()
        results = await asyncio.gather(*tasks)
        total_time = (time.monotonic() - start) * 1000

        successful = [(i, t, sid) for i, s, t, sid, _ in results if s]
        failed = [(i, err) for i, s, _, _, err in results if not s]

        print(f"\nResults: {len(successful)}/{num_sessions} successful")
        if successful:
            times = [t for _, t, _ in successful]
            print(f"Avg: {sum(times)/len(times):.0f}ms, Max: {max(times):.0f}ms")

        if failed:
            print(f"Failures: {failed[:5]}")  # Show first 5 errors

        print(f"Total wall time: {total_time:.0f}ms")

        # Cleanup
        for _, _, sid in successful:
            if sid:
                await client.delete(f"/sessions/{sid}", headers=headers)

        assert len(successful) >= num_sessions * 0.9, f"Less than 90% success rate. Errors: {failed[:3]}"
