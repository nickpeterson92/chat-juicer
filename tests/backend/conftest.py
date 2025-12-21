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
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

# ============================================================================
# EARLY INITIALIZATION: Runs before test collection
# ============================================================================


def pytest_configure(config: pytest.Config) -> None:
    """Configure settings mock before any test modules are imported.

    This hook runs before test collection, which is when module-level
    imports happen. We patch get_settings here to prevent ValidationError
    on CI where .env is not available.
    """

    mock_settings = MagicMock()
    mock_settings.database_url = "postgresql://test:test@localhost/test"
    mock_settings.api_provider = "openai"
    mock_settings.openai_api_key = "test-openai-key"
    mock_settings.azure_openai_api_key = "test-azure-key"
    mock_settings.azure_openai_endpoint = "https://test.openai.azure.com"
    mock_settings.jwt_secret = "test-jwt-secret"
    mock_settings.jwt_algorithm = "HS256"
    mock_settings.jwt_access_token_expire_minutes = 30
    mock_settings.jwt_refresh_token_expire_days = 7
    mock_settings.debug = False
    mock_settings.app_env = "testing"
    mock_settings.log_level = "INFO"
    mock_settings.http_request_logging = False
    mock_settings.tavily_api_key = None

    # Store for later use - cast to Any to avoid mypy attr-defined errors
    cfg: Any = config
    cfg._mock_settings = mock_settings

    # Patch get_settings at the module level BEFORE any imports
    patcher = patch("core.constants.get_settings", return_value=mock_settings)
    patcher.start()
    cfg._settings_patcher = patcher


def pytest_unconfigure(config: pytest.Config) -> None:
    """Clean up settings mock after all tests complete."""
    patcher = getattr(config, "_settings_patcher", None)
    if patcher:
        patcher.stop()


# ============================================================================
# Test Isolation: Settings Management (MUST BE FIRST)
# ============================================================================


@pytest.fixture(autouse=True, scope="function")
def reset_settings_singleton() -> Generator[None, None, None]:
    """Reset settings singleton before each test to prevent state pollution.

    This ensures each test starts with a fresh settings state and allows
    tests to mock get_settings() without interference from cached values.
    """
    # Reset the singleton before test
    try:
        from core import constants

        if hasattr(constants, "_settings_manager"):
            constants._settings_manager._instance = None
    except ImportError:
        pass

    yield

    # Reset again after test for cleanup
    try:
        from core import constants

        if hasattr(constants, "_settings_manager"):
            constants._settings_manager._instance = None
    except ImportError:
        pass


@pytest.fixture(autouse=True)
def mock_settings_for_ci(monkeypatch: pytest.MonkeyPatch) -> Generator[MagicMock, None, None]:
    """Provide mock settings that work without .env file (for CI).

    This fixture patches get_settings() to return a mock with valid defaults,
    preventing ValidationError when Azure credentials aren't available.
    """
    mock_settings = MagicMock()
    mock_settings.database_url = "postgresql://test:test@localhost/test"
    mock_settings.api_provider = "openai"
    mock_settings.openai_api_key = "test-openai-key"
    mock_settings.azure_openai_api_key = "test-azure-key"
    mock_settings.azure_openai_endpoint = "https://test.openai.azure.com"
    mock_settings.jwt_secret = "test-jwt-secret"
    mock_settings.jwt_algorithm = "HS256"
    mock_settings.jwt_access_token_expire_minutes = 30
    mock_settings.jwt_refresh_token_expire_days = 7
    mock_settings.debug = False
    mock_settings.app_env = "testing"
    mock_settings.log_level = "INFO"
    mock_settings.http_request_logging = False
    mock_settings.tavily_api_key = None

    # Patch at the core.constants level so all imports get the mock
    monkeypatch.setattr("core.constants.get_settings", lambda: mock_settings)

    yield mock_settings


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


@pytest.fixture
def mock_db_pool() -> Generator[MagicMock, None, None]:
    """Mock asyncpg.Pool for database testing."""
    pool = MagicMock()
    # Mock acquire context manager
    conn = AsyncMock()

    # transaction() is synchronous but returns an async context manager
    tx_cm = AsyncMock()
    conn.transaction = MagicMock(return_value=tx_cm)

    pool.acquire.return_value.__aenter__.return_value = conn
    yield pool


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
def isolated_filesystem(temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """Isolate file operations to temp directory by patching PROJECT_ROOT.

    file_utils uses PROJECT_ROOT and DATA_FILES_PATH for path resolution.
    """
    import utils.file_utils

    # Create necessary directory structure
    (temp_dir / "data" / "files").mkdir(parents=True, exist_ok=True)
    (temp_dir / "output").mkdir(parents=True, exist_ok=True)

    # Patch the module-level constants
    monkeypatch.setattr(utils.file_utils, "PROJECT_ROOT", temp_dir)
    monkeypatch.setattr(utils.file_utils, "DATA_FILES_PATH", temp_dir / "data" / "files")

    yield temp_dir


@pytest.fixture
def temp_file(temp_dir: Path) -> Generator[Path, None, None]:
    """Provide temporary file for testing."""
    file_path = temp_dir / "test_file.txt"
    file_path.write_text("Test content")
    yield file_path


@pytest.fixture
def session_workspace(temp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """Provide session workspace directory for testing."""
    import utils.file_utils

    session_id = "chat_test123"
    workspace = temp_dir / "data" / "files" / session_id
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "sources").mkdir(exist_ok=True)
    (workspace / "output").mkdir(exist_ok=True)

    # Patch PROJECT_ROOT so file_utils resolves paths correctly
    monkeypatch.setattr(utils.file_utils, "PROJECT_ROOT", temp_dir)
    monkeypatch.setattr(utils.file_utils, "DATA_FILES_PATH", temp_dir / "data" / "files")

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
        # Note: AZURE_OPENAI_DEPLOYMENT is not used - model is selected per-session
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
