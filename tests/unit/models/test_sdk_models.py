"""Tests for SDK models module.

Tests Protocol definitions used for SDK event handling.
"""

from __future__ import annotations

from unittest.mock import Mock

import pytest

from models.sdk_models import (
    ContentLike,
    EventHandler,
    RawHandoffLike,
    RawMessageLike,
    RawToolCallLike,
)


class TestContentLike:
    """Tests for ContentLike protocol."""

    def test_content_like_with_text(self) -> None:
        """Test object matching ContentLike protocol with text."""
        content = Mock()
        content.text = "Hello world"

        # Check protocol conformance
        assert isinstance(content, ContentLike)
        assert content.text == "Hello world"

    def test_content_like_with_none_text(self) -> None:
        """Test object matching ContentLike protocol with None text."""
        content = Mock()
        content.text = None

        assert isinstance(content, ContentLike)
        assert content.text is None


class TestRawMessageLike:
    """Tests for RawMessageLike protocol."""

    def test_raw_message_with_content_list(self) -> None:
        """Test object matching RawMessageLike protocol."""
        message = Mock()
        message.content = [Mock(text="Part 1"), Mock(text="Part 2")]

        assert isinstance(message, RawMessageLike)
        assert message.content is not None
        assert len(message.content) == 2

    def test_raw_message_with_none_content(self) -> None:
        """Test raw message with None content."""
        message = Mock()
        message.content = None

        assert isinstance(message, RawMessageLike)
        assert message.content is None


class TestRawToolCallLike:
    """Tests for RawToolCallLike protocol."""

    def test_raw_tool_call_full(self) -> None:
        """Test object matching RawToolCallLike protocol with all fields."""
        tool_call = Mock()
        tool_call.name = "read_file"
        tool_call.arguments = '{"path": "/test/file.txt"}'
        tool_call.call_id = "call_abc123"
        tool_call.id = "id_xyz789"

        assert isinstance(tool_call, RawToolCallLike)
        assert tool_call.name == "read_file"
        assert tool_call.arguments == '{"path": "/test/file.txt"}'
        assert tool_call.call_id == "call_abc123"
        assert tool_call.id == "id_xyz789"

    def test_raw_tool_call_minimal(self) -> None:
        """Test raw tool call with minimal fields."""
        tool_call = Mock()
        tool_call.name = "test_tool"
        tool_call.arguments = "{}"
        tool_call.call_id = None
        tool_call.id = None

        assert isinstance(tool_call, RawToolCallLike)
        assert tool_call.name == "test_tool"
        assert tool_call.call_id is None


class TestRawHandoffLike:
    """Tests for RawHandoffLike protocol."""

    def test_raw_handoff_to_target(self) -> None:
        """Test handoff to target agent."""
        handoff = Mock()
        handoff.target = "specialist_agent"
        handoff.source = None
        handoff.arguments = '{"task": "analyze"}'

        assert isinstance(handoff, RawHandoffLike)
        assert handoff.target == "specialist_agent"
        assert handoff.source is None

    def test_raw_handoff_from_source(self) -> None:
        """Test handoff from source agent."""
        handoff = Mock()
        handoff.target = None
        handoff.source = "specialist_agent"
        handoff.arguments = '{"result": "complete"}'

        assert isinstance(handoff, RawHandoffLike)
        assert handoff.source == "specialist_agent"
        assert handoff.target is None


class TestEventHandler:
    """Tests for EventHandler protocol."""

    def test_event_handler_returns_string(self) -> None:
        """Test event handler that returns a string."""
        def handler(event: Mock) -> str | None:
            return "__JSON__test__JSON__"

        assert isinstance(handler, EventHandler)
        result = handler(Mock())
        assert result == "__JSON__test__JSON__"

    def test_event_handler_returns_none(self) -> None:
        """Test event handler that returns None."""
        def handler(event: Mock) -> str | None:
            return None

        assert isinstance(handler, EventHandler)
        result = handler(Mock())
        assert result is None

    def test_callable_conformance(self) -> None:
        """Test that callable objects can be event handlers."""
        class HandlerClass:
            def __call__(self, event: Mock) -> str | None:
                return "handled"

        handler = HandlerClass()
        assert isinstance(handler, EventHandler)
        result = handler(Mock())
        assert result == "handled"
