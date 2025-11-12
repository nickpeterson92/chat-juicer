"""Tests for full history storage module.

Tests FullHistoryStore for Layer 2 persistence (complete conversation history).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from core.full_history import (
    FullHistoryError,
    FullHistoryStore,
)


class TestFullHistoryStore:
    """Tests for FullHistoryStore."""

    def test_initialization(self, temp_db_path: Path) -> None:
        """Test FullHistoryStore initialization."""
        store = FullHistoryStore(db_path=temp_db_path)
        assert store.db_path == temp_db_path

    def test_save_message(self, temp_db_path: Path) -> None:
        """Test saving a message."""
        store = FullHistoryStore(db_path=temp_db_path)
        message = {"role": "user", "content": "Hello"}
        # Should not raise exception
        store.save_message("chat_test", message)

    def test_get_messages(self, temp_db_path: Path) -> None:
        """Test retrieving messages."""
        store = FullHistoryStore(db_path=temp_db_path)
        message = {"role": "user", "content": "Hello"}
        store.save_message("chat_test", message)

        messages = store.get_messages("chat_test")
        assert len(messages) > 0

    def test_save_multiple_messages(self, temp_db_path: Path) -> None:
        """Test saving multiple messages."""
        store = FullHistoryStore(db_path=temp_db_path)
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"},
        ]
        for msg in messages:
            # Should not raise exception
            store.save_message("chat_test", msg)

        retrieved = store.get_messages("chat_test")
        assert len(retrieved) == 3

    def test_get_messages_with_limit(self, temp_db_path: Path) -> None:
        """Test retrieving messages with limit."""
        store = FullHistoryStore(db_path=temp_db_path)
        for i in range(10):
            store.save_message("chat_test", {"role": "user", "content": f"Message {i}"})

        messages = store.get_messages("chat_test", limit=5)
        assert len(messages) == 5

    def test_get_messages_with_offset(self, temp_db_path: Path) -> None:
        """Test retrieving messages with offset."""
        store = FullHistoryStore(db_path=temp_db_path)
        for i in range(10):
            store.save_message("chat_test", {"role": "user", "content": f"Message {i}"})

        # Note: offset requires limit to be specified (see implementation)
        # Get 5 messages starting from offset 5
        messages = store.get_messages("chat_test", limit=5, offset=5)
        assert len(messages) == 5

    def test_get_messages_pagination(self, temp_db_path: Path) -> None:
        """Test paginating through messages."""
        store = FullHistoryStore(db_path=temp_db_path)
        for i in range(20):
            store.save_message("chat_test", {"role": "user", "content": f"Message {i}"})

        page1 = store.get_messages("chat_test", limit=10, offset=0)
        page2 = store.get_messages("chat_test", limit=10, offset=10)

        assert len(page1) == 10
        assert len(page2) == 10
        assert page1[0] != page2[0]

    def test_clear_session(self, temp_db_path: Path) -> None:
        """Test clearing all messages for a session."""
        store = FullHistoryStore(db_path=temp_db_path)
        store.save_message("chat_test", {"role": "user", "content": "Hello"})
        store.save_message("chat_test", {"role": "assistant", "content": "Hi"})

        result = store.clear_session("chat_test")
        assert result is True

        messages = store.get_messages("chat_test")
        assert len(messages) == 0

    def test_shared_table_usage(self, temp_db_path: Path) -> None:
        """Test that all sessions use the shared table."""
        store = FullHistoryStore(db_path=temp_db_path)
        # All sessions should use the same TABLE_NAME
        assert store.TABLE_NAME == "full_history"
        # No more per-session table name generation
        assert not hasattr(store, "_get_table_name")

    def test_sql_injection_prevention(self, temp_db_path: Path) -> None:
        """Test that SQL injection attempts are prevented."""
        store = FullHistoryStore(db_path=temp_db_path)
        # Invalid session_id should raise ValueError during save/get operations
        invalid_session_id = "chat_'; DROP TABLE users; --"

        # Test that operations with invalid session_id raise ValueError
        try:
            store.save_message(invalid_session_id, {"role": "user", "content": "test"})
            raise AssertionError("Should have raised ValueError")
        except (ValueError, FullHistoryError):
            pass  # Expected - validation catches this

    def test_save_message_invalid_data(self, temp_db_path: Path) -> None:
        """Test saving message with invalid data."""
        store = FullHistoryStore(db_path=temp_db_path)
        # Message without role - should skip silently (not an error)
        store.save_message("chat_test", {"content": "Hello"})

        # Message without content - should skip silently (not an error)
        store.save_message("chat_test", {"role": "user"})

    def test_multiple_sessions_isolation(self, temp_db_path: Path) -> None:
        """Test that sessions are isolated from each other."""
        store = FullHistoryStore(db_path=temp_db_path)
        store.save_message("chat_session1", {"role": "user", "content": "Session 1"})
        store.save_message("chat_session2", {"role": "user", "content": "Session 2"})

        messages1 = store.get_messages("chat_session1")
        messages2 = store.get_messages("chat_session2")

        assert len(messages1) == 1
        assert len(messages2) == 1
        assert messages1[0]["content"] == "Session 1"
        assert messages2[0]["content"] == "Session 2"

    def test_save_message_with_dict_content(self, temp_db_path: Path) -> None:
        """Test saving message with dict content (non-string)."""
        store = FullHistoryStore(db_path=temp_db_path)
        message = {"role": "user", "content": {"type": "text", "value": "Hello"}}
        # Should not raise exception
        store.save_message("chat_test", message)

        messages = store.get_messages("chat_test")
        assert len(messages) >= 1
        # Content should be JSON-serialized string when retrieved
        # The implementation converts complex content to JSON

    def test_save_message_with_list_content(self, temp_db_path: Path) -> None:
        """Test saving message with list content (non-string)."""
        store = FullHistoryStore(db_path=temp_db_path)
        message = {"role": "user", "content": ["item1", "item2", "item3"]}
        # Should not raise exception
        store.save_message("chat_test", message)

        messages = store.get_messages("chat_test")
        assert len(messages) == 1

    def test_save_message_with_metadata(self, temp_db_path: Path) -> None:
        """Test saving message with additional metadata fields."""
        store = FullHistoryStore(db_path=temp_db_path)
        message = {
            "role": "user",
            "content": "Hello",
            "timestamp": "2024-01-01T00:00:00Z",
            "model": "gpt-4",
        }
        # Should not raise exception
        store.save_message("chat_test", message)

    def test_save_message_database_error(self, temp_db_path: Path) -> None:
        """Test error handling when database write fails."""

        store = FullHistoryStore(db_path=temp_db_path)

        # Cause a database error by using an invalid path
        store.db_path = Path("/invalid/nonexistent/path/db.sqlite")

        # Should raise FullHistoryError
        with pytest.raises(FullHistoryError):
            store.save_message("chat_test", {"role": "user", "content": "Test"})

    def test_get_messages_nonexistent_session(self, temp_db_path: Path) -> None:
        """Test getting messages for a session that doesn't exist."""
        store = FullHistoryStore(db_path=temp_db_path)
        messages = store.get_messages("nonexistent_session")

        # Should return empty list, not raise error
        assert messages == []

    def test_clear_session_nonexistent(self, temp_db_path: Path) -> None:
        """Test clearing a session that doesn't exist."""
        store = FullHistoryStore(db_path=temp_db_path)
        result = store.clear_session("nonexistent_session")

        # Should still return True (idempotent)
        assert result is True

    def test_get_message_count(self, temp_db_path: Path) -> None:
        """Test getting message count for a session."""
        store = FullHistoryStore(db_path=temp_db_path)
        for i in range(5):
            store.save_message("chat_test", {"role": "user", "content": f"Message {i}"})

        count = store.get_message_count("chat_test")
        assert count == 5

    def test_get_message_count_nonexistent_session(self, temp_db_path: Path) -> None:
        """Test getting message count for nonexistent session."""
        store = FullHistoryStore(db_path=temp_db_path)
        count = store.get_message_count("nonexistent_session")
        assert count == 0

    def test_save_message_error_recovery(self, temp_db_path: Path) -> None:
        """Test that store recovers from errors and continues working."""
        store = FullHistoryStore(db_path=temp_db_path)

        # Save a valid message first
        store.save_message("chat_test", {"role": "user", "content": "Valid"})

        # Try to save an invalid message (should skip silently - not an error)
        store.save_message("chat_test", {"role": "user"})  # Missing content

        # Store should still work after skipped message
        store.save_message("chat_test", {"role": "user", "content": "Still works"})

    def test_health_check_healthy(self, temp_db_path: Path) -> None:
        """Test health check for healthy session."""
        store = FullHistoryStore(db_path=temp_db_path)
        store.save_message("chat_test", {"role": "user", "content": "Hello"})

        is_healthy, error = store.health_check("chat_test")
        assert is_healthy is True
        assert error is None

    def test_health_check_nonexistent_session(self, temp_db_path: Path) -> None:
        """Test health check for nonexistent session."""
        store = FullHistoryStore(db_path=temp_db_path)

        is_healthy, error = store.health_check("nonexistent_session")
        # No table is fine - will be created on first message
        assert is_healthy is True
        assert error is None

    def test_health_check_invalid_path(self, temp_db_path: Path) -> None:
        """Test health check with invalid database path."""
        store = FullHistoryStore(db_path=temp_db_path)
        # Change path after initialization to avoid mkdir error
        store.db_path = Path("/invalid/nonexistent/path/db.sqlite")

        is_healthy, error = store.health_check("chat_test")
        assert is_healthy is False
        assert error is not None
