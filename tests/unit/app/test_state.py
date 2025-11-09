"""Tests for app state module.

Tests AppState dataclass.
"""

from __future__ import annotations

from unittest.mock import Mock

from app.state import AppState


class TestAppState:
    """Tests for AppState dataclass."""

    def test_app_state_initialization(self) -> None:
        """Test AppState initialization."""
        mock_session_manager = Mock()
        mock_agent = Mock()
        mock_full_history = Mock()

        state = AppState(
            session_manager=mock_session_manager,
            current_session=None,
            agent=mock_agent,
            deployment="gpt-4o",
            full_history_store=mock_full_history,
            mcp_servers={},
        )

        assert state.session_manager == mock_session_manager
        assert state.agent == mock_agent
        assert state.deployment == "gpt-4o"

    def test_app_state_with_session(self) -> None:
        """Test AppState with current session."""
        mock_session = Mock()
        state = AppState(
            session_manager=Mock(),
            current_session=mock_session,
            agent=Mock(),
            deployment="gpt-4o",
            full_history_store=Mock(),
            mcp_servers={},
        )
        assert state.current_session == mock_session
