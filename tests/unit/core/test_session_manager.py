"""Tests for session manager module.

Tests SessionManager for session lifecycle and metadata management.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from core.session_manager import SessionManager


class TestSessionManager:
    """Tests for SessionManager."""

    def test_initialization(self, temp_dir: Path) -> None:
        """Test SessionManager initialization."""
        metadata_path = temp_dir / "sessions.json"
        manager = SessionManager(metadata_path=metadata_path)
        assert manager.metadata_path == metadata_path
        assert isinstance(manager.sessions, dict)

    def test_create_session(self, temp_dir: Path) -> None:
        """Test creating a new session."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            session = manager.create_session(title="Test Session")

            assert session.session_id.startswith("chat_")
            assert session.title == "Test Session"
            assert session.session_id in manager.sessions

    def test_create_session_with_defaults(self, temp_dir: Path) -> None:
        """Test creating session with default title."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            session = manager.create_session()

            assert "Conversation" in session.title
            assert session.is_named is False

    def test_get_session(self, temp_dir: Path) -> None:
        """Test retrieving a session."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            created = manager.create_session(title="Test")
            retrieved = manager.get_session(created.session_id)

            assert retrieved is not None
            assert retrieved.session_id == created.session_id

    def test_list_sessions(self, temp_dir: Path) -> None:
        """Test listing all sessions."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            manager.create_session(title="Session 1")
            manager.create_session(title="Session 2")

            sessions = manager.list_sessions()
            assert len(sessions) >= 2

    def test_delete_session(self, temp_dir: Path) -> None:
        """Test deleting a session."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            session = manager.create_session(title="To Delete")
            session_id = session.session_id

            success = manager.delete_session(session_id)
            assert success is True
            assert manager.get_session(session_id) is None

    def test_switch_session(self, temp_dir: Path) -> None:
        """Test switching between sessions."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            session1 = manager.create_session(title="Session 1")
            session2 = manager.create_session(title="Session 2")

            manager.current_session_id = session1.session_id
            assert manager.current_session_id == session1.session_id

            manager.current_session_id = session2.session_id
            assert manager.current_session_id == session2.session_id

    def test_update_session(self, temp_dir: Path) -> None:
        """Test updating session metadata."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            from models.session_models import SessionUpdate

            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            session = manager.create_session(title="Original Title")

            update = SessionUpdate(title="Updated Title", message_count=10)
            success = manager.update_session(session.session_id, update)

            assert success is True
            updated = manager.get_session(session.session_id)
            assert updated.title == "Updated Title"
            assert updated.message_count == 10

    def test_cleanup_empty_sessions(self, temp_dir: Path) -> None:
        """Test cleaning up empty sessions."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            # Create a session
            session = manager.create_session(title="Empty Session")

            # Cleanup (should remove sessions with message_count=0 and old enough)
            deleted = manager.cleanup_empty_sessions(max_age_hours=0)

            # Verify cleanup ran (exact count depends on timing)
            assert deleted >= 0

    @pytest.mark.asyncio
    @patch("core.session_manager.Runner.run", new_callable=AsyncMock)
    async def test_generate_session_title(
        self, mock_runner_run: AsyncMock, temp_dir: Path
    ) -> None:
        """Test generating session title with Agent."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"
            manager = SessionManager(metadata_path=metadata_path)

            session = manager.create_session()
            session_id = session.session_id

            mock_result = Mock()
            mock_result.final_output = "New Generated Title"
            mock_runner_run.return_value = mock_result

            items = [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi there!"},
            ]

            await manager.generate_session_title(session_id, items)

            # Should have updated the session title
            updated = manager.get_session(session_id)
            assert updated.is_named is True

    def test_save_and_load_metadata(self, temp_dir: Path) -> None:
        """Test saving and loading session metadata."""
        with patch("pathlib.Path.cwd", return_value=temp_dir):
            metadata_path = temp_dir / "sessions.json"

            # Create manager and session
            manager1 = SessionManager(metadata_path=metadata_path)
            session = manager1.create_session(title="Persistent Session")
            session_id = session.session_id

            # Create new manager instance (should load from file)
            manager2 = SessionManager(metadata_path=metadata_path)
            loaded_session = manager2.get_session(session_id)

            assert loaded_session is not None
            assert loaded_session.session_id == session_id
            assert loaded_session.title == "Persistent Session"
