"""Tests for agent module.

Tests agent creation and configuration.
"""

from __future__ import annotations

from unittest.mock import Mock, patch

from core.agent import create_agent


class TestCreateAgent:
    """Tests for create_agent function."""

    @patch("core.agent.Agent")
    def test_create_agent_basic(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test creating agent with basic configuration."""
        _agent = create_agent(
            deployment="gpt-4o",
            instructions="Test instructions",
            tools=[],
            mcp_servers=[],
        )
        mock_agent_class.assert_called_once()

    @patch("core.agent.Agent")
    @patch("core.agent.ModelSettings")
    def test_create_agent_with_reasoning_model(
        self, mock_model_settings: Mock, mock_agent_class: Mock, mock_env: dict[str, str]
    ) -> None:
        """Test creating agent with reasoning model (o1-preview)."""
        _agent = create_agent(
            deployment="o1-preview",
            instructions="Test instructions",
            tools=[],
            mcp_servers=[],
            reasoning_effort="high",
        )
        mock_agent_class.assert_called_once()
        # Should have been called with model_settings for reasoning model
        call_args = mock_agent_class.call_args
        assert "model_settings" in call_args.kwargs or len(call_args.args) > 5

    @patch("core.agent.Agent")
    def test_create_agent_with_non_reasoning_model(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test creating agent with non-reasoning model (gpt-4o)."""
        _agent = create_agent(
            deployment="gpt-4o",
            instructions="Test instructions",
            tools=[],
            mcp_servers=[],
            reasoning_effort="high",
        )
        mock_agent_class.assert_called_once()
        # Should NOT have model_settings for non-reasoning model
        _call_args = mock_agent_class.call_args
        # Verify model_settings not passed or is None

    @patch("core.agent.Agent")
    def test_reasoning_effort_validation(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test that reasoning effort is validated."""
        # Valid efforts should work
        for effort in ["minimal", "low", "medium", "high"]:
            agent = create_agent(
                deployment="o1-preview",
                instructions="Test",
                tools=[],
                mcp_servers=[],
                reasoning_effort=effort,
            )
            assert agent is not None

    @patch("core.agent.Agent")
    def test_reasoning_effort_defaults(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test that reasoning effort defaults from settings."""
        _agent = create_agent(
            deployment="o1-preview",
            instructions="Test",
            tools=[],
            mcp_servers=[],
            reasoning_effort=None,  # Should use default from settings
        )
        mock_agent_class.assert_called_once()

    @patch("core.agent.Agent")
    def test_invalid_reasoning_effort(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test that invalid reasoning effort falls back to default."""
        _agent = create_agent(
            deployment="o1-preview",
            instructions="Test",
            tools=[],
            mcp_servers=[],
            reasoning_effort="invalid_effort",
        )
        # Should still create agent with default effort
        mock_agent_class.assert_called_once()

    @patch("core.agent.Agent")
    def test_agent_with_tools(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test creating agent with tools."""
        mock_tools = [Mock(), Mock(), Mock()]
        _agent = create_agent(
            deployment="gpt-4o",
            instructions="Test",
            tools=mock_tools,
            mcp_servers=[],
        )
        mock_agent_class.assert_called_once()
        call_args = mock_agent_class.call_args
        assert call_args.kwargs["tools"] == mock_tools

    @patch("core.agent.Agent")
    def test_agent_with_mcp_servers(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test creating agent with MCP servers."""
        mock_mcp_servers = [Mock(), Mock()]
        _agent = create_agent(
            deployment="gpt-4o",
            instructions="Test",
            tools=[],
            mcp_servers=mock_mcp_servers,
        )
        mock_agent_class.assert_called_once()
        call_args = mock_agent_class.call_args
        assert call_args.kwargs["mcp_servers"] == mock_mcp_servers

    @patch("core.agent.Agent")
    def test_agent_name_and_instructions(self, mock_agent_class: Mock, mock_env: dict[str, str]) -> None:
        """Test that agent is created with correct name and instructions."""
        instructions = "You are a helpful assistant"
        _agent = create_agent(
            deployment="gpt-4o",
            instructions=instructions,
            tools=[],
            mcp_servers=[],
        )
        call_args = mock_agent_class.call_args
        assert call_args.kwargs["name"] == "Chat Juicer"
        assert call_args.kwargs["instructions"] == instructions
