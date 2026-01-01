"""WebSocket concurrent connection load tests.

Run with:
    export LOADTEST_EMAIL=your-email
    export LOADTEST_PASSWORD=your-password
    export TARGET_HOST=http://your-ec2:8000
    pytest tests/load/test_websocket_load.py -v --no-cov -s -p no:skip
"""

from __future__ import annotations

import asyncio
import json
import os
import time

from dataclasses import dataclass

import httpx
import pytest
import websockets

from .conftest import LoadTestConfig

# Auth credentials
LOADTEST_EMAIL = os.getenv("LOADTEST_EMAIL", "")
LOADTEST_PASSWORD = os.getenv("LOADTEST_PASSWORD", "")
_auth_state: dict[str, str | None] = {"token": None}


async def get_auth_token(client: httpx.AsyncClient) -> str | None:
    """Login and cache auth token."""
    if _auth_state["token"]:
        return _auth_state["token"]

    if not LOADTEST_EMAIL or not LOADTEST_PASSWORD:
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
    return None


def get_auth_headers() -> dict[str, str]:
    """Get auth headers if token available."""
    if _auth_state["token"]:
        return {"Authorization": f"Bearer {_auth_state['token']}"}
    return {}


@dataclass
class ConnectionResult:
    """Result of a WebSocket connection attempt."""

    index: int
    success: bool
    connect_time_ms: float
    error: str | None = None


@dataclass
class ChatSimResult:
    """Result of a simulated chat session."""

    index: int
    success: bool
    messages_sent: int
    events_received: int
    duration_ms: float
    error: str | None = None


