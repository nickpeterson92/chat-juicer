"""Tests for session commands module.

Tests session command handling and dispatch.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from core.session_commands import handle_session_command


class TestHandleSessionCommand:
    """Tests for handle_session_command function."""

    @pytest.mark.asyncio
    async def test_new_session_command(self) -> None:
        """Test handling 'new' command."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_session_meta = Mock(
            session_id="chat_new123",
            title="New Session",
            mcp_config=[],  # Empty list, not Mock
            accumulated_tool_tokens=0,
            model_dump=lambda: {"session_id": "chat_new123", "title": "New Session", "mcp_config": []},
        )
        mock_app_state.session_manager.create_session.return_value = mock_session_meta
        mock_app_state.session_manager.get_session.return_value = mock_session_meta
        mock_app_state.agent = Mock()
        mock_app_state.deployment = "gpt-4o"
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_message_count.return_value = 0  # No messages in full history
        mock_app_state.full_history_store.get_messages.return_value = []
        mock_app_state.mcp_servers = {}

        # Mock switch_to_session dependencies (imported inside function)
        with patch("tools.wrappers.create_session_aware_tools", return_value=[]), \
             patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]), \
             patch("core.agent.create_agent"), \
             patch("integrations.sdk_token_tracker.connect_session"), \
             patch("core.session_commands.SessionBuilder") as mock_builder:
            # Mock SessionBuilder chain - session needs async get_items()
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.items = []
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = mock_session_instance

            result = await handle_session_command(mock_app_state, "new", {})

        # create_new_session returns session metadata directly (no "success" key)
        assert "error" not in result
        assert result["session_id"] == "chat_new123"

    @pytest.mark.asyncio
    async def test_list_sessions_command(self) -> None:
        """Test handling 'list' command."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_1"
        mock_app_state.session_manager.list_sessions.return_value = [
            Mock(model_dump=lambda: {"session_id": "chat_1", "title": "Session 1"}),
            Mock(model_dump=lambda: {"session_id": "chat_2", "title": "Session 2"}),
        ]

        result = await handle_session_command(mock_app_state, "list", {})

        # list_all_sessions returns data directly (no "success" key)
        assert "error" not in result
        assert len(result["sessions"]) == 2
        assert "current_session_id" in result

    @pytest.mark.asyncio
    async def test_delete_session_command(self) -> None:
        """Test handling 'delete' command."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.delete_session.return_value = True
        mock_app_state.session_manager.list_sessions.return_value = []
        mock_app_state.current_session = None

        result = await handle_session_command(
            mock_app_state,
            "delete",
            {"session_id": "chat_test123"},
        )

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_switch_session_command(self) -> None:
        """Test handling 'switch' command."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_session_meta = Mock(
            session_id="chat_switch",
            mcp_config=[],  # Empty list, not Mock
            accumulated_tool_tokens=0,
            model_dump=lambda: {"session_id": "chat_switch", "title": "Switched", "mcp_config": []},
        )
        mock_app_state.session_manager.get_session.return_value = mock_session_meta
        mock_app_state.agent = Mock()
        mock_app_state.deployment = "gpt-4o"
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_message_count.return_value = 0  # No messages in full history
        mock_app_state.full_history_store.get_messages.return_value = []
        mock_app_state.mcp_servers = {}

        # Mock switch_to_session dependencies (imported inside function)
        with patch("tools.wrappers.create_session_aware_tools", return_value=[]), \
             patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]), \
             patch("core.agent.create_agent"), \
             patch("integrations.sdk_token_tracker.connect_session"), \
             patch("core.session_commands.SessionBuilder") as mock_builder:
            # Mock SessionBuilder chain - session needs async get_items()
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.items = []
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = mock_session_instance

            result = await handle_session_command(
                mock_app_state,
                "switch",
                {"session_id": "chat_switch"},
            )

        # switch_to_session returns session data with full_history (no "success" key)
        assert "error" not in result
        assert "session" in result
        assert result["session"]["session_id"] == "chat_switch"

    @pytest.mark.asyncio
    async def test_rename_session_command(self) -> None:
        """Test handling 'rename' command."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.update_session.return_value = True
        mock_app_state.session_manager.get_session.return_value = Mock(
            model_dump=lambda: {"session_id": "chat_test", "title": "Renamed"},
        )

        result = await handle_session_command(
            mock_app_state,
            "rename",
            {"session_id": "chat_test", "title": "Renamed"},
        )

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_unknown_command(self) -> None:
        """Test handling unknown command."""
        mock_app_state = Mock()

        result = await handle_session_command(mock_app_state, "unknown_command", {})

        # Error responses have "error" key (no "success" key)
        assert "error" in result
        assert "Invalid command" in result["error"]

    @pytest.mark.asyncio
    async def test_command_with_missing_session_manager(self) -> None:
        """Test command when session_manager is None."""
        mock_app_state = Mock()
        mock_app_state.session_manager = None

        result = await handle_session_command(mock_app_state, "new", {})

        # Error responses have "error" key (no "success" key)
        assert "error" in result
        assert "not initialized" in result["error"].lower()
