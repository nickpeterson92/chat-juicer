"""Tests for tool registry module.

Tests tool registration and discovery.
"""

from __future__ import annotations

from tools.registry import AGENT_TOOLS


class TestToolRegistry:
    """Tests for AGENT_TOOLS registry."""

    def test_agent_tools_defined(self) -> None:
        """Test that AGENT_TOOLS is defined."""
        assert AGENT_TOOLS is not None
        assert isinstance(AGENT_TOOLS, list)

    def test_agent_tools_not_empty(self) -> None:
        """Test that AGENT_TOOLS contains tools."""
        assert len(AGENT_TOOLS) > 0

    def test_agent_tools_are_function_tools(self) -> None:
        """Test that all tools are FunctionTool instances from agents SDK."""
        from agents import FunctionTool

        for tool in AGENT_TOOLS:
            assert isinstance(tool, FunctionTool)

    def test_agent_tools_have_names(self) -> None:
        """Test that all tools have name attribute."""
        for tool in AGENT_TOOLS:
            # FunctionTool has a 'name' attribute, not '__name__'
            assert hasattr(tool, "name")
            assert isinstance(tool.name, str)
            assert len(tool.name) > 0

    def test_agent_tools_unique_names(self) -> None:
        """Test that all tool names are unique."""
        names = [tool.name for tool in AGENT_TOOLS]
        assert len(names) == len(set(names))
