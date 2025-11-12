"""Extended tests for SessionManager to increase coverage.

Covers edge cases, error handling, and platform-specific logic.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from core.session_manager import SessionManager


class TestSessionManagerErrorHandling:
    """Test error handling in SessionManager."""

    def test_load_metadata_invalid_json(self, temp_dir: Path) -> None:
        """Test loading metadata with invalid JSON."""
        metadata_path = temp_dir / "invalid.json"
        metadata_path.write_text("{ invalid json }")

        # Should handle error gracefully
        manager = SessionManager(metadata_path=metadata_path)

        assert manager.sessions == {}
        assert manager.current_session_id is None

    def test_load_metadata_corrupt_data(self, temp_dir: Path) -> None:
        """Test loading metadata with corrupt data structure."""
        metadata_path = temp_dir / "corrupt.json"
        metadata_path.write_text('{"current_session_id": 123, "sessions": "not_a_dict"}')

        # Should handle error gracefully
        manager = SessionManager(metadata_path=metadata_path)

        assert manager.sessions == {}
        assert manager.current_session_id is None

    def test_save_metadata_permission_error(self, temp_dir: Path) -> None:
        """Test saving metadata with permission error."""
        metadata_path = temp_dir / "readonly" / "metadata.json"

        manager = SessionManager(metadata_path=metadata_path)
        manager.sessions = {"chat_test": Mock()}

        # Make parent directory read-only (Unix only, will skip error on Windows)
        with patch("builtins.open", side_effect=PermissionError("Access denied")):
            # Should log error but not raise
            manager._save_metadata()

            # Manager state should remain unchanged
            assert "chat_test" in manager.sessions


class TestSessionManagerGetCurrentSession:
    """Test get_current_session method."""

    def test_get_current_session_exists(self, temp_dir: Path) -> None:
        """Test getting current session when it exists."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")

        # Create a session and set it as current
        session = manager.create_session(title="Current Session")
        manager.current_session_id = session.session_id

        current = manager.get_current_session()

        assert current is not None
        assert current.session_id == session.session_id
        assert current.title == "Current Session"

    def test_get_current_session_none_set(self, temp_dir: Path) -> None:
        """Test getting current session when none is set."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        manager.current_session_id = None

        current = manager.get_current_session()

        assert current is None

    def test_get_current_session_invalid_id(self, temp_dir: Path) -> None:
        """Test getting current session with invalid ID."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        manager.current_session_id = "chat_nonexistent"

        current = manager.get_current_session()

        assert current is None


