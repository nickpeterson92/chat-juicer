"""Tests for session integrity module.

Tests session validation and repair utilities.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from utils.session_integrity import (
    detect_orphaned_sessions,
    get_all_session_ids_from_layer1,
    get_all_session_ids_from_layer2,
    get_session_message_counts,
    repair_orphaned_session_from_layer1,
    validate_and_repair_all_sessions,
)


@pytest.fixture
def temp_integrity_db(tmp_path: Path) -> Path:
    """Create a temporary database with test data for integrity checks."""
    db_path = tmp_path / "integrity_test.db"

    with sqlite3.connect(db_path) as conn:
        # Create Layer 1 tables (OpenAI Agents SDK structure)
        conn.execute("""
            CREATE TABLE agent_sessions (
                session_id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE TABLE agent_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                message_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Add test data
        # Session 1: Has both Layer 1 and Layer 2
        conn.execute("INSERT INTO agent_sessions (session_id) VALUES ('chat_both')")
        conn.execute(
            "INSERT INTO agent_messages (session_id, message_data) VALUES (?, ?)",
            ("chat_both", json.dumps({"role": "user", "content": "Hello"}))
        )
        conn.execute("""
            CREATE TABLE full_history_chat_both (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT,
                content TEXT,
                metadata TEXT
            )
        """)
        conn.execute(
            "INSERT INTO full_history_chat_both (role, content) VALUES ('user', 'Hello')"
        )

        # Session 2: Layer 1 only (orphaned)
        conn.execute("INSERT INTO agent_sessions (session_id) VALUES ('chat_layer1')")
        conn.execute(
            "INSERT INTO agent_messages (session_id, message_data) VALUES (?, ?)",
            ("chat_layer1", json.dumps({"role": "assistant", "content": "Response"}))
        )

        # Session 3: Layer 2 only (orphaned)
        conn.execute("""
            CREATE TABLE full_history_chat_layer2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT,
                content TEXT,
                metadata TEXT
            )
        """)
        conn.execute(
            "INSERT INTO full_history_chat_layer2 (role, content) VALUES ('user', 'Test')"
        )

        conn.commit()

    return db_path


class TestGetAllSessionIdsFromLayer1:
    """Tests for get_all_session_ids_from_layer1 function."""

    def test_get_layer1_sessions(self, temp_integrity_db: Path) -> None:
        """Test retrieving Layer 1 session IDs."""
        session_ids = get_all_session_ids_from_layer1(temp_integrity_db)

        assert "chat_both" in session_ids
        assert "chat_layer1" in session_ids
        assert "chat_layer2" not in session_ids
        assert len(session_ids) == 2

    def test_get_layer1_sessions_empty_db(self, tmp_path: Path) -> None:
        """Test with database that has no sessions."""
        db_path = tmp_path / "empty.db"

        with sqlite3.connect(db_path) as conn:
            conn.execute("CREATE TABLE agent_sessions (session_id TEXT PRIMARY KEY)")

        session_ids = get_all_session_ids_from_layer1(db_path)
        assert len(session_ids) == 0

    def test_get_layer1_sessions_missing_table(self, tmp_path: Path) -> None:
        """Test with database that doesn't have agent_sessions table."""
        db_path = tmp_path / "no_table.db"
        sqlite3.connect(db_path).close()  # Create empty DB

        session_ids = get_all_session_ids_from_layer1(db_path)
        assert len(session_ids) == 0


class TestGetAllSessionIdsFromLayer2:
    """Tests for get_all_session_ids_from_layer2 function."""

    def test_get_layer2_sessions(self, temp_integrity_db: Path) -> None:
        """Test retrieving Layer 2 session IDs."""
        session_ids = get_all_session_ids_from_layer2(temp_integrity_db)

        assert "chat_both" in session_ids
        assert "chat_layer2" in session_ids
        assert "chat_layer1" not in session_ids
        assert len(session_ids) == 2

    def test_get_layer2_sessions_empty_db(self, tmp_path: Path) -> None:
        """Test with database that has no Layer 2 tables."""
        db_path = tmp_path / "empty.db"
        sqlite3.connect(db_path).close()

        session_ids = get_all_session_ids_from_layer2(db_path)
        assert len(session_ids) == 0

    def test_get_layer2_sessions_non_full_history_tables(self, tmp_path: Path) -> None:
        """Test that only full_history_ prefixed tables are returned."""
        db_path = tmp_path / "mixed.db"

        with sqlite3.connect(db_path) as conn:
            conn.execute("CREATE TABLE other_table (id INT)")
            conn.execute("CREATE TABLE full_history_test (id INT)")
            conn.execute("CREATE TABLE not_full_history (id INT)")

        session_ids = get_all_session_ids_from_layer2(db_path)

        assert "test" in session_ids
        assert len(session_ids) == 1


class TestDetectOrphanedSessions:
    """Tests for detect_orphaned_sessions function."""

    def test_detect_orphans_with_mixed_sessions(self, temp_integrity_db: Path) -> None:
        """Test detecting orphaned sessions with mixed state."""
        result = detect_orphaned_sessions(temp_integrity_db)

        assert "chat_both" in result["both"]
        assert "chat_layer1" in result["layer1_only"]
        assert "chat_layer2" in result["layer2_only"]
        assert len(result["both"]) == 1
        assert len(result["layer1_only"]) == 1
        assert len(result["layer2_only"]) == 1

    def test_detect_orphans_all_healthy(self, tmp_path: Path) -> None:
        """Test when all sessions are healthy (both layers)."""
        db_path = tmp_path / "healthy.db"

        with sqlite3.connect(db_path) as conn:
            conn.execute("CREATE TABLE agent_sessions (session_id TEXT)")
            conn.execute("INSERT INTO agent_sessions VALUES ('chat_test')")
            conn.execute("CREATE TABLE full_history_chat_test (id INT)")

        result = detect_orphaned_sessions(db_path)

        assert len(result["both"]) == 1
        assert len(result["layer1_only"]) == 0
        assert len(result["layer2_only"]) == 0

    def test_detect_orphans_no_sessions(self, tmp_path: Path) -> None:
        """Test with no sessions at all."""
        db_path = tmp_path / "empty.db"
        sqlite3.connect(db_path).close()

        result = detect_orphaned_sessions(db_path)

        assert len(result["both"]) == 0
        assert len(result["layer1_only"]) == 0
        assert len(result["layer2_only"]) == 0


class TestGetSessionMessageCounts:
    """Tests for get_session_message_counts function."""

    def test_get_message_counts_both_layers(self, temp_integrity_db: Path) -> None:
        """Test getting message counts for session with both layers."""
        counts = get_session_message_counts("chat_both", temp_integrity_db)

        assert counts["layer1"] == 1
        assert counts["layer2"] == 1

    def test_get_message_counts_layer1_only(self, temp_integrity_db: Path) -> None:
        """Test getting counts for Layer 1 only session."""
        counts = get_session_message_counts("chat_layer1", temp_integrity_db)

        assert counts["layer1"] == 1
        assert counts["layer2"] == 0

    def test_get_message_counts_layer2_only(self, temp_integrity_db: Path) -> None:
        """Test getting counts for Layer 2 only session."""
        counts = get_session_message_counts("chat_layer2", temp_integrity_db)

        assert counts["layer1"] == 0
        assert counts["layer2"] == 1

    def test_get_message_counts_nonexistent_session(self, temp_integrity_db: Path) -> None:
        """Test getting counts for nonexistent session."""
        counts = get_session_message_counts("chat_nonexistent", temp_integrity_db)

        assert counts["layer1"] == 0
        assert counts["layer2"] == 0


class TestRepairOrphanedSessionFromLayer1:
    """Tests for repair_orphaned_session_from_layer1 function."""

    def test_repair_success(self, temp_integrity_db: Path) -> None:
        """Test successful repair of orphaned session."""
        mock_full_history = Mock()
        mock_full_history.save_message.return_value = True

        success = repair_orphaned_session_from_layer1(
            "chat_layer1", mock_full_history, temp_integrity_db
        )

        assert success is True
        mock_full_history.save_message.assert_called_once()
        # Check the call was made with correct session_id and message
        call_args = mock_full_history.save_message.call_args
        assert call_args[0][0] == "chat_layer1"
        assert "role" in call_args[0][1]

    def test_repair_skips_non_role_messages(self, tmp_path: Path) -> None:
        """Test that repair skips SDK internal messages."""
        db_path = tmp_path / "repair_test.db"

        with sqlite3.connect(db_path) as conn:
            conn.execute("""
                CREATE TABLE agent_sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE agent_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    message_data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Add messages with and without roles
            conn.execute(
                "INSERT INTO agent_messages (session_id, message_data) VALUES (?, ?)",
                ("chat_test", json.dumps({"role": "user", "content": "Good"}))
            )
            conn.execute(
                "INSERT INTO agent_messages (session_id, message_data) VALUES (?, ?)",
                ("chat_test", json.dumps({"type": "internal", "data": "Skip this"}))
            )
            conn.commit()

        mock_full_history = Mock()
        mock_full_history.save_message.return_value = True

        success = repair_orphaned_session_from_layer1("chat_test", mock_full_history, db_path)

        assert success is True
        # Should only save 1 message (the one with role)
        assert mock_full_history.save_message.call_count == 1

    def test_repair_handles_invalid_json(self, tmp_path: Path) -> None:
        """Test repair handles invalid JSON gracefully."""
        db_path = tmp_path / "invalid_json.db"

        with sqlite3.connect(db_path) as conn:
            conn.execute("""
                CREATE TABLE agent_sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE agent_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    message_data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute(
                "INSERT INTO agent_messages (session_id, message_data) VALUES ('chat_bad', 'not valid json')"
            )
            conn.commit()

        mock_full_history = Mock()

        success = repair_orphaned_session_from_layer1("chat_bad", mock_full_history, db_path)

        # Should still return True but skip the invalid message
        assert success is True
        assert mock_full_history.save_message.call_count == 0


class TestValidateAndRepairAllSessions:
    """Tests for validate_and_repair_all_sessions function."""

    def test_validate_without_repair(self, temp_integrity_db: Path) -> None:
        """Test validation without auto-repair."""
        mock_full_history = Mock()

        results = validate_and_repair_all_sessions(
            mock_full_history, temp_integrity_db, auto_repair=False
        )

        assert results["healthy_count"] == 1
        assert results["orphaned_count"] == 2
        assert results["repaired_count"] == 0
        assert results["repair_failed_count"] == 0
        # Repair should not have been called
        mock_full_history.save_message.assert_not_called()

    def test_validate_with_auto_repair_success(self, temp_integrity_db: Path) -> None:
        """Test validation with successful auto-repair."""
        mock_full_history = Mock()
        mock_full_history.save_message.return_value = True

        results = validate_and_repair_all_sessions(
            mock_full_history, temp_integrity_db, auto_repair=True
        )

        assert results["healthy_count"] == 1
        assert results["orphaned_count"] == 2
        assert results["repaired_count"] == 1  # Only Layer 1 orphans are repaired
        assert results["repair_failed_count"] == 0

    def test_validate_with_auto_repair_failure(self, temp_integrity_db: Path) -> None:
        """Test validation when repair fails."""
        mock_full_history = Mock()

        # Make repair fail by causing an exception
        def failing_save(*args: Any) -> bool:
            raise RuntimeError("Database error")

        mock_full_history.save_message.side_effect = failing_save

        # Patch the repair function to catch the exception
        with patch("utils.session_integrity.repair_orphaned_session_from_layer1") as mock_repair:
            mock_repair.return_value = False

            results = validate_and_repair_all_sessions(
                mock_full_history, temp_integrity_db, auto_repair=True
            )

        assert results["repaired_count"] == 0
        assert results["repair_failed_count"] == 1

    def test_validate_no_orphans(self, tmp_path: Path) -> None:
        """Test validation when there are no orphaned sessions."""
        db_path = tmp_path / "healthy.db"

        with sqlite3.connect(db_path) as conn:
            conn.execute("CREATE TABLE agent_sessions (session_id TEXT)")
            conn.execute("INSERT INTO agent_sessions VALUES ('chat_test')")
            conn.execute("CREATE TABLE full_history_chat_test (id INT)")

        mock_full_history = Mock()

        results = validate_and_repair_all_sessions(
            mock_full_history, db_path, auto_repair=True
        )

        assert results["healthy_count"] == 1
        assert results["orphaned_count"] == 0
        assert results["repaired_count"] == 0
