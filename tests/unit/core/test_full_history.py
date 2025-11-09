"""Tests for full history storage module.

Tests FullHistoryStore for Layer 2 persistence (complete conversation history).
"""

from __future__ import annotations

from pathlib import Path

from core.full_history import FullHistoryStore


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
        result = store.save_message("chat_test", message)
        assert result is True

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
            result = store.save_message("chat_test", msg)
            assert result is True

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

    def test_table_name_generation(self, temp_db_path: Path) -> None:
        """Test that table names are generated correctly."""
        store = FullHistoryStore(db_path=temp_db_path)
        table_name = store._get_table_name("chat_test123")
        assert table_name.startswith(store.TABLE_PREFIX)
        assert "test123" in table_name

    def test_sql_injection_prevention(self, temp_db_path: Path) -> None:
        """Test that SQL injection attempts are prevented."""
        store = FullHistoryStore(db_path=temp_db_path)
        # Should raise ValueError for invalid session_id
        try:
            store._get_table_name("chat_'; DROP TABLE users; --")
            raise AssertionError("Should have raised ValueError")
        except ValueError:
            pass  # Expected

    def test_save_message_invalid_data(self, temp_db_path: Path) -> None:
        """Test saving message with invalid data."""
        store = FullHistoryStore(db_path=temp_db_path)
        # Message without role
        result = store.save_message("chat_test", {"content": "Hello"})
        assert result is False

        # Message without content
        result = store.save_message("chat_test", {"role": "user"})
        assert result is False

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
        result = store.save_message("chat_test", message)
        assert result is True

        messages = store.get_messages("chat_test")
        assert len(messages) >= 1
        # Content should be JSON-serialized string when retrieved
        # The implementation converts complex content to JSON

    def test_save_message_with_list_content(self, temp_db_path: Path) -> None:
        """Test saving message with list content (non-string)."""
        store = FullHistoryStore(db_path=temp_db_path)
        message = {"role": "user", "content": ["item1", "item2", "item3"]}
        result = store.save_message("chat_test", message)
        assert result is True

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
        result = store.save_message("chat_test", message)
        assert result is True

    def test_save_message_database_error(self, temp_db_path: Path) -> None:
        """Test error handling when database write fails."""

        store = FullHistoryStore(db_path=temp_db_path)

        # Cause a database error by using an invalid path
        store.db_path = Path("/invalid/nonexistent/path/db.sqlite")
        result = store.save_message("chat_test", {"role": "user", "content": "Test"})

        # Should return False on error (best-effort Layer 2)
        assert result is False

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
        result1 = store.save_message("chat_test", {"role": "user", "content": "Valid"})
        assert result1 is True

        # Try to save an invalid message (should fail gracefully)
        result2 = store.save_message("chat_test", {"role": "user"})  # Missing content
        assert result2 is False

        # Store should still work after error
        result3 = store.save_message("chat_test", {"role": "user", "content": "Still works"})
        assert result3 is True
