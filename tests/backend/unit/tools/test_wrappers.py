"""Tests for tool wrappers module.

Tests session-aware tool wrappers.
"""

from __future__ import annotations

from tools.wrappers import create_session_aware_tools


class TestCreateSessionAwareTools:
    """Tests for create_session_aware_tools function."""

    def test_tool_count(self) -> None:
        """Test that correct number of tools are created."""
        wrapped_tools = create_session_aware_tools("chat_test")

        # Should have 5 tools: list_directory, read_file, search_files, edit_file, generate_document
        assert len(wrapped_tools) == 5