class TestSessionManagerPlatformSpecific:
    """Test platform-specific behavior in SessionManager."""

    @patch("platform.system")
    @patch("shutil.copytree")
    def test_create_session_windows_templates(
        self,
        mock_copytree: Mock,
        mock_platform: Mock,
        temp_dir: Path,
    ) -> None:
        """Test session creation on Windows uses copy instead of symlink."""
        mock_platform.return_value = "Windows"

        # Create templates directory
        templates_dir = Path("templates")
        templates_dir.mkdir(exist_ok=True)

        manager = SessionManager(metadata_path=temp_dir / "sessions.json")

        with patch("pathlib.Path.resolve") as mock_resolve:
            mock_resolve.return_value = templates_dir
            session = manager.create_session(title="Windows Session")

        # Should use copytree on Windows
        assert mock_copytree.called
        assert session.session_id.startswith("chat_")

    @patch("platform.system")
    @patch("pathlib.Path.symlink_to")
    def test_create_session_unix_templates(
        self,
        mock_symlink: Mock,
        mock_platform: Mock,
        temp_dir: Path,
    ) -> None:
        """Test session creation on Unix uses symlink."""
        mock_platform.return_value = "Linux"

        # Create templates directory
        templates_dir = Path("templates")
        templates_dir.mkdir(exist_ok=True)

        manager = SessionManager(metadata_path=temp_dir / "sessions.json")

        with patch("pathlib.Path.resolve") as mock_resolve:
            mock_resolve.return_value = templates_dir
            session = manager.create_session(title="Unix Session")

        # Should use symlink on Unix
        assert mock_symlink.called
        assert session.session_id.startswith("chat_")

    def test_create_session_template_link_fails(self, temp_dir: Path) -> None:
        """Test session creation continues even if template link fails."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")

        # Mock symlink_to to raise an error
        with patch("pathlib.Path.symlink_to", side_effect=OSError("Permission denied")):
            # Should create session successfully despite template link failure
            session = manager.create_session(title="No Templates Session")

            assert session.session_id.startswith("chat_")
            assert session.title == "No Templates Session"


class TestSessionManagerTitleGeneration:
    """Test session title generation."""

    @pytest.mark.asyncio
    async def test_generate_session_title_nonexistent_session(self, temp_dir: Path) -> None:
        """Test title generation for non-existent session."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")

        result = await manager.generate_session_title(
            "chat_nonexistent",
            [{"role": "user", "content": "Test"}],
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_generate_session_title_already_named(self, temp_dir: Path) -> None:
        """Test title generation skips already named sessions."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Already Named")

        # Mark as named
        session.is_named = True
        manager.sessions[session.session_id] = session

        result = await manager.generate_session_title(
            session.session_id,
            [
                {"role": "user", "content": "Message 1"},
                {"role": "assistant", "content": "Response 1"},
            ],
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_generate_session_title_not_enough_messages(self, temp_dir: Path) -> None:
        """Test title generation requires at least 2 messages."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="New Session")

        result = await manager.generate_session_title(
            session.session_id,
            [{"role": "user", "content": "Single message"}],
        )

        assert result is False

    @pytest.mark.asyncio
    @patch("core.session_manager.Runner")
    @patch("core.session_manager.Agent")
    async def test_generate_session_title_success(
        self,
        mock_agent_class: Mock,
        mock_runner_class: Mock,
        temp_dir: Path,
    ) -> None:
        """Test successful title generation."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Untitled Session")

        # Mock Agent and Runner
        mock_agent = Mock()
        mock_agent_class.return_value = mock_agent

        mock_result = Mock()
        mock_result.final_output = "Generated Title"
        mock_runner_class.run = AsyncMock(return_value=mock_result)

        messages = [
            {"role": "user", "content": "Tell me about Python"},
            {"role": "assistant", "content": "Python is a programming language"},
        ]

        with patch("utils.ipc.IPCManager"):
            result = await manager.generate_session_title(session.session_id, messages)

        assert result is True
        updated_session = manager.get_session(session.session_id)
        assert updated_session is not None
        assert updated_session.title == "Generated Title"
        assert updated_session.is_named is True

    @pytest.mark.asyncio
    @patch("core.session_manager.Runner")
    @patch("core.session_manager.Agent")
    async def test_generate_session_title_empty_response(
        self,
        mock_agent_class: Mock,
        mock_runner_class: Mock,
        temp_dir: Path,
    ) -> None:
        """Test title generation with empty response."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Untitled Session")

        mock_agent = Mock()
        mock_agent_class.return_value = mock_agent

        # Return empty title
        mock_result = Mock()
        mock_result.final_output = ""
        mock_runner_class.run = AsyncMock(return_value=mock_result)

        messages = [
            {"role": "user", "content": "Test"},
            {"role": "assistant", "content": "Response"},
        ]

        result = await manager.generate_session_title(session.session_id, messages)

        assert result is False

    @pytest.mark.asyncio
    @patch("core.session_manager.Runner")
    @patch("core.session_manager.Agent")
    async def test_generate_session_title_cleans_formatting(
        self,
        mock_agent_class: Mock,
        mock_runner_class: Mock,
        temp_dir: Path,
    ) -> None:
        """Test title generation cleans quotes and punctuation."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Untitled Session")

        mock_agent = Mock()
        mock_agent_class.return_value = mock_agent

        # Return title with quotes and punctuation
        mock_result = Mock()
        mock_result.final_output = '"Python Programming Guide."'
        mock_runner_class.run = AsyncMock(return_value=mock_result)

        messages = [
            {"role": "user", "content": "Test"},
            {"role": "assistant", "content": "Response"},
        ]

        with patch("utils.ipc.IPCManager"):
            result = await manager.generate_session_title(session.session_id, messages)

        assert result is True
        updated_session = manager.get_session(session.session_id)
        assert updated_session is not None
        # Should remove quotes and trailing punctuation
        assert updated_session.title == "Python Programming Guide"

    @pytest.mark.asyncio
    @patch("core.session_manager.Runner")
    @patch("core.session_manager.Agent")
    async def test_generate_session_title_truncates_long_title(
        self,
        mock_agent_class: Mock,
        mock_runner_class: Mock,
        temp_dir: Path,
    ) -> None:
        """Test title generation truncates overly long titles."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Untitled Session")

        mock_agent = Mock()
        mock_agent_class.return_value = mock_agent

        # Return very long title
        long_title = "A" * 250  # Longer than 200 char limit
        mock_result = Mock()
        mock_result.final_output = long_title
        mock_runner_class.run = AsyncMock(return_value=mock_result)

        messages = [
            {"role": "user", "content": "Test"},
            {"role": "assistant", "content": "Response"},
        ]

        with patch("utils.ipc.IPCManager"):
            result = await manager.generate_session_title(session.session_id, messages)

        assert result is True
        updated_session = manager.get_session(session.session_id)
        assert updated_session is not None
        # Should be truncated to 200 chars with ellipsis
        assert len(updated_session.title) == 200
        assert updated_session.title.endswith("...")

    @pytest.mark.asyncio
    async def test_generate_session_title_exception_handling(self, temp_dir: Path) -> None:
        """Test title generation handles exceptions gracefully."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Untitled Session")

        messages = [
            {"role": "user", "content": "Test"},
            {"role": "assistant", "content": "Response"},
        ]

        # Mock Agent to raise exception
        with patch("core.session_manager.Agent", side_effect=Exception("API Error")):
            result = await manager.generate_session_title(session.session_id, messages)

        assert result is False
        # Session should remain unchanged
        updated_session = manager.get_session(session.session_id)
        assert updated_session is not None
        assert updated_session.title == "Untitled Session"
        assert updated_session.is_named is False


class TestSessionManagerCleanupEmptySessions:
    """Test cleanup_empty_sessions method."""

    def test_cleanup_empty_sessions_no_sessions(self, temp_dir: Path) -> None:
        """Test cleanup with no sessions."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")

        deleted = manager.cleanup_empty_sessions(max_age_hours=24)

        assert deleted == 0

    def test_cleanup_empty_sessions_with_messages(self, temp_dir: Path) -> None:
        """Test cleanup skips sessions with messages."""
        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Active Session")

        # Simulate session with messages
        session.message_count = 5
        manager.sessions[session.session_id] = session

        deleted = manager.cleanup_empty_sessions(max_age_hours=0)  # Even with 0 hours

        assert deleted == 0
        assert session.session_id in manager.sessions

    def test_cleanup_empty_sessions_recent_empty(self, temp_dir: Path) -> None:
        """Test cleanup skips recent empty sessions."""

        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Recent Empty")

        # Session is recent (just created)
        assert session.message_count == 0

        deleted = manager.cleanup_empty_sessions(max_age_hours=24)

        # Should not delete recent session
        assert deleted == 0
        assert session.session_id in manager.sessions

    def test_cleanup_empty_sessions_old_empty(self, temp_dir: Path) -> None:
        """Test cleanup deletes old empty sessions.

        This test creates real session directories which are cleaned up by the
        cleanup_test_session_directories fixture after the test completes.
        """
        from datetime import datetime, timedelta

        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Old Empty")

        # Make session old and empty
        old_time = datetime.now() - timedelta(hours=48)
        session.created_at = old_time.isoformat()
        session.message_count = 0
        manager.sessions[session.session_id] = session

        # Mock FullHistoryStore to confirm session is empty in DB
        with patch("core.full_history.FullHistoryStore") as mock_store_class:
            mock_store = Mock()
            mock_store.get_messages.return_value = []  # DB confirms empty
            mock_store_class.return_value = mock_store

            deleted = manager.cleanup_empty_sessions(max_age_hours=24)

        # Should delete the old empty session
        assert deleted == 1
        assert session.session_id not in manager.sessions
        # Directory will be cleaned up by cleanup_test_session_directories fixture

    def test_cleanup_empty_sessions_file_error(self, temp_dir: Path) -> None:
        """Test cleanup continues despite file deletion errors."""
        from datetime import datetime, timedelta

        manager = SessionManager(metadata_path=temp_dir / "sessions.json")
        session = manager.create_session(title="Old Empty")

        # Make session old
        old_time = datetime.now() - timedelta(hours=48)
        session.created_at = old_time.isoformat()
        session.message_count = 0
        manager.sessions[session.session_id] = session

        # Mock shutil.rmtree to raise error
        with patch("shutil.rmtree", side_effect=OSError("Permission denied")):
            deleted = manager.cleanup_empty_sessions(max_age_hours=24)

        # Should still count as deleted (metadata removed even if files remain)
        assert deleted == 1
        assert session.session_id not in manager.sessions
