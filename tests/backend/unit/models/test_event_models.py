"""Tests for event models module.

Tests Pydantic models used for IPC event validation and serialization.
"""

from __future__ import annotations

import json

import pytest

from pydantic import ValidationError

from models.event_models import (
    AgentUpdateMessage,
    AssistantMessage,
    ErrorNotification,
    FunctionCallItem,
    FunctionEventMessage,
    FunctionOutputItem,
    HandoffMessage,
    SessionItem,
    ToolCallNotification,
    ToolResultNotification,
    UserInput,
)


class TestErrorNotification:
    """Tests for ErrorNotification model."""

    def test_minimal_error(self) -> None:
        """Test creating error with only required fields."""
        error = ErrorNotification(message="Something went wrong")
        assert error.type == "error"
        assert error.message == "Something went wrong"
        assert error.code is None
        assert error.details is None

    def test_full_error(self) -> None:
        """Test creating error with all fields."""
        error = ErrorNotification(
            message="Rate limit exceeded",
            code="rate_limit",
            details={"retry_after": 60, "limit": 100},
        )
        assert error.type == "error"
        assert error.message == "Rate limit exceeded"
        assert error.code == "rate_limit"
        assert error.details == {"retry_after": 60, "limit": 100}

    def test_error_serialization(self) -> None:
        """Test error serialization to dict."""
        error = ErrorNotification(message="Test error", code="test")
        data = error.model_dump()
        assert data["type"] == "error"
        assert data["message"] == "Test error"
        assert data["code"] == "test"


class TestAssistantMessage:
    """Tests for AssistantMessage model."""

    def test_assistant_delta(self) -> None:
        """Test assistant delta message."""
        msg = AssistantMessage(type="assistant_delta", content="Hello")
        assert msg.type == "assistant_delta"
        assert msg.content == "Hello"

    def test_assistant_start(self) -> None:
        """Test assistant start message."""
        msg = AssistantMessage(type="assistant_start")
        assert msg.type == "assistant_start"
        assert msg.content is None

    def test_assistant_end(self) -> None:
        """Test assistant end message."""
        msg = AssistantMessage(type="assistant_end")
        assert msg.type == "assistant_end"
        assert msg.content is None

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        msg = AssistantMessage(type="assistant_delta", content="Test")
        json_str = msg.to_json()
        data = json.loads(json_str)
        assert data["type"] == "assistant_delta"
        assert data["content"] == "Test"

    def test_to_json_excludes_none(self) -> None:
        """Test that None values are excluded from JSON."""
        msg = AssistantMessage(type="assistant_start")
        json_str = msg.to_json()
        data = json.loads(json_str)
        assert "content" not in data


class TestFunctionEventMessage:
    """Tests for FunctionEventMessage model."""

    def test_function_started(self) -> None:
        """Test function started event."""
        event = FunctionEventMessage(type="function_started", tool_call_id="call_123")
        assert event.type == "function_started"
        assert event.tool_call_id == "call_123"
        assert event.tool_success is True
        assert event.error is None
        assert event.output is None

    def test_function_completed_success(self) -> None:
        """Test successful function completion."""
        event = FunctionEventMessage(
            type="function_completed",
            tool_call_id="call_123",
            tool_success=True,
            output="Result data",
        )
        assert event.type == "function_completed"
        assert event.tool_success is True
        assert event.output == "Result data"
        assert event.error is None

    def test_function_completed_error(self) -> None:
        """Test failed function completion."""
        event = FunctionEventMessage(
            type="function_completed",
            tool_call_id="call_123",
            tool_success=False,
            error="Function failed",
        )
        assert event.type == "function_completed"
        assert event.tool_success is False
        assert event.error == "Function failed"

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        event = FunctionEventMessage(type="function_started", tool_call_id="test_id")
        json_str = event.to_json()
        data = json.loads(json_str)
        assert data["type"] == "function_started"
        assert data["tool_call_id"] == "test_id"