async def simulate_chat_session(
    config: LoadTestConfig,
    index: int,
    token: str | None,
    num_messages: int = 3,
    hold_time_seconds: float = 5.0,
) -> ChatSimResult:
    """Simulate a realistic chat session.

    This simulates:
    - Session creation
    - WebSocket connection
    - Multiple message sends
    - Receiving streamed responses
    - Holding connection open (simulating user reading)
    """
    start = time.monotonic()
    messages_sent = 0
    events_received = 0

    try:
        async with httpx.AsyncClient(base_url=config.api_base, timeout=60.0) as client:
            headers = {"Authorization": f"Bearer {token}"} if token else {}

            # Create session
            response = await client.post("/sessions", json={"title": f"ChatSim {index}"}, headers=headers)
            if response.status_code not in (200, 201):
                return ChatSimResult(
                    index=index,
                    success=False,
                    messages_sent=0,
                    events_received=0,
                    duration_ms=(time.monotonic() - start) * 1000,
                    error=f"Session creation failed: {response.status_code}",
                )

            session_id = response.json().get("session_id")
            ws_url = f"{config.ws_host}/ws/chat/{session_id}"
            if token:
                ws_url += f"?token={token}"

            try:
                async with websockets.connect(ws_url, open_timeout=10.0) as ws:
                    for msg_num in range(num_messages):
                        # Send a message (simple, won't trigger full LLM response)
                        # Using a very simple prompt that might get a quick response
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "message",
                                    "messages": [{"role": "user", "content": f"Echo test {msg_num}"}],
                                }
                            )
                        )
                        messages_sent += 1

                        # Receive events with timeout (don't wait for full response)
                        try:
                            async with asyncio.timeout(2.0):
                                msg = await ws.recv()
                                events_received += 1
                                _ = json.loads(msg)  # Validate JSON
                        except TimeoutError:
                            pass  # Timeout is fine, we're just measuring connection load

                        # Simulate user reading/thinking
                        await asyncio.sleep(hold_time_seconds / num_messages)

                    # Send interrupt to cancel any pending response
                    await ws.send('{"type": "interrupt"}')

            finally:
                # Cleanup session
                await client.delete(f"/sessions/{session_id}", headers=headers)

        return ChatSimResult(
            index=index,
            success=True,
            messages_sent=messages_sent,
            events_received=events_received,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    except Exception as e:
        return ChatSimResult(
            index=index,
            success=False,
            messages_sent=messages_sent,
            events_received=events_received,
            duration_ms=(time.monotonic() - start) * 1000,
            error=str(e),
        )


@pytest.mark.asyncio
@pytest.mark.skipif(not os.getenv("LOADTEST_EMAIL"), reason="Load test - requires LOADTEST_EMAIL env var")
async def test_concurrent_chat_sessions(load_config: LoadTestConfig) -> None:
    """Simulate multiple concurrent users chatting.

    This more realistically tests:
    - Concurrent WebSocket connections
    - Message handling under load
    - Memory pressure from multiple active contexts
    - MCP server multiplexing (if prompts trigger tools)
    """
    num_users = 10  # Concurrent "chatting" users
    messages_per_user = 2
    hold_time = 3.0  # Seconds to hold connection per user

    print(f"\nSimulating {num_users} concurrent chat sessions")
    print(f"Each sends {messages_per_user} messages over {hold_time}s")

    # Get auth token
    async with httpx.AsyncClient(base_url=load_config.api_base, timeout=30.0) as client:
        token = await get_auth_token(client)

    tasks = [simulate_chat_session(load_config, i, token, messages_per_user, hold_time) for i in range(num_users)]

    start = time.monotonic()
    results = await asyncio.gather(*tasks)
    total_time = (time.monotonic() - start) * 1000

    successful = [r for r in results if r.success]
    failed = [r for r in results if not r.success]

    print(f"\nResults: {len(successful)}/{num_users} successful")
    if successful:
        total_msgs = sum(r.messages_sent for r in successful)
        total_events = sum(r.events_received for r in successful)
        avg_duration = sum(r.duration_ms for r in successful) / len(successful)
        print(f"Total messages sent: {total_msgs}")
        print(f"Total events received: {total_events}")
        print(f"Avg session duration: {avg_duration:.0f}ms")

    if failed:
        print(f"Failures: {[(r.index, r.error) for r in failed[:5]]}")

    print(f"Total wall time: {total_time:.0f}ms")

    assert len(successful) >= num_users * 0.8, f"Less than 80% success. Errors: {[r.error for r in failed[:3]]}"


@pytest.mark.asyncio
@pytest.mark.skipif(not os.getenv("LOADTEST_EMAIL"), reason="Load test - requires LOADTEST_EMAIL env var")
async def test_concurrent_websocket_connections(load_config: LoadTestConfig) -> None:
    """Test concurrent WebSocket connection establishment."""
    num_connections = 10

    print(f"\nTesting {num_connections} concurrent WebSocket connections to {load_config.host}")

    async with httpx.AsyncClient(base_url=load_config.api_base, timeout=30.0) as client:
        token = await get_auth_token(client)
        headers = {"Authorization": f"Bearer {token}"} if token else {}

        async def connect_ws(i: int) -> ConnectionResult:
            start = time.monotonic()
            try:
                response = await client.post("/sessions", json={"title": f"WS Test {i}"}, headers=headers)
                if response.status_code not in (200, 201):
                    return ConnectionResult(
                        i, False, (time.monotonic() - start) * 1000, f"Session failed: {response.status_code}"
                    )

                session_id = response.json().get("session_id")
                ws_url = f"{load_config.ws_host}/ws/chat/{session_id}"
                if token:
                    ws_url += f"?token={token}"

                async with websockets.connect(ws_url, open_timeout=10.0):
                    elapsed = (time.monotonic() - start) * 1000
                    await client.delete(f"/sessions/{session_id}", headers=headers)
                    return ConnectionResult(i, True, elapsed)
            except Exception as e:
                return ConnectionResult(i, False, (time.monotonic() - start) * 1000, str(e))

        tasks = [connect_ws(i) for i in range(num_connections)]
        results = await asyncio.gather(*tasks)

    successful = [r for r in results if r.success]
    failed = [r for r in results if not r.success]

    print(f"\nResults: {len(successful)}/{num_connections} successful")
    if successful:
        avg_time = sum(r.connect_time_ms for r in successful) / len(successful)
        print(f"Avg connect time: {avg_time:.0f}ms")

    if failed:
        print(f"Failures: {[r.error for r in failed[:5]]}")

    assert len(successful) / num_connections >= 0.8, "Success rate below 80%"


@pytest.mark.asyncio
@pytest.mark.skipif(not os.getenv("LOADTEST_EMAIL"), reason="Load test - requires LOADTEST_EMAIL env var")
async def test_websocket_message_throughput(load_config: LoadTestConfig) -> None:
    """Test message sending throughput over WebSocket."""
    num_messages = 50

    async with httpx.AsyncClient(base_url=load_config.api_base, timeout=30.0) as client:
        token = await get_auth_token(client)
        headers = {"Authorization": f"Bearer {token}"} if token else {}

        response = await client.post("/sessions", json={"title": "Throughput Test"}, headers=headers)
        if response.status_code not in (200, 201):
            pytest.skip("Could not create session")

        session_id = response.json().get("session_id")
        ws_url = f"{load_config.ws_host}/ws/chat/{session_id}"
        if token:
            ws_url += f"?token={token}"

        try:
            async with websockets.connect(ws_url, open_timeout=10.0) as ws:
                start = time.monotonic()

                for i in range(num_messages):
                    await ws.send(f'{{"type": "ping", "seq": {i}}}')

                elapsed = time.monotonic() - start
                rate = num_messages / elapsed

                print(f"\nSent {num_messages} messages in {elapsed:.2f}s ({rate:.0f} msg/s)")

        finally:
            await client.delete(f"/sessions/{session_id}", headers=headers)
