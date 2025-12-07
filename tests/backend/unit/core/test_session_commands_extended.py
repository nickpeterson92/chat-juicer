"""Extended tests for session_commands module to increase coverage.

Covers update_session_config and other missing branches.
"""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from core.session_commands import (
    get_config_metadata,
    update_session_config,
)


class TestUpdateSessionConfig:
    """Tests for update_session_config function."""

    @pytest.mark.asyncio
    async def test_update_session_config_no_manager(self) -> None:
        """Test update_session_config with no session manager."""
        mock_app_state = Mock()
        mock_app_state.session_manager = None

        result = await update_session_config(
            mock_app_state,
            "chat_test",
            model="gpt-5-mini",
        )

        assert "error" in result
        assert "not initialized" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_update_session_config_session_not_found(self) -> None:
        """Test update_session_config with non-existent session."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.get_session.return_value = None

        result = await update_session_config(
            mock_app_state,
            "chat_nonexistent",
            model="gpt-5-mini",
        )

        assert "error" in result
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_update_session_config_update_fails(self) -> None:
        """Test update_session_config when update operation fails."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()

        mock_session = Mock()
        mock_session.session_id = "chat_test"
        mock_app_state.session_manager.get_session.return_value = mock_session
        mock_app_state.session_manager.update_session.return_value = False

        result = await update_session_config(
            mock_app_state,
            "chat_test",
            model="gpt-5-mini",
        )

        assert "error" in result
        assert "failed" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_update_session_config_non_current_session(self) -> None:
        """Test update_session_config for non-current session."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_other"

        mock_session = Mock()
        mock_session.session_id = "chat_test"
        mock_session.model = "gpt-5"
        mock_session.mcp_config = []
        mock_session.reasoning_effort = "medium"
        mock_session.model_dump.return_value = {
            "session_id": "chat_test",
            "model": "gpt-5-mini",
            "mcp_config": [],
            "reasoning_effort": "low",
        }

        mock_app_state.session_manager.get_session.return_value = mock_session
        mock_app_state.session_manager.update_session.return_value = True

        await update_session_config(
            mock_app_state,
            "chat_test",
            model="gpt-5-mini",
            reasoning_effort="low",
        )

        # Should succeed and update session
        # Verify the update was called correctly
        assert mock_app_state.session_manager.update_session.called

    @pytest.mark.asyncio
    @patch("core.agent.create_agent")
    @patch("integrations.mcp_registry.filter_mcp_servers")
    @patch("tools.wrappers.create_session_aware_tools")
    async def test_update_session_config_current_session(
        self,
        mock_create_tools: Mock,
        mock_filter_mcp: Mock,
        mock_create_agent: Mock,
    ) -> None:
        """Test update_session_config recreates agent for current session."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_test"
        mock_app_state.mcp_servers = {}
        mock_app_state.current_session = Mock()

        mock_session = Mock()
        mock_session.session_id = "chat_test"
        mock_session.model = "gpt-5"
        mock_session.mcp_config = []
        mock_session.reasoning_effort = "medium"
        mock_session.model_dump.return_value = {
            "session_id": "chat_test",
            "model": "gpt-5-mini",
            "mcp_config": [],
            "reasoning_effort": "high",
        }

        mock_app_state.session_manager.get_session.side_effect = [
            mock_session,  # First call (check exists)
            mock_session,  # Second call (get updated session)
            mock_session,  # Third call (final return)
        ]
        mock_app_state.session_manager.update_session.return_value = True

        # Mock the agent creation
        mock_new_agent = Mock()
        mock_create_agent.return_value = mock_new_agent
        mock_create_tools.return_value = []
        mock_filter_mcp.return_value = []

        await update_session_config(
            mock_app_state,
            "chat_test",
            model="gpt-5-mini",
            reasoning_effort="high",
        )

        # Should recreate agent for current session
        assert mock_create_agent.called
        assert mock_app_state.agent == mock_new_agent
        assert mock_app_state.current_session.agent == mock_new_agent

    @pytest.mark.asyncio
    async def test_update_session_config_session_disappears(self) -> None:
        """Test update_session_config when session disappears after update."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_test"

        mock_session = Mock()
        mock_session.session_id = "chat_test"

        # First call returns session, second call returns None (disappeared)
        mock_app_state.session_manager.get_session.side_effect = [
            mock_session,  # Check exists
            None,  # After update (disappeared)
        ]
        mock_app_state.session_manager.update_session.return_value = True

        result = await update_session_config(
            mock_app_state,
            "chat_test",
            model="gpt-5-mini",
        )

        assert "error" in result
        assert "disappeared" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_update_session_config_update_all_params(self) -> None:
        """Test update_session_config with all parameters."""
        mock_app_state = Mock()
        mock_app_state.session_manager = Mock()
        mock_app_state.session_manager.current_session_id = "chat_other"

        mock_session = Mock()
        mock_session.session_id = "chat_test"
        mock_session.model_dump.return_value = {
            "session_id": "chat_test",
            "model": "gpt-5-pro",
            "mcp_config": ["sequential", "fetch"],
            "reasoning_effort": "high",
        }

        mock_app_state.session_manager.get_session.return_value = mock_session
        mock_app_state.session_manager.update_session.return_value = True

        await update_session_config(
            mock_app_state,
            "chat_test",
            model="gpt-5-pro",
            mcp_config=["sequential", "fetch"],
            reasoning_effort="high",
        )

        # Should update all parameters
        assert mock_app_state.session_manager.update_session.called
        update_call = mock_app_state.session_manager.update_session.call_args[0][1]
        assert update_call.model == "gpt-5-pro"
        assert update_call.mcp_config == ["sequential", "fetch"]
        assert update_call.reasoning_effort == "high"


class TestGetConfigMetadata:
    """Tests for get_config_metadata function."""

    @pytest.mark.asyncio
    async def test_get_config_metadata(self) -> None:
        """Test getting configuration metadata."""
        mock_app_state = Mock()

        result = await get_config_metadata(mock_app_state)

        assert result["success"] is True
        assert "models" in result
        assert "reasoning_levels" in result
        assert "reasoning_models" in result

        # Verify models structure
        models = result["models"]
        assert len(models) > 0
        assert all("value" in m for m in models)
        assert all("label" in m for m in models)
        assert all("description" in m for m in models)
        assert all("isPrimary" in m for m in models)
        assert all("supportsReasoning" in m for m in models)

        # Verify reasoning levels structure
        reasoning_levels = result["reasoning_levels"]
        assert len(reasoning_levels) == 4  # minimal, low, medium, high
        assert all("value" in r for r in reasoning_levels)
        assert all("label" in r for r in reasoning_levels)

        # Verify reasoning models list
        reasoning_models = result["reasoning_models"]
        assert "gpt-5" in reasoning_models
        assert "gpt-5-pro" in reasoning_models
        assert "gpt-4.1" not in reasoning_models

        # Verify default markings
        default_model = next((m for m in models if m["isDefault"]), None)
        assert default_model is not None
        assert default_model["value"] == "gpt-5.1"

        default_reasoning = next((r for r in reasoning_levels if r["isDefault"]), None)
        assert default_reasoning is not None
        assert default_reasoning["value"] == "medium"
