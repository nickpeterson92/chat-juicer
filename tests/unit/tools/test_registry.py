"""Tests for tool registry module.

Tests tool registration and discovery.
"""

from __future__ import annotations

from tools.registry import AGENT_TOOLS


class TestToolRegistry:
    """Tests for AGENT_TOOLS registry."""

    def test_agent_tools_unique_names(self) -> None:
        """Test that all tool names are unique."""
        names = [tool.name for tool in AGENT_TOOLS]
        assert len(names) == len(set(names))
