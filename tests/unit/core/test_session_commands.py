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
        with (
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("core.agent.create_agent"),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            # Mock SessionBuilder chain - session needs async get_items()
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.items = []
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = (
                mock_session_instance
            )

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
        with (
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("core.agent.create_agent"),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            # Mock SessionBuilder chain - session needs async get_items()
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.items = []
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = (
                mock_session_instance
            )

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


class TestCreateNewSessionEdgeCases:
    """Edge case tests for create_new_session function."""

    @pytest.mark.asyncio
    async def test_create_session_with_custom_title(self) -> None:
        """Test creating session with custom title."""
        from core.session_commands import create_new_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_session_meta = Mock(
            session_id="chat_custom",
            title="Custom Title",
            mcp_config=[],
            accumulated_tool_tokens=0,
            model_dump=lambda: {"session_id": "chat_custom", "title": "Custom Title"},
        )
        mock_app_state.session_manager.create_session.return_value = mock_session_meta
        mock_app_state.session_manager.get_session.return_value = mock_session_meta
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_message_count.return_value = 0
        mock_app_state.full_history_store.get_messages.return_value = []
        mock_app_state.mcp_servers = {}

        with (
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("core.agent.create_agent"),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = (
                mock_session_instance
            )

            result = await create_new_session(mock_app_state, title="Custom Title")

        assert "error" not in result
        mock_app_state.session_manager.create_session.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_session_with_mcp_config(self) -> None:
        """Test creating session with custom MCP config."""
        from core.session_commands import create_new_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_session_meta = Mock(
            session_id="chat_mcp",
            mcp_config=["sequential-thinking"],
            accumulated_tool_tokens=0,
            model_dump=lambda: {"session_id": "chat_mcp"},
        )
        mock_app_state.session_manager.create_session.return_value = mock_session_meta
        mock_app_state.session_manager.get_session.return_value = mock_session_meta
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_message_count.return_value = 0
        mock_app_state.full_history_store.get_messages.return_value = []
        mock_app_state.mcp_servers = {}

        with (
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("core.agent.create_agent"),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = (
                mock_session_instance
            )

            result = await create_new_session(mock_app_state, mcp_config=["sequential-thinking"])

        assert "error" not in result


class TestSwitchToSessionEdgeCases:
    """Edge case tests for switch_to_session function."""

    @pytest.mark.asyncio
    async def test_switch_to_nonexistent_session(self) -> None:
        """Test switching to a session that doesn't exist."""
        from core.session_commands import switch_to_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = None

        result = await switch_to_session(mock_app_state, "chat_nonexistent")

        assert "error" in result
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_switch_disconnects_old_session(self) -> None:
        """Test that switching disconnects the old session from token tracker."""
        from core.session_commands import switch_to_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_session_meta = Mock(
            session_id="chat_new",
            mcp_config=[],
            accumulated_tool_tokens=0,
            model="gpt-4o",
            reasoning_effort="medium",
            model_dump=lambda: {"session_id": "chat_new"},
        )
        mock_app_state.session_manager.get_session.return_value = mock_session_meta
        mock_app_state.current_session = Mock(session_id="chat_old")
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_message_count.return_value = 0
        mock_app_state.full_history_store.get_messages.return_value = []
        mock_app_state.mcp_servers = {}

        with (
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("core.agent.create_agent"),
            patch("core.session_commands.connect_session"),
            patch("core.session_commands.disconnect_session") as mock_disconnect,
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[])
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = (
                mock_session_instance
            )

            await switch_to_session(mock_app_state, "chat_new")

        mock_disconnect.assert_called_once()

    @pytest.mark.asyncio
    async def test_switch_with_existing_messages(self) -> None:
        """Test switching to session with existing messages."""
        from core.session_commands import switch_to_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_session_meta = Mock(
            session_id="chat_messages",
            mcp_config=[],
            accumulated_tool_tokens=100,
            model="gpt-4o",
            reasoning_effort="medium",
            model_dump=lambda: {"session_id": "chat_messages"},
        )
        mock_app_state.session_manager.get_session.return_value = mock_session_meta
        mock_app_state.current_session = None
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_message_count.return_value = 5
        mock_app_state.full_history_store.get_messages.return_value = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ]
        mock_app_state.mcp_servers = {}

        with (
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("core.agent.create_agent"),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            mock_session_instance = Mock()
            mock_session_instance.get_items = AsyncMock(return_value=[{"role": "user", "content": "Test"}])
            mock_session_instance._calculate_total_tokens = Mock(return_value=50)
            mock_session_instance.total_tokens = 0
            mock_session_instance.accumulated_tool_tokens = 0
            mock_builder.return_value.with_persistent_storage.return_value.with_agent.return_value.with_model.return_value.with_threshold.return_value.with_full_history.return_value.with_session_manager.return_value.build.return_value = (
                mock_session_instance
            )

            result = await switch_to_session(mock_app_state, "chat_messages")

        assert "error" not in result
        assert result["message_count"] == 5
        assert len(result["full_history"]) == 2


class TestLoadMoreMessagesEdgeCases:
    """Edge case tests for load_more_messages function."""

    @pytest.mark.asyncio
    async def test_load_more_with_offset(self) -> None:
        """Test loading messages with pagination offset."""
        from core.session_commands import load_more_messages

        mock_app_state = Mock()
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_messages.return_value = [
            {"role": "user", "content": f"Message {i}"} for i in range(10)
        ]
        mock_app_state.full_history_store.get_message_count.return_value = 100

        result = await load_more_messages(mock_app_state, "chat_test", offset=50, limit=10)

        assert result["offset"] == 50
        assert result["loaded_count"] == 10
        assert result["total_count"] == 100
        assert result["has_more"] is True

    @pytest.mark.asyncio
    async def test_load_more_at_end(self) -> None:
        """Test loading messages at the end of pagination."""
        from core.session_commands import load_more_messages

        mock_app_state = Mock()
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.get_messages.return_value = [{"role": "user", "content": "Last message"}]
        mock_app_state.full_history_store.get_message_count.return_value = 51

        result = await load_more_messages(mock_app_state, "chat_test", offset=50, limit=50)

        assert result["has_more"] is False
        assert result["loaded_count"] == 1

    @pytest.mark.asyncio
    async def test_load_more_without_full_history_store(self) -> None:
        """Test loading messages when full_history_store is None."""
        from core.session_commands import load_more_messages

        mock_app_state = Mock()
        mock_app_state.full_history_store = None

        result = await load_more_messages(mock_app_state, "chat_test", offset=0, limit=50)

        assert result["messages"] == []
        assert result["has_more"] is False


class TestDeleteSessionEdgeCases:
    """Edge case tests for delete_session_by_id function."""

    @pytest.mark.asyncio
    async def test_delete_current_session(self) -> None:
        """Test deleting the currently active session."""
        from core.session_commands import delete_session_by_id

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.delete_session.return_value = True
        mock_app_state.current_session = Mock(session_id="chat_current")
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.clear_session.return_value = True

        with (
            patch("core.session_commands.disconnect_session") as mock_disconnect,
            patch("core.session_commands.SessionBuilder") as mock_builder,
        ):
            mock_temp_session = Mock()
            mock_temp_session.delete_storage = AsyncMock(return_value=True)
            mock_builder.return_value.with_persistent_storage.return_value.with_model.return_value.build.return_value = (
                mock_temp_session
            )

            result = await delete_session_by_id(mock_app_state, "chat_current")

        mock_disconnect.assert_called_once()
        assert result["success"] is True
        assert mock_app_state.current_session is None

    @pytest.mark.asyncio
    async def test_delete_layer1_failure(self) -> None:
        """Test delete when Layer 1 cleanup fails."""
        from core.session_commands import delete_session_by_id

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.delete_session.return_value = True
        mock_app_state.current_session = None
        mock_app_state.full_history_store = Mock()
        mock_app_state.full_history_store.clear_session.return_value = True

        with patch("core.session_commands.SessionBuilder") as mock_builder:
            mock_temp_session = Mock()
            mock_temp_session.delete_storage = AsyncMock(return_value=False)
            mock_builder.return_value.with_persistent_storage.return_value.with_model.return_value.build.return_value = (
                mock_temp_session
            )

            result = await delete_session_by_id(mock_app_state, "chat_test")

        assert result["layer1_cleaned"] is False
        assert result["layer2_cleaned"] is True


class TestSummarizeSessionEdgeCases:
    """Edge case tests for summarize_current_session function."""

    @pytest.mark.asyncio
    async def test_summarize_no_active_session(self) -> None:
        """Test summarize when no session is active."""
        from core.session_commands import summarize_current_session

        mock_app_state = Mock()
        mock_app_state.current_session = None

        result = await summarize_current_session(mock_app_state)

        assert "error" in result
        assert "no active session" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_summarize_no_agent(self) -> None:
        """Test summarize when agent is not available."""
        from core.session_commands import summarize_current_session

        mock_app_state = Mock()
        mock_app_state.current_session = Mock(agent=None)

        result = await summarize_current_session(mock_app_state)

        assert "error" in result
        assert "agent" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_summarize_insufficient_messages(self) -> None:
        """Test summarize with insufficient messages."""
        from core.session_commands import summarize_current_session

        mock_app_state = Mock()
        mock_app_state.current_session = Mock()
        mock_app_state.current_session.agent = Mock()
        mock_app_state.current_session.get_items = AsyncMock(return_value=[{"role": "user", "content": "Hi"}])

        result = await summarize_current_session(mock_app_state)

        assert "error" in result
        assert "not enough" in result["error"].lower() or "insufficient" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_summarize_success(self) -> None:
        """Test successful summarization."""
        from core.session_commands import summarize_current_session

        mock_app_state = Mock()
        mock_app_state.current_session = Mock()
        mock_app_state.current_session.agent = Mock()
        mock_app_state.current_session.get_items = AsyncMock(
            return_value=[
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
                {"role": "user", "content": "How are you?"},
            ]
        )
        mock_app_state.current_session.summarize_with_agent = AsyncMock(return_value="Summary created")
        mock_app_state.current_session.total_tokens = 150

        result = await summarize_current_session(mock_app_state)

        assert result["success"] is True
        assert "tokens" in result


class TestClearSessionEdgeCases:
    """Edge case tests for clear_current_session function."""

    @pytest.mark.asyncio
    async def test_clear_when_no_session(self) -> None:
        """Test clearing when no session is active."""
        from core.session_commands import clear_current_session

        mock_app_state = Mock()
        mock_app_state.current_session = None
        mock_app_state.session_manager = Mock()

        result = await clear_current_session(mock_app_state)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_clear_disconnects_session(self) -> None:
        """Test that clear disconnects from token tracker."""
        from core.session_commands import clear_current_session

        mock_app_state = Mock()
        mock_app_state.current_session = Mock(session_id="chat_active")
        mock_app_state.session_manager = Mock()

        with patch("core.session_commands.disconnect_session") as mock_disconnect:
            result = await clear_current_session(mock_app_state)

        mock_disconnect.assert_called_once()
        assert result["success"] is True
        assert mock_app_state.current_session is None


class TestRenameSessionEdgeCases:
    """Edge case tests for rename_session function."""

    @pytest.mark.asyncio
    async def test_rename_nonexistent_session(self) -> None:
        """Test renaming a session that doesn't exist."""
        from core.session_commands import rename_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = None

        result = await rename_session(mock_app_state, "chat_nonexistent", "New Title")

        assert "error" in result
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_rename_update_failure(self) -> None:
        """Test rename when update fails."""
        from core.session_commands import rename_session

        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = Mock(model_dump=lambda: {"session_id": "chat_test"})
        mock_app_state.session_manager.update_session.return_value = False

        result = await rename_session(mock_app_state, "chat_test", "New Title")

        assert "error" in result
        assert "failed" in result["error"].lower()


class TestGetConfigMetadata:
    """Tests for get_config_metadata function."""

    @pytest.mark.asyncio
    async def test_get_config_returns_models(self) -> None:
        """Test that config metadata returns model list."""
        from core.session_commands import get_config_metadata

        mock_app_state = Mock()
        mock_settings = Mock()
        mock_settings.azure_openai_deployment = "gpt-5-mini"
        mock_settings.reasoning_effort = "medium"

        with patch("core.session_commands.get_settings", return_value=mock_settings):
            result = await get_config_metadata(mock_app_state)

        assert result["success"] is True
        assert "models" in result
        assert len(result["models"]) > 0
        assert "reasoning_levels" in result

    @pytest.mark.asyncio
    async def test_config_models_have_required_fields(self) -> None:
        """Test that each model has required fields."""
        from core.session_commands import get_config_metadata

        mock_app_state = Mock()
        mock_settings = Mock()
        mock_settings.azure_openai_deployment = "gpt-5-mini"
        mock_settings.reasoning_effort = "medium"

        with patch("core.session_commands.get_settings", return_value=mock_settings):
            result = await get_config_metadata(mock_app_state)

        for model in result["models"]:
            assert "value" in model
            assert "label" in model
            assert "description" in model
            assert "isPrimary" in model
            assert "isDefault" in model
            assert "supportsReasoning" in model


class TestHandleSessionCommandValidation:
    """Tests for handle_session_command validation and error handling."""

    @pytest.mark.asyncio
    async def test_handle_command_with_validation_error(self) -> None:
        """Test handling command with validation error."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()

        # Invalid data that will fail Pydantic validation
        result = await handle_session_command(
            mock_app_state,
            "rename",
            {"session_id": "chat_test"},  # Missing required 'title' field
        )

        assert "error" in result
        assert "invalid" in result["error"].lower() or "field" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_handle_command_exception(self) -> None:
        """Test handling command that raises exception."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.list_sessions.side_effect = RuntimeError("Database error")

        result = await handle_session_command(mock_app_state, "list", {})

        assert "error" in result
