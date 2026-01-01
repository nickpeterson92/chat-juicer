"""Locust load testing for Chat Juicer.

Usage:
    # Interactive web UI
    locust -f tests/load/locustfile.py --host=http://localhost:8000

    # Against EC2
    locust -f tests/load/locustfile.py --host=http://your-ec2:8000

    # Headless (CI)
    locust -f tests/load/locustfile.py --host=http://your-ec2:8000 \
        --users 50 --spawn-rate 5 --run-time 60s --headless
"""

from __future__ import annotations

import random
import string
import time

from locust import HttpUser, between, events, task


class ChatJuicerUser(HttpUser):  # type: ignore[misc]
    """Simulates a Chat Juicer user."""

    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks

    def on_start(self) -> None:
        """Login and create a session on user start."""
        self.token: str | None = None
        self.session_id: str | None = None
        self._login()

    def _login(self) -> None:
        """Authenticate and get JWT token."""
        # Try to login with test credentials
        response = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": f"loadtest_{self._random_suffix()}@chatjuicer.dev",
                "password": "loadtest123",
            },
            catch_response=True,
        )

        if response.status_code == 401:
            # User doesn't exist, try to register
            response = self.client.post(
                "/api/v1/auth/register",
                json={
                    "email": f"loadtest_{self._random_suffix()}@chatjuicer.dev",
                    "password": "loadtest123",
                },
                catch_response=True,
            )

        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token")
            response.success()
        else:
            # Fall back to unauthenticated mode for localhost
            response.success()

    def _random_suffix(self) -> str:
        """Generate random suffix for unique user emails."""
        return "".join(random.choices(string.ascii_lowercase + string.digits, k=8))

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
        # Create
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


class WebSocketUser(HttpUser):  # type: ignore[misc]
    """Simulates WebSocket chat user (connection test only)."""

    wait_time = between(5, 10)  # WebSocket connections are long-lived

    def on_start(self) -> None:
        """Setup for WebSocket testing."""
        self.token: str | None = None
        self.session_id: str | None = None

    @task
    def websocket_connect_test(self) -> None:
        """Test WebSocket connection establishment.

        Note: Locust's built-in WebSocket support is limited.
        For full WebSocket load testing, use the pytest tests.
        """
        # Create session first via REST
        response = self.client.post(
            "/api/v1/sessions",
            json={"title": "WS Load Test"},
            catch_response=True,
        )

        if response.status_code == 200:
            session_id = response.json().get("session_id")
            # In a real test, we'd establish WebSocket here
            # For now, just verify the session was created
            response.success()

            # Cleanup
            if session_id:
                self.client.delete(f"/api/v1/sessions/{session_id}")
        else:
            response.failure(f"Failed to create session: {response.status_code}")


# Event hooks for custom metrics
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
    if response_time > 1000:  # > 1 second
        print(f"SLOW: {request_type} {name} took {response_time:.0f}ms")
