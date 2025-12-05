"""Shared test fixtures for Chat Juicer test suite.

This module provides common fixtures used across all test modules,
including mocks for external dependencies.
"""

from __future__ import annotations

import sqlite3
import tempfile

from collections.abc import Generator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest

# ============================================================================
# Test Isolation: Cache Management
# ============================================================================


@pytest.fixture(autouse=True)
def clear_token_cache() -> Generator[None, None, None]:
    """Clear token count caches between tests to ensure isolation.

    This prevents cache pollution when integration tests exercise real token
    counting, which would otherwise interfere with unit tests that mock the
    token counting behavior.
    """
    # Clear caches BEFORE test runs (so mocks can take effect)
    try:
        from utils import token_utils

        if hasattr(token_utils, "_count_tokens_cached"):
            token_utils._count_tokens_cached.cache_clear()

        if hasattr(token_utils, "_hash_to_count_cache"):
            token_utils._hash_to_count_cache.clear()

        if hasattr(token_utils, "_encoder_cache"):
            token_utils._encoder_cache.clear()

    except (ImportError, AttributeError):
        pass

    yield  # Run test

    # Clear again after test completes (cleanup)
    try:
        from utils import token_utils

        if hasattr(token_utils, "_count_tokens_cached"):
            token_utils._count_tokens_cached.cache_clear()

        if hasattr(token_utils, "_hash_to_count_cache"):
            token_utils._hash_to_count_cache.clear()

        if hasattr(token_utils, "_encoder_cache"):
            token_utils._encoder_cache.clear()

    except (ImportError, AttributeError):
        pass


@pytest.fixture(autouse=True)
def cleanup_test_session_directories() -> Generator[None, None, None]:
    """Clean up test session directories created in data/files/.

    Tests that call SessionManager.create_session() create real directories
    at data/files/{session_id}. This fixture removes any test directories
    created during the test run to prevent pollution of the real data directory.
    """
    import contextlib
    import shutil

    # Collect session IDs before test
    data_files_dir = Path("data/files")
    existing_sessions = set()
    if data_files_dir.exists():
        existing_sessions = {d.name for d in data_files_dir.iterdir() if d.is_dir()}

    yield  # Run test

    # Clean up any new session directories created during test
    if data_files_dir.exists():
        current_sessions = {d.name for d in data_files_dir.iterdir() if d.is_dir()}
        new_sessions = current_sessions - existing_sessions

        for session_id in new_sessions:
            session_dir = data_files_dir / session_id
            with contextlib.suppress(Exception):
                shutil.rmtree(session_dir)  # Best effort cleanup


# ============================================================================
# Mock External Dependencies
# ============================================================================


@pytest.fixture
def mock_openai_client() -> Generator[Mock, None, None]:
    """Mock OpenAI client for testing."""
    client = Mock()
    client.chat.completions.create = AsyncMock()
    yield client


@pytest.fixture
def mock_agent() -> Generator[Mock, None, None]:
    """Mock Agent from agents SDK."""
    agent = Mock()
    agent.name = "Test Agent"
    agent.model = "gpt-4o"
    agent.instructions = "Test instructions"
    yield agent


@pytest.fixture
def mock_runner() -> Generator[Mock, None, None]:
    """Mock Runner from agents SDK."""
    runner = Mock()
    runner.run = AsyncMock()
    runner.run_streamed = MagicMock()
    yield runner


@pytest.fixture
def mock_sqlite_session() -> Generator[Mock, None, None]:
    """Mock SQLiteSession from agents SDK."""
    session = Mock()
    session.session_id = "test_session_123"
    session.db_path = ":memory:"
    session.get_items = AsyncMock(return_value=[])
    session.add_items = AsyncMock()
    session.clear_session = AsyncMock()
    yield session


@pytest.fixture
def mock_mcp_server() -> Generator[Mock, None, None]:
    """Mock MCP server for testing."""
    server = Mock()
    server.name = "test_mcp_server"
    server.__aenter__ = AsyncMock(return_value=server)
    server.__aexit__ = AsyncMock()
    yield server


# ============================================================================
# Database Fixtures
# ============================================================================


