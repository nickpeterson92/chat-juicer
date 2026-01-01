"""WebSocket concurrent connection load tests.

Run with:
    TARGET_HOST=http://your-ec2:8000 pytest tests/load/test_websocket_load.py -v --no-cov
"""

from __future__ import annotations

import asyncio
import time

from dataclasses import dataclass

import httpx
import pytest
import websockets

from .conftest import LoadTestConfig


@dataclass
class ConnectionResult:
    """Result of a WebSocket connection attempt."""

    index: int
    success: bool
    connect_time_ms: float
    error: str | None = None


async def create_session_and_connect(
    config: LoadTestConfig,
    index: int,
    token: str | None = None,
) -> ConnectionResult:
    """Create a session and establish WebSocket connection."""
    start = time.monotonic()

    try:
        async with httpx.AsyncClient(base_url=config.api_base, timeout=30.0) as client:
            # Create session via REST
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = await client.post("/sessions", json={"title": f"WS Test {index}"}, headers=headers)

            if response.status_code != 200:
                return ConnectionResult(
                    index=index,
                    success=False,
                    connect_time_ms=(time.monotonic() - start) * 1000,
                    error=f"Session creation failed: {response.status_code}",
                )

            session_id = response.json().get("session_id")

            # Connect WebSocket
            ws_url = f"{config.ws_host}/ws/chat/{session_id}"
            if token:
                ws_url += f"?token={token}"

            async with websockets.connect(ws_url, open_timeout=10.0) as ws:
                # Send ping, wait for response
                await ws.send('{"type": "ping"}')
                # Connection successful
                elapsed = (time.monotonic() - start) * 1000

                # Cleanup: delete session
                await client.delete(f"/sessions/{session_id}", headers=headers)

                return ConnectionResult(index=index, success=True, connect_time_ms=elapsed)

    except Exception as e:
        return ConnectionResult(
            index=index,
            success=False,
            connect_time_ms=(time.monotonic() - start) * 1000,
            error=str(e),
        )


@pytest.mark.asyncio
async def test_concurrent_websocket_connections(load_config: LoadTestConfig) -> None:
    """Test concurrent WebSocket connection establishment.

    This test creates multiple sessions and WebSocket connections concurrently
    to verify the server handles connection bursts gracefully.
    """
    num_connections = 10  # Start small, increase for stress testing

    print(f"\nTesting {num_connections} concurrent WebSocket connections to {load_config.host}")

    tasks = [create_session_and_connect(load_config, i) for i in range(num_connections)]
    results = await asyncio.gather(*tasks)

    # Analyze results
    successful = [r for r in results if r.success]
    failed = [r for r in results if not r.success]

    print(f"\nResults: {len(successful)}/{num_connections} successful")

    if successful:
        avg_time = sum(r.connect_time_ms for r in successful) / len(successful)
        max_time = max(r.connect_time_ms for r in successful)
        print(f"Avg connect time: {avg_time:.0f}ms, Max: {max_time:.0f}ms")

    if failed:
        print(f"Failures: {[r.error for r in failed[:5]]}")  # Show first 5

    # Assert reasonable success rate
    success_rate = len(successful) / num_connections
    assert success_rate >= 0.8, f"Success rate {success_rate:.0%} below 80% threshold"


@pytest.mark.asyncio
async def test_websocket_connection_limit(load_config: LoadTestConfig) -> None:
    """Test behavior when approaching WebSocket connection limits.

    This verifies the server properly rejects connections when limits are reached.
    """
    # Create more connections than the per-session limit (default: 3)
    num_connections = 5

    print(f"\nTesting connection limit with {num_connections} connections to same session")

    async with httpx.AsyncClient(base_url=load_config.api_base, timeout=30.0) as client:
        # Create single session
        response = await client.post("/sessions", json={"title": "Limit Test"})
        if response.status_code != 200:
            pytest.skip("Could not create session (auth required?)")

        session_id = response.json().get("session_id")
        ws_url = f"{load_config.ws_host}/ws/chat/{session_id}"

        connections = []
        rejected = 0

        for _ in range(num_connections):
            try:
                ws = await websockets.connect(ws_url, open_timeout=5.0)
                connections.append(ws)
            except Exception:  # noqa: PERF203
                rejected += 1

        print(f"Accepted: {len(connections)}, Rejected: {rejected}")

        # Cleanup
        for ws in connections:
            await ws.close()
        await client.delete(f"/sessions/{session_id}")

    # Should have rejected some connections (per-session limit is 3)
    assert rejected > 0 or len(connections) <= 3, "Expected some connections to be rejected"


@pytest.mark.asyncio
async def test_websocket_message_throughput(load_config: LoadTestConfig) -> None:
    """Test message sending throughput over WebSocket."""
    num_messages = 20

    async with httpx.AsyncClient(base_url=load_config.api_base, timeout=30.0) as client:
        response = await client.post("/sessions", json={"title": "Throughput Test"})
        if response.status_code != 200:
            pytest.skip("Could not create session")

        session_id = response.json().get("session_id")
        ws_url = f"{load_config.ws_host}/ws/chat/{session_id}"

        try:
            async with websockets.connect(ws_url, open_timeout=10.0) as ws:
                start = time.monotonic()

                for i in range(num_messages):
                    await ws.send(f'{{"type": "ping", "seq": {i}}}')
                    # Don't wait for response to test send throughput

                elapsed = time.monotonic() - start
                rate = num_messages / elapsed

                print(f"\nSent {num_messages} messages in {elapsed:.2f}s ({rate:.0f} msg/s)")

        finally:
            await client.delete(f"/sessions/{session_id}")
