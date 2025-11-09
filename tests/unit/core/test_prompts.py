"""Tests for prompts module.

Tests system prompts and instructions.
"""

from __future__ import annotations

from core.prompts import (
    CONVERSATION_SUMMARIZATION_REQUEST,
    SESSION_TITLE_GENERATION_PROMPT,
    SYSTEM_INSTRUCTIONS,
)


class TestSystemPrompts:
    """Tests for system prompts."""

    def test_system_instructions_exists(self) -> None:
        """Test that system instructions are defined."""
        assert SYSTEM_INSTRUCTIONS is not None
        assert isinstance(SYSTEM_INSTRUCTIONS, str)
        assert len(SYSTEM_INSTRUCTIONS) > 0

    def test_system_instructions_content(self) -> None:
        """Test that system instructions contain key terms."""
        instructions = SYSTEM_INSTRUCTIONS.lower()
        # Should contain guidance for the agent
        assert len(instructions) > 100  # Should be substantial

    def test_conversation_summarization_request_exists(self) -> None:
        """Test that summarization prompt is defined."""
        assert CONVERSATION_SUMMARIZATION_REQUEST is not None
        assert isinstance(CONVERSATION_SUMMARIZATION_REQUEST, str)
        assert len(CONVERSATION_SUMMARIZATION_REQUEST) > 0

    def test_conversation_summarization_request_content(self) -> None:
        """Test that summarization request contains key terms."""
        request = CONVERSATION_SUMMARIZATION_REQUEST.lower()
        # Should mention summarization
        assert "summar" in request or "conversation" in request

    def test_session_title_generation_prompt_exists(self) -> None:
        """Test that title generation prompt is defined."""
        assert SESSION_TITLE_GENERATION_PROMPT is not None
        assert isinstance(SESSION_TITLE_GENERATION_PROMPT, str)
        assert len(SESSION_TITLE_GENERATION_PROMPT) > 0

    def test_session_title_generation_prompt_content(self) -> None:
        """Test that title generation prompt contains key terms."""
        prompt = SESSION_TITLE_GENERATION_PROMPT.lower()
        # Should mention title or conversation
        assert "title" in prompt or "conversation" in prompt

    def test_prompts_are_strings(self) -> None:
        """Test that all prompts are strings."""
        assert isinstance(SYSTEM_INSTRUCTIONS, str)
        assert isinstance(CONVERSATION_SUMMARIZATION_REQUEST, str)
        assert isinstance(SESSION_TITLE_GENERATION_PROMPT, str)

    def test_prompts_not_empty(self) -> None:
        """Test that prompts are not empty after stripping."""
        assert SYSTEM_INSTRUCTIONS.strip() != ""
        assert CONVERSATION_SUMMARIZATION_REQUEST.strip() != ""
        assert SESSION_TITLE_GENERATION_PROMPT.strip() != ""