@pytest.fixture
def in_memory_db() -> Generator[str, None, None]:
    """Provide in-memory SQLite database for testing."""
    yield ":memory:"


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """Provide temporary SQLite database file for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    yield db_path
    # Cleanup
    if db_path.exists():
        db_path.unlink()
    # Also cleanup WAL files
    wal_path = db_path.with_suffix(".db-wal")
    shm_path = db_path.with_suffix(".db-shm")
    if wal_path.exists():
        wal_path.unlink()
    if shm_path.exists():
        shm_path.unlink()


@pytest.fixture
def sqlite_connection(in_memory_db: str) -> Generator[sqlite3.Connection, None, None]:
    """Provide SQLite connection for testing."""
    conn = sqlite3.connect(in_memory_db)
    yield conn
    conn.close()


# ============================================================================
# File System Fixtures
# ============================================================================


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Provide temporary directory for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_file(temp_dir: Path) -> Generator[Path, None, None]:
    """Provide temporary file for testing."""
    file_path = temp_dir / "test_file.txt"
    file_path.write_text("Test content")
    yield file_path


@pytest.fixture
def session_workspace(temp_dir: Path) -> Generator[Path, None, None]:
    """Provide session workspace directory for testing."""
    session_id = "chat_test123"
    workspace = temp_dir / "data" / "files" / session_id
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "sources").mkdir(exist_ok=True)
    (workspace / "output").mkdir(exist_ok=True)
    yield workspace


# ============================================================================
# IPC Fixtures
# ============================================================================


@pytest.fixture
def mock_ipc_output(monkeypatch: pytest.MonkeyPatch) -> Generator[list[dict[str, Any]], None, None]:
    """Capture IPC output (binary V2 messages) for testing.

    Returns list of decoded message dictionaries.
    """
    import io
    import struct

    import msgpack

    outputs: list[dict[str, Any]] = []
    buffer = io.BytesIO()

    def mock_write(data: bytes) -> int:
        buffer.write(data)
        # Try to parse complete messages from buffer
        buffer.seek(0)
        content = buffer.read()
        buffer.seek(0)
        buffer.truncate()

        offset = 0
        while offset + 7 <= len(content):
            # Parse header
            version = struct.unpack("!H", content[offset : offset + 2])[0]
            flags = content[offset + 2]
            length = struct.unpack("!I", content[offset + 3 : offset + 7])[0]

            if version != 2:
                # Not a valid V2 message, skip
                break

            if offset + 7 + length > len(content):
                # Incomplete message, save remaining for later
                buffer.write(content[offset:])
                break

            # Extract payload
            payload = content[offset + 7 : offset + 7 + length]

            # Decompress if needed
            if flags & 0x01:
                import zlib

                payload = zlib.decompress(payload)

            # Decode MessagePack
            message = msgpack.unpackb(payload, raw=False)
            outputs.append(message)

            offset += 7 + length

        # Save any remaining incomplete data
        if offset < len(content):
            buffer.write(content[offset:])

        return len(data)

    def mock_flush() -> None:
        pass

    monkeypatch.setattr("sys.stdout.buffer.write", mock_write)
    monkeypatch.setattr("sys.stdout.buffer.flush", mock_flush)
    yield outputs


# ============================================================================
# Environment Fixtures
# ============================================================================


@pytest.fixture
def mock_env(monkeypatch: pytest.MonkeyPatch) -> Generator[dict[str, str], None, None]:
    """Mock environment variables for testing."""
    env_vars = {
        "API_PROVIDER": "openai",
        "OPENAI_API_KEY": "test-key-123",
        "OPENAI_MODEL": "gpt-4o",
        "AZURE_OPENAI_API_KEY": "test-azure-key",
        "AZURE_OPENAI_ENDPOINT": "https://test.openai.azure.com",
        "AZURE_OPENAI_DEPLOYMENT": "gpt-4o-deployment",
    }
    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)
    yield env_vars


# ============================================================================
# Session Fixtures
# ============================================================================


@pytest.fixture
def sample_session_metadata() -> dict[str, Any]:
    """Provide sample session metadata for testing."""
    return {
        "session_id": "chat_test123",
        "title": "Test Session",
        "created_at": "2025-01-01T12:00:00",
        "last_used": "2025-01-01T12:00:00",
        "message_count": 5,
        "is_named": True,
        "mcp_config": ["sequential-thinking", "fetch"],
        "model": "gpt-4o",
        "reasoning_effort": "medium",
        "accumulated_tool_tokens": 0,
    }


@pytest.fixture
def sample_conversation_items() -> list[dict[str, Any]]:
    """Provide sample conversation items for testing."""
    return [
        {"role": "user", "content": "Hello, how are you?"},
        {"role": "assistant", "content": "I'm doing well, thank you!"},
        {"role": "user", "content": "Can you help me with Python?"},
        {"role": "assistant", "content": "Of course! What do you need help with?"},
    ]


# ============================================================================
# Token Counting Fixtures
# ============================================================================


@pytest.fixture
def mock_tiktoken(monkeypatch: pytest.MonkeyPatch) -> Generator[Mock, None, None]:
    """Mock tiktoken for token counting tests."""
    mock_encoding = Mock()
    mock_encoding.encode.return_value = [1, 2, 3, 4, 5]  # 5 tokens

    mock_tiktoken_module = Mock()
    mock_tiktoken_module.encoding_for_model.return_value = mock_encoding
    mock_tiktoken_module.get_encoding.return_value = mock_encoding

    monkeypatch.setattr("tiktoken.encoding_for_model", mock_tiktoken_module.encoding_for_model)
    monkeypatch.setattr("tiktoken.get_encoding", mock_tiktoken_module.get_encoding)

    yield mock_tiktoken_module
