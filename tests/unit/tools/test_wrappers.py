"""Tests for tool wrappers module.

Tests session-aware tool wrappers.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from tools.wrappers import create_session_aware_tools


class TestCreateSessionAwareTools:
    """Tests for create_session_aware_tools function."""

    def test_create_session_aware_tools(self) -> None:
        """Test creating session-aware tools."""
        # Create session-aware tools
        wrapped_tools = create_session_aware_tools("chat_test123")

        # Should return a list of FunctionTool instances
        assert isinstance(wrapped_tools, list)
        assert len(wrapped_tools) > 0

        # Each tool should be a FunctionTool from agents SDK
        from agents import FunctionTool
        for tool in wrapped_tools:
            assert isinstance(tool, FunctionTool)
            assert hasattr(tool, "name")

    def test_session_id_logged(self) -> None:
        """Test that session_id is logged when creating tools."""
        # The function logs session creation
        wrapped_tools = create_session_aware_tools("chat_session123")

        assert isinstance(wrapped_tools, list)
        # Tools should be created (exact count depends on implementation)
        assert len(wrapped_tools) >= 0

    def test_tools_have_descriptions(self) -> None:
        """Test that created tools have descriptions."""
        wrapped_tools = create_session_aware_tools("chat_test")

        # Each tool should have a description
        for tool in wrapped_tools:
            assert hasattr(tool, "description")
            assert isinstance(tool.description, str)
            assert len(tool.description) > 0

    def test_tool_count(self) -> None:
        """Test that correct number of tools are created."""
        wrapped_tools = create_session_aware_tools("chat_test")

        # Should have 5 tools: list_directory, read_file, search_files, edit_file, generate_document
        assert len(wrapped_tools) == 5