class TestUserInput:
    """Tests for UserInput model."""

    def test_valid_input(self) -> None:
        """Test valid user input."""
        user_input = UserInput(content="Hello, how are you?")
        assert user_input.content == "Hello, how are you?"

    def test_whitespace_stripped(self) -> None:
        """Test that whitespace is stripped from input."""
        user_input = UserInput(content="  Hello  ")
        assert user_input.content == "Hello"

    def test_empty_string_raises(self) -> None:
        """Test that empty string raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            UserInput(content="")
        # Pydantic's min_length validator triggers first
        assert "at least 1 character" in str(exc_info.value) or "Input cannot be empty" in str(exc_info.value)

    def test_whitespace_only_raises(self) -> None:
        """Test that whitespace-only string raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            UserInput(content="   ")
        assert "Input cannot be empty" in str(exc_info.value)

    def test_too_long_raises(self) -> None:
        """Test that content exceeding max length raises error."""
        with pytest.raises(ValidationError):
            UserInput(content="x" * 100001)

    def test_multiline_input(self) -> None:
        """Test multiline input is preserved."""
        content = "Line 1\nLine 2\nLine 3"
        user_input = UserInput(content=content)
        assert user_input.content == content


class TestSessionItem:
    """Tests for SessionItem model."""

    def test_user_message(self) -> None:
        """Test creating user message item."""
        item = SessionItem(role="user", content="Hello")
        assert item.role == "user"
        assert item.content == "Hello"

    def test_assistant_message(self) -> None:
        """Test creating assistant message item."""
        item = SessionItem(role="assistant", content="Hi there!")
        assert item.role == "assistant"
        assert item.content == "Hi there!"

    def test_system_message(self) -> None:
        """Test creating system message item."""
        item = SessionItem(role="system", content="You are a helpful assistant")
        assert item.role == "system"
        assert item.content == "You are a helpful assistant"

    def test_empty_content_normalized(self) -> None:
        """Test that empty content is normalized to None."""
        item = SessionItem(role="user", content="")
        assert item.content is None

    def test_list_content(self) -> None:
        """Test creating item with list content."""
        content_items = [{"text": "Part 1"}, {"text": "Part 2"}]
        item = SessionItem(role="assistant", content=content_items)
        assert item.content == content_items

    def test_to_dict(self) -> None:
        """Test conversion to dictionary."""
        item = SessionItem(role="user", content="Test")
        data = item.to_dict()
        assert data["role"] == "user"
        assert data["content"] == "Test"

    def test_to_dict_excludes_none(self) -> None:
        """Test that None values are excluded from dict."""
        item = SessionItem(role="user", content=None)
        data = item.to_dict()
        assert "content" not in data


class TestToolCallNotification:
    """Tests for ToolCallNotification model."""

    def test_tool_call_with_dict_args(self) -> None:
        """Test tool call with dict arguments."""
        notification = ToolCallNotification(
            tool_name="read_file",
            tool_arguments={"path": "/test/file.txt"},
            tool_call_id="call_123",
        )
        assert notification.tool_name == "read_file"
        assert notification.tool_arguments == {"path": "/test/file.txt"}
        assert notification.tool_call_id == "call_123"

    def test_tool_call_with_string_args(self) -> None:
        """Test tool call with string arguments."""
        notification = ToolCallNotification(
            tool_name="search_files",
            tool_arguments='{"pattern": "*.py"}',
        )
        assert notification.tool_name == "search_files"
        assert notification.tool_arguments == '{"pattern": "*.py"}'

    def test_default_type(self) -> None:
        """Test that type defaults to function_detected."""
        notification = ToolCallNotification(tool_name="test_tool", tool_arguments={})
        assert notification.type == "function_detected"


