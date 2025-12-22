"""Tests for message_utils module."""

from __future__ import annotations

import json

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from api.services.message_utils import (
    _extract_display_content,
    calculate_tool_status,
    row_to_message,
)


class MockRow:
    """Mock database row for testing."""

    def __init__(self, data: dict[str, Any]):
        self._data = data

    def get(self, key: str) -> Any:
        return self._data.get(key)

    def __getitem__(self, key: str) -> Any:
        return self._data[key]


class TestExtractDisplayContent:
    """Tests for _extract_display_content helper."""

    def test_plain_text_unchanged(self) -> None:
        """Plain text content should be returned as-is."""
        result = _extract_display_content("Hello, world!")
        assert result == "Hello, world!"

    def test_none_returns_none(self) -> None:
        """None content should return None."""
        result = _extract_display_content(None)
        assert result is None

    def test_multimodal_extracts_text(self) -> None:
        """Multimodal JSON array should extract text content."""
        content = json.dumps(
            [
                {"type": "input_text", "text": "What's in this image?"},
                {"type": "input_image", "image_url": "data:image/png;base64,abc123..."},
            ]
        )
        result = _extract_display_content(content)
        assert result == "What's in this image?"

    def test_multimodal_multiple_text_parts(self) -> None:
        """Multiple text parts should be joined with newlines."""
        content = json.dumps(
            [
                {"type": "input_text", "text": "First part"},
                {"type": "input_image", "image_url": "data:..."},
                {"type": "input_text", "text": "Second part"},
            ]
        )
        result = _extract_display_content(content)
        assert result == "First part\nSecond part"

    def test_image_only_shows_placeholder(self) -> None:
        """Image-only content should show placeholder."""
        content = json.dumps(
            [
                {"type": "input_image", "image_url": "data:image/png;base64,abc123..."},
            ]
        )
        result = _extract_display_content(content)
        assert result == "[Image attachment]"

    def test_invalid_json_array_returns_asis(self) -> None:
        """Invalid JSON starting with [ should return as-is."""
        content = "[this is not valid json"
        result = _extract_display_content(content)
        assert result == "[this is not valid json"

    def test_json_object_not_array_returns_asis(self) -> None:
        """JSON objects (not arrays) should return as-is."""
        content = json.dumps({"key": "value"})
        result = _extract_display_content(content)
        assert result == content

    def test_text_type_alternative_format(self) -> None:
        """Handle 'text' type in addition to 'input_text'."""
        content = json.dumps(
            [
                {"type": "text", "text": "Alternative format"},
            ]
        )
        result = _extract_display_content(content)
        assert result == "Alternative format"


class TestRowToMessage:
    """Tests for row_to_message function."""

    def test_basic_user_message(self) -> None:
        """Test basic user message conversion."""
        row = MockRow(
            {
                "id": uuid4(),
                "role": "user",
                "content": "Hello!",
                "created_at": datetime.now(timezone.utc),
                "metadata": "{}",
                "tool_call_id": None,
                "tool_name": None,
                "tool_arguments": None,
                "tool_result": None,
                "tool_success": None,
            }
        )

        result = row_to_message(row)
        assert result["role"] == "user"
        assert result["content"] == "Hello!"

    def test_multimodal_user_message(self) -> None:
        """Test multimodal user message extracts text."""
        multimodal_content = json.dumps(
            [
                {"type": "input_text", "text": "Describe this image"},
                {"type": "input_image", "image_url": "data:image/png;base64,..."},
            ]
        )

        row = MockRow(
            {
                "id": uuid4(),
                "role": "user",
                "content": multimodal_content,
                "created_at": datetime.now(timezone.utc),
                "metadata": "{}",
                "tool_call_id": None,
                "tool_name": None,
                "tool_arguments": None,
                "tool_result": None,
                "tool_success": None,
            }
        )

        result = row_to_message(row)
        assert result["content"] == "Describe this image"

    def test_partial_interrupted_message(self) -> None:
        """Test partial flag is extracted from metadata."""
        row = MockRow(
            {
                "id": uuid4(),
                "role": "assistant",
                "content": "Partial response...",
                "created_at": datetime.now(timezone.utc),
                "metadata": json.dumps({"partial": True}),
                "tool_call_id": None,
                "tool_name": None,
                "tool_arguments": None,
                "tool_result": None,
                "tool_success": None,
            }
        )

        result = row_to_message(row)
        assert result["partial"] is True


class TestCalculateToolStatus:
    """Tests for calculate_tool_status function."""

    def test_interrupted_status(self) -> None:
        """Interrupted flag takes precedence."""
        result = calculate_tool_status({"interrupted": True}, True)
        assert result == "interrupted"

    def test_completed_status(self) -> None:
        """Successful tool returns completed."""
        result = calculate_tool_status({}, True)
        assert result == "completed"

    def test_failed_status(self) -> None:
        """Failed tool returns failed."""
        result = calculate_tool_status({}, False)
        assert result == "failed"

    def test_pending_status(self) -> None:
        """None success returns pending."""
        result = calculate_tool_status({}, None)
        assert result == "pending"
