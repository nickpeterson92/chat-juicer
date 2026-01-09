"""Locust load testing for Chat Juicer.

Usage:
    # Set credentials first
    export LOADTEST_EMAIL=your-test-user@email.com
    export LOADTEST_PASSWORD=your-password

    # Interactive web UI
    locust -f tests/load/locustfile.py --host=http://your-ec2:8000

    # Headless (CI)
    locust -f tests/load/locustfile.py --host=http://your-ec2:8000 \
        --users 50 --spawn-rate 5 --run-time 60s --headless
"""

from __future__ import annotations

import os
import time

from locust import HttpUser, between, events, task

# Shared credentials from environment
LOADTEST_EMAIL = os.getenv("LOADTEST_EMAIL", "")
LOADTEST_PASSWORD = os.getenv("LOADTEST_PASSWORD", "")

# Shared token state (dict pattern to avoid global statement)
_state: dict[str, str | None] = {"token": None}


class ChatJuicerUser(HttpUser):  # type: ignore[misc, no-untyped-call]
    """Simulates a Chat Juicer user."""

    wait_time = between(1, 3)  # type: ignore[no-untyped-call]

    def on_start(self) -> None:
        """Login and get token."""
        self.token: str | None = None

        # Use shared token if already obtained
        if _state["token"]:
            self.token = _state["token"]
            return

        # Login with provided credentials
        if LOADTEST_EMAIL and LOADTEST_PASSWORD:
            response = self.client.post(
                "/api/v1/auth/login",
                json={"email": LOADTEST_EMAIL, "password": LOADTEST_PASSWORD},
            )
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                _state["token"] = self.token
                print(f"Logged in as {LOADTEST_EMAIL}")
            else:
                print(f"Login failed: {response.status_code} - {response.text}")
        else:
            print("Warning: LOADTEST_EMAIL/LOADTEST_PASSWORD not set, running unauthenticated")

    def _headers(self) -> dict[str, str]:
        """Get auth headers."""
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(3)
    def get_config(self) -> None:
        """Fetch application config (lightweight endpoint)."""
        self.client.get("/api/v1/config", headers=self._headers())

    @task(2)
    def list_sessions(self) -> None:
        """List user sessions."""
        self.client.get("/api/v1/sessions", headers=self._headers())

    @task(2)
    def create_and_delete_session(self) -> None:
        """Create a session, then delete it."""
        response = self.client.post(
            "/api/v1/sessions",
            json={"title": f"Load Test {time.time()}"},
            headers=self._headers(),
        )

        if response.status_code == 200:
            session_id = response.json().get("session_id")
            if session_id:
                # Fetch it
                self.client.get(f"/api/v1/sessions/{session_id}", headers=self._headers())
                # Delete it (cleanup)
                self.client.delete(f"/api/v1/sessions/{session_id}", headers=self._headers())

    @task(1)
    def health_check(self) -> None:
        """Hit health endpoint."""
        self.client.get("/api/v1/health")


class WebSocketUser(HttpUser):  # type: ignore[misc, no-untyped-call]
    """Simulates WebSocket chat user (connection test only)."""

    wait_time = between(5, 10)  # type: ignore[no-untyped-call]

    def on_start(self) -> None:
        """Use shared token."""
        self.token = _state["token"]

    def _headers(self) -> dict[str, str]:
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task
    def websocket_connect_test(self) -> None:
        """Test session creation (WebSocket tested via pytest)."""
        response = self.client.post(
            "/api/v1/sessions",
            json={"title": "WS Load Test"},
            headers=self._headers(),
        )

        if response.status_code == 200:
            session_id = response.json().get("session_id")
            if session_id:
                self.client.delete(f"/api/v1/sessions/{session_id}", headers=self._headers())


@events.request.add_listener
def on_request(
    request_type: str,
    name: str,
    response_time: float,
    response_length: int,
    response: object,
    exception: Exception | None,
    **kwargs: object,
) -> None:
    """Log slow requests."""
    if response_time > 1000:
        print(f"SLOW: {request_type} {name} took {response_time:.0f}ms")
