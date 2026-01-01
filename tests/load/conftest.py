"""Load test configuration and fixtures."""

from __future__ import annotations

import os

from dataclasses import dataclass

import pytest

# Target host configuration - override with TARGET_HOST env var for EC2 testing
DEFAULT_HOST = "http://localhost:8000"


@dataclass
class LoadTestConfig:
    """Configuration for load tests."""

    host: str
    ws_host: str  # WebSocket URL (ws:// or wss://)
    api_base: str  # Full API base URL

    # Test credentials (for authenticated endpoints)
    test_email: str = "loadtest@chatjuicer.dev"
    test_password: str = "loadtest123"

    # Concurrency settings
    default_users: int = 50
    spawn_rate: int = 5
    run_time_seconds: int = 60


def get_config() -> LoadTestConfig:
    """Get load test configuration from environment."""
    host = os.getenv("TARGET_HOST", DEFAULT_HOST)

    # Derive WebSocket URL from HTTP URL
    ws_host = host.replace("https://", "wss://") if host.startswith("https://") else host.replace("http://", "ws://")

    return LoadTestConfig(
        host=host,
        ws_host=ws_host,
        api_base=f"{host}/api/v1",
    )


@pytest.fixture(scope="session")
def load_config() -> LoadTestConfig:
    """Provide load test configuration."""
    return get_config()


@pytest.fixture(scope="session")
def target_host() -> str:
    """Target host URL."""
    return get_config().host


@pytest.fixture(scope="session")
def ws_host() -> str:
    """WebSocket host URL."""
    return get_config().ws_host