class TestToolResultNotification:
    """Tests for ToolResultNotification model."""

    def test_successful_result(self) -> None:
        """Test successful tool result."""
        notification = ToolResultNotification(
            tool_name="read_file",
            tool_result="File contents here",
            tool_call_id="call_123",
            tool_success=True,
        )
        assert notification.tool_name == "read_file"
        assert notification.tool_result == "File contents here"
        assert notification.tool_success is True

    def test_failed_result(self) -> None:
        """Test failed tool result."""
        notification = ToolResultNotification(
            tool_name="read_file",
            tool_result="Error: File not found",
            tool_success=False,
        )
        assert notification.tool_success is False

    def test_default_success(self) -> None:
        """Test that success defaults to True."""
        notification = ToolResultNotification(tool_name="test", tool_result="ok")
        assert notification.tool_success is True


class TestFunctionCallItem:
    """Tests for FunctionCallItem model."""

    def test_function_call_with_args(self) -> None:
        """Test function call with arguments."""
        item = FunctionCallItem(type="function_call", name="test_function", arguments={"key": "value"})
        assert item.type == "function_call"
        assert item.name == "test_function"
        assert item.arguments == {"key": "value"}

    def test_function_call_default_args(self) -> None:
        """Test function call with default empty arguments."""
        item = FunctionCallItem(type="function_call", name="test_function")
        assert item.arguments == "{}"

    def test_to_session_item(self) -> None:
        """Test conversion to SessionItem."""
        item = FunctionCallItem(type="function_call", name="read_file", arguments={"path": "test.txt"})
        session_item = item.to_session_item()
        assert session_item.role == "assistant"
        assert "read_file" in str(session_item.content)
        assert session_item.type == "function_call"


class TestFunctionOutputItem:
    """Tests for FunctionOutputItem model."""

    def test_successful_output(self) -> None:
        """Test function output without error."""
        item = FunctionOutputItem(type="function_call_output", output="Success result")
        assert item.type == "function_call_output"
        assert item.output == "Success result"
        assert item.error is None

    def test_error_output(self) -> None:
        """Test function output with error."""
        item = FunctionOutputItem(type="function_call_output", output="", error="Something went wrong")
        assert item.error == "Something went wrong"

    def test_to_session_item_success(self) -> None:
        """Test conversion to SessionItem for success."""
        item = FunctionOutputItem(type="function_call_output", output="File content here")
        session_item = item.to_session_item()
        assert session_item.role == "assistant"
        assert "Tool result" in str(session_item.content)
        assert "File content here" in str(session_item.content)

    def test_to_session_item_error(self) -> None:
        """Test conversion to SessionItem for error."""
        item = FunctionOutputItem(type="function_call_output", output="", error="File not found")
        session_item = item.to_session_item()
        assert "Tool error" in str(session_item.content)
        assert "File not found" in str(session_item.content)


class TestHandoffMessage:
    """Tests for HandoffMessage model."""

    def test_handoff_started(self) -> None:
        """Test handoff started message."""
        msg = HandoffMessage(type="handoff_started", target_agent="specialist")
        assert msg.type == "handoff_started"
        assert msg.target_agent == "specialist"

    def test_handoff_completed(self) -> None:
        """Test handoff completed message."""
        msg = HandoffMessage(
            type="handoff_completed",
            source_agent="specialist",
            result="Task completed",
        )
        assert msg.type == "handoff_completed"
        assert msg.source_agent == "specialist"
        assert msg.result == "Task completed"

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        msg = HandoffMessage(type="handoff_started", target_agent="test")
        json_str = msg.to_json()
        data = json.loads(json_str)
        assert data["type"] == "handoff_started"
        assert data["target_agent"] == "test"


class TestAgentUpdateMessage:
    """Tests for AgentUpdateMessage model."""

    def test_agent_updated(self) -> None:
        """Test agent update message."""
        msg = AgentUpdateMessage(type="agent_updated", name="Test Agent")
        assert msg.type == "agent_updated"
        assert msg.name == "Test Agent"

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        msg = AgentUpdateMessage(type="agent_updated", name="Test Agent")
        json_str = msg.to_json()
        data = json.loads(json_str)
        assert data["type"] == "agent_updated"
        assert data["name"] == "Test Agent"
