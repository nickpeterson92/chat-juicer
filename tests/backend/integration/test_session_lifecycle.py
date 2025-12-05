"""Integration tests for complete session lifecycle.

Tests end-to-end session workflows with real database operations and mocked
external services. Validates dual-layer history, token tracking, workspace
isolation, and cleanup.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from app.state import AppState
from core.session_builder import SessionBuilder
from core.session_commands import (
    create_new_session,
    delete_session_by_id,
    list_all_sessions,
    switch_to_session,
)


class TestCompleteSessionLifecycle:
    """Integration tests for complete session lifecycle workflows."""

    @pytest.mark.asyncio
    async def test_create_add_messages_delete_workflow(
        self,
        integration_test_env: Path,
        temp_db_path: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test complete workflow: create → add messages → verify dual layers → delete."""

        # Mock agent and tool dependencies
        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # STEP 1: Create new session
            result = await create_new_session(mock_app_state, title="Integration Test Session")

            assert "error" not in result
            assert "session_id" in result
            session_id = result["session_id"]

            # Verify session metadata exists
            assert mock_app_state.session_manager is not None
            session_meta = mock_app_state.session_manager.get_session(session_id)
            assert session_meta is not None
            assert session_meta.title == "Integration Test Session"

            # Verify workspace directory created
            workspace_dir = integration_test_env / "data" / "files" / session_id
            sources_dir = workspace_dir / "sources"
            assert sources_dir.exists()

            # STEP 2: Add messages to both layers
            assert mock_app_state.current_session is not None
            session = mock_app_state.current_session

            # Add user message to Layer 1 (agent context)
            user_item = {"role": "user", "content": "Hello, this is a test message"}
            await session.add_items([user_item])

            # Verify Layer 1 has message
            layer1_items = await session.get_items()
            assert len(layer1_items) == 1
            assert layer1_items[0]["content"] == "Hello, this is a test message"

            # Add assistant response to both layers
            assistant_item = {"role": "assistant", "content": "Hello! I can help you with that."}
            await session.add_items([assistant_item])

            # Verify Layer 1 has both messages
            layer1_items = await session.get_items()
            assert len(layer1_items) == 2

            # Verify Layer 2 has messages
            assert mock_app_state.full_history_store is not None
            layer2_messages = mock_app_state.full_history_store.get_messages(session_id)
            assert len(layer2_messages) >= 2

            # STEP 3: Verify dual-layer consistency
            user_messages_l1 = [item for item in layer1_items if item.get("role") == "user"]
            user_messages_l2 = [msg for msg in layer2_messages if msg.get("role") == "user"]
            assert len(user_messages_l1) == len(user_messages_l2)

            # STEP 4: Delete session and verify complete cleanup
            delete_result = await delete_session_by_id(mock_app_state, session_id)

            assert delete_result["success"] is True
            assert delete_result["layer1_cleaned"] is True
            assert delete_result["layer2_cleaned"] is True

            # Verify metadata removed
            assert mock_app_state.session_manager.get_session(session_id) is None

            # Verify Layer 1 table cleaned
            layer1_after = (
                await SessionBuilder(session_id)
                .with_persistent_storage(str(temp_db_path))
                .with_model("gpt-4o")
                .build()
                .get_items()
            )
            # Should be empty or table doesn't exist
            assert len(layer1_after) == 0

            # Verify Layer 2 cleaned
            layer2_count = mock_app_state.full_history_store.get_message_count(session_id)
            assert layer2_count == 0

            # Verify workspace directory removed (would be cleaned up by session manager)
            # Note: In real implementation, workspace cleanup happens separately

    @pytest.mark.asyncio
    async def test_session_persistence_across_switches(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test session data persists when switching between sessions."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create first session with messages
            session1_result = await create_new_session(mock_app_state, title="Session 1")
            session1_id = session1_result["session_id"]

            # Add messages to session 1
            assert mock_app_state.current_session is not None
            await mock_app_state.current_session.add_items(
                [
                    {
                        "role": "user",
                        "content": "Session 1 message",
                    }
                ]
            )
            await mock_app_state.current_session.add_items(
                [
                    {
                        "role": "assistant",
                        "content": "Session 1 response",
                    }
                ]
            )

            # Create second session
            session2_result = await create_new_session(mock_app_state, title="Session 2")
            session2_id = session2_result["session_id"]

            # Add different messages to session 2
            assert mock_app_state.current_session is not None
            await mock_app_state.current_session.add_items(
                [
                    {
                        "role": "user",
                        "content": "Session 2 message",
                    }
                ]
            )

            # Switch back to session 1
            switch_result = await switch_to_session(mock_app_state, session1_id)
            assert "error" not in switch_result

            # Verify session 1 messages are intact
            assert mock_app_state.current_session is not None
            session1_items = await mock_app_state.current_session.get_items()

            # Should have the original 2 messages
            user_messages = [item for item in session1_items if item.get("role") == "user"]
            assert len(user_messages) >= 1
            assert any("Session 1 message" in item.get("content", "") for item in user_messages)

            # Switch to session 2 and verify isolation
            switch_result2 = await switch_to_session(mock_app_state, session2_id)
            assert "error" not in switch_result2

            assert mock_app_state.current_session is not None
            session2_items = await mock_app_state.current_session.get_items()

            # Should only have session 2 message
            user_messages2 = [item for item in session2_items if item.get("role") == "user"]
            assert len(user_messages2) >= 1
            assert any("Session 2 message" in item.get("content", "") for item in user_messages2)

            # Should NOT have session 1 messages
            assert not any("Session 1 message" in item.get("content", "") for item in session2_items)

            # Clean up
            await delete_session_by_id(mock_app_state, session1_id)
            await delete_session_by_id(mock_app_state, session2_id)

    @pytest.mark.asyncio
    async def test_token_tracking_across_session_lifecycle(
        self,
        integration_test_env: Path,
        temp_db_path: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test token counts persist across session operations."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Token Test Session")
            session_id = result["session_id"]

            assert mock_app_state.current_session is not None
            session = mock_app_state.current_session

            # Add messages and simulate token usage
            await session.add_items([{"role": "user", "content": "Test message 1"}])
            await session.add_items([{"role": "assistant", "content": "Response 1"}])

            # Manually set token counts (simulating real usage)
            session.accumulated_tool_tokens = 100
            items = await session.get_items()
            conversation_tokens = session._calculate_total_tokens(items)
            session.total_tokens = conversation_tokens + session.accumulated_tool_tokens

            initial_total_tokens = session.total_tokens
            initial_tool_tokens = session.accumulated_tool_tokens

            assert initial_total_tokens > 0
            assert initial_tool_tokens == 100

            # Update session metadata with token counts
            assert mock_app_state.session_manager is not None
            from models.session_models import SessionUpdate

            mock_app_state.session_manager.update_session(
                session_id,
                SessionUpdate(accumulated_tool_tokens=initial_tool_tokens),
            )

            # Create second session to force switch
            session2_result = await create_new_session(mock_app_state, title="Session 2")
            session2_id = session2_result["session_id"]

            # Switch back to first session
            switch_result = await switch_to_session(mock_app_state, session_id)
            assert "error" not in switch_result

            # Verify token counts were restored
            assert mock_app_state.current_session is not None
            restored_session = mock_app_state.current_session

            # Token counts should be restored from metadata
            assert restored_session.accumulated_tool_tokens == initial_tool_tokens

            # Clean up
            await delete_session_by_id(mock_app_state, session_id)
            await delete_session_by_id(mock_app_state, session2_id)

    @pytest.mark.asyncio
    async def test_workspace_isolation_between_sessions(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that session workspaces are isolated from each other."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create two sessions
            session1_result = await create_new_session(mock_app_state, title="Workspace Session 1")
            session1_id = session1_result["session_id"]

            session2_result = await create_new_session(mock_app_state, title="Workspace Session 2")
            session2_id = session2_result["session_id"]

            # Get workspace directories
            workspace1 = integration_test_env / "data" / "files" / session1_id
            workspace2 = integration_test_env / "data" / "files" / session2_id

            # Both should exist
            assert workspace1.exists()
            assert workspace2.exists()

            # They should be different directories
            assert workspace1 != workspace2

            # Create a file in session 1 workspace
            test_file1 = workspace1 / "sources" / "session1_file.txt"
            test_file1.write_text("Session 1 content")

            # Verify file exists in session 1
            assert test_file1.exists()

            # Verify file does NOT exist in session 2
            test_file2 = workspace2 / "sources" / "session1_file.txt"
            assert not test_file2.exists()

            # Clean up
            await delete_session_by_id(mock_app_state, session1_id)
            await delete_session_by_id(mock_app_state, session2_id)

    @pytest.mark.asyncio
    async def test_list_sessions_with_multiple_sessions(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test listing multiple sessions with correct metadata."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create multiple sessions with different titles
            session1 = await create_new_session(mock_app_state, title="First Session")
            session2 = await create_new_session(mock_app_state, title="Second Session")
            session3 = await create_new_session(mock_app_state, title="Third Session")

            # List all sessions
            list_result = await list_all_sessions(mock_app_state)

            assert "error" not in list_result
            assert "sessions" in list_result
            assert list_result["total_count"] == 3

            # Verify all sessions are in the list
            session_ids = [s["session_id"] for s in list_result["sessions"]]
            assert session1["session_id"] in session_ids
            assert session2["session_id"] in session_ids
            assert session3["session_id"] in session_ids

            # Verify titles
            titles = [s["title"] for s in list_result["sessions"]]
            assert "First Session" in titles
            assert "Second Session" in titles
            assert "Third Session" in titles

            # Clean up
            await delete_session_by_id(mock_app_state, session1["session_id"])
            await delete_session_by_id(mock_app_state, session2["session_id"])
            await delete_session_by_id(mock_app_state, session3["session_id"])

    @pytest.mark.asyncio
    async def test_layer1_layer2_consistency_after_operations(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that Layer 1 and Layer 2 stay in sync after various operations."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Consistency Test")
            session_id = result["session_id"]

            assert mock_app_state.current_session is not None
            session = mock_app_state.current_session

            # Add multiple messages
            messages = [
                {"role": "user", "content": "Message 1"},
                {"role": "assistant", "content": "Response 1"},
                {"role": "user", "content": "Message 2"},
                {"role": "assistant", "content": "Response 2"},
                {"role": "user", "content": "Message 3"},
                {"role": "assistant", "content": "Response 3"},
            ]

            for msg in messages:
                await session.add_items([msg])

            # Verify Layer 1
            layer1_items = await session.get_items()
            layer1_user_count = sum(1 for item in layer1_items if item.get("role") == "user")
            layer1_assistant_count = sum(1 for item in layer1_items if item.get("role") == "assistant")

            # Verify Layer 2
            assert mock_app_state.full_history_store is not None
            layer2_messages = mock_app_state.full_history_store.get_messages(session_id)
            layer2_user_count = sum(1 for msg in layer2_messages if msg.get("role") == "user")
            layer2_assistant_count = sum(1 for msg in layer2_messages if msg.get("role") == "assistant")

            # Counts should match (Layer 2 is filtered view of Layer 1)
            assert layer1_user_count == layer2_user_count == 3
            assert layer1_assistant_count == layer2_assistant_count == 3

            # Verify message count in metadata
            assert mock_app_state.session_manager is not None
            session_meta = mock_app_state.session_manager.get_session(session_id)
            assert session_meta is not None

            # Clean up
            await delete_session_by_id(mock_app_state, session_id)


class TestSessionLifecycleEdgeCases:
    """Edge case and error handling tests for session lifecycle."""

    @pytest.mark.asyncio
    async def test_create_session_without_session_manager(self) -> None:
        """Test session creation fails gracefully without session manager."""
        app_state = AppState(
            session_manager=None,
            current_session=None,
            agent=Mock(),
            deployment="gpt-4o",
            full_history_store=None,
            mcp_servers={},
        )

        result = await create_new_session(app_state)

        assert "error" in result
        assert "not initialized" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_switch_to_nonexistent_session(self, mock_app_state: AppState) -> None:
        """Test switching to non-existent session fails gracefully."""
        result = await switch_to_session(mock_app_state, "chat_nonexistent123")

        assert "error" in result
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_delete_session_twice(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test deleting same session twice handles gracefully."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Delete Test")
            session_id = result["session_id"]

            # Delete once
            delete_result1 = await delete_session_by_id(mock_app_state, session_id)
            assert delete_result1["success"] is True

            # Delete again - should handle gracefully
            delete_result2 = await delete_session_by_id(mock_app_state, session_id)
            # Second delete returns success=False since metadata doesn't exist
            assert delete_result2["success"] is False
