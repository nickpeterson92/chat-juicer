"""Tests for session models module.

Tests Pydantic models used for session management and metadata.
"""

from __future__ import annotations

import json

from datetime import datetime

import pytest

from pydantic import ValidationError

from models.session_models import (
    CreateSessionCommand,
    DeleteSessionCommand,
    ListSessionsCommand,
    RenameSessionCommand,
    SessionMetadata,
    SessionUpdate,
    SummarizeSessionCommand,
    SwitchSessionCommand,
)


class TestSessionMetadata:
    """Tests for SessionMetadata model."""

    def test_minimal_session_metadata(self, mock_env: dict[str, str]) -> None:
        """Test creating session metadata with only required fields."""
        metadata = SessionMetadata(session_id="chat_test123")
        assert metadata.session_id == "chat_test123"
        assert metadata.title == "New Conversation"
        assert metadata.is_named is False
        assert metadata.pinned is False
        assert metadata.message_count == 0
        assert metadata.accumulated_tool_tokens == 0

    def test_full_session_metadata(self) -> None:
        """Test creating session metadata with all fields."""
        metadata = SessionMetadata(
            session_id="chat_abc123",
            title="My Test Session",
            is_named=True,
            created_at="2025-01-01T12:00:00",
            last_used="2025-01-01T13:00:00",
            pinned=True,
            message_count=10,
            accumulated_tool_tokens=150,
            mcp_config=["sequential", "fetch"],
            model="gpt-4o",
            reasoning_effort="high",
        )
        assert metadata.session_id == "chat_abc123"
        assert metadata.title == "My Test Session"
        assert metadata.is_named is True
        assert metadata.pinned is True
        assert metadata.message_count == 10
        assert metadata.accumulated_tool_tokens == 150
        assert metadata.mcp_config == ["sequential", "fetch"]
        assert metadata.model == "gpt-4o"
        assert metadata.reasoning_effort == "high"

    def test_session_id_validation_fails_without_prefix(self) -> None:
        """Test that session_id without 'chat_' prefix raises error."""
        with pytest.raises(ValidationError) as exc_info:
            SessionMetadata(session_id="invalid_id")
        assert "session_id must start with 'chat_'" in str(exc_info.value)

    def test_session_id_validation_passes_with_prefix(self) -> None:
        """Test that session_id with 'chat_' prefix is valid."""
        metadata = SessionMetadata(session_id="chat_123")
        assert metadata.session_id == "chat_123"

    def test_invalid_timestamp_raises_error(self) -> None:
        """Test that invalid ISO timestamp raises error."""
        with pytest.raises(ValidationError):
            SessionMetadata(
                session_id="chat_test",
                created_at="not-a-timestamp",
            )

    def test_negative_message_count_raises_error(self) -> None:
        """Test that negative message count raises error."""
        with pytest.raises(ValidationError):
            SessionMetadata(
                session_id="chat_test",
                message_count=-1,
            )

    def test_negative_tool_tokens_raises_error(self) -> None:
        """Test that negative tool tokens raises error."""
        with pytest.raises(ValidationError):
            SessionMetadata(
                session_id="chat_test",
                accumulated_tool_tokens=-10,
            )

    def test_invalid_reasoning_effort_raises_error(self) -> None:
        """Test that invalid reasoning effort raises error."""
        with pytest.raises(ValidationError) as exc_info:
            SessionMetadata(
                session_id="chat_test",
                reasoning_effort="invalid",
            )
        assert "reasoning_effort must be one of" in str(exc_info.value)

    @pytest.mark.parametrize(
        "effort",
        ["none", "low", "medium", "high"],
    )
    def test_valid_reasoning_efforts(self, effort: str) -> None:
        """Test all valid reasoning effort values."""
        metadata = SessionMetadata(
            session_id="chat_test",
            reasoning_effort=effort,
        )
        assert metadata.reasoning_effort == effort

    def test_title_too_long_raises_error(self) -> None:
        """Test that title exceeding max length raises error."""
        with pytest.raises(ValidationError):
            SessionMetadata(
                session_id="chat_test",
                title="x" * 201,
            )

    def test_empty_title_raises_error(self) -> None:
        """Test that empty title raises error."""
        with pytest.raises(ValidationError):
            SessionMetadata(
                session_id="chat_test",
                title="",
            )

    def test_to_json(self) -> None:
        """Test JSON serialization."""
        metadata = SessionMetadata(
            session_id="chat_test",
            title="Test Session",
            message_count=5,
        )
        json_str = metadata.to_json()
        data = json.loads(json_str)
        assert data["session_id"] == "chat_test"
        assert data["title"] == "Test Session"
        assert data["message_count"] == 5

    def test_default_timestamps_are_iso_format(self) -> None:
        """Test that default timestamps are valid ISO format."""
        metadata = SessionMetadata(session_id="chat_test")
        # Should not raise
        datetime.fromisoformat(metadata.created_at)
        datetime.fromisoformat(metadata.last_used)

    def test_mcp_config_defaults(self, mock_env: dict[str, str]) -> None:
        """Test that mcp_config has proper defaults."""
        metadata = SessionMetadata(session_id="chat_test")
        assert isinstance(metadata.mcp_config, list)
        assert len(metadata.mcp_config) > 0


class TestSessionUpdate:
    """Tests for SessionUpdate dataclass."""

    def test_empty_update(self) -> None:
        """Test creating update with no fields set."""
        update = SessionUpdate()
        assert update.title is None
        assert update.last_used is None
        assert update.pinned is None
        assert update.message_count is None
        assert update.accumulated_tool_tokens is None
        assert not update.has_updates()

    def test_title_update(self) -> None:
        """Test update with only title."""
        update = SessionUpdate(title="New Title")
        assert update.title == "New Title"
        assert update.has_updates()

    def test_last_used_update(self) -> None:
        """Test update with only last_used."""
        timestamp = datetime.now().isoformat()
        update = SessionUpdate(last_used=timestamp)
        assert update.last_used == timestamp
        assert update.has_updates()

    def test_message_count_update(self) -> None:
        """Test update with only message_count."""
        update = SessionUpdate(message_count=42)
        assert update.message_count == 42
        assert update.has_updates()

    def test_tool_tokens_update(self) -> None:
        """Test update with only accumulated_tool_tokens."""
        update = SessionUpdate(accumulated_tool_tokens=100)
        assert update.accumulated_tool_tokens == 100
        assert update.has_updates()

    def test_multiple_updates(self) -> None:
        """Test update with multiple fields."""
        update = SessionUpdate(
            title="Updated Title",
            message_count=10,
            accumulated_tool_tokens=50,
            pinned=True,
        )
        assert update.title == "Updated Title"
        assert update.message_count == 10
        assert update.accumulated_tool_tokens == 50
        assert update.pinned is True
        assert update.has_updates()

    def test_has_updates_with_zero_values(self) -> None:
        """Test that has_updates returns True even with zero values."""
        update = SessionUpdate(message_count=0)
        assert update.has_updates()  # Zero is a valid update


class TestCreateSessionCommand:
    """Tests for CreateSessionCommand model."""

    def test_minimal_create_command(self) -> None:
        """Test create command with defaults."""
        cmd = CreateSessionCommand()
        assert cmd.command == "new"
        assert cmd.title is None
        assert cmd.mcp_config is None
        assert cmd.model is None
        assert cmd.reasoning_effort is None

    def test_create_command_with_title(self) -> None:
        """Test create command with custom title."""
        cmd = CreateSessionCommand(title="My Session")
        assert cmd.title == "My Session"

    def test_create_command_with_mcp_config(self) -> None:
        """Test create command with MCP config."""
        cmd = CreateSessionCommand(mcp_config=["sequential"])
        assert cmd.mcp_config == ["sequential"]

    def test_create_command_with_all_options(self) -> None:
        """Test create command with all options."""
        cmd = CreateSessionCommand(
            title="Test Session",
            mcp_config=["sequential", "fetch"],
            model="gpt-4o",
            reasoning_effort="high",
        )
        assert cmd.title == "Test Session"
        assert cmd.mcp_config == ["sequential", "fetch"]
        assert cmd.model == "gpt-4o"
        assert cmd.reasoning_effort == "high"

    def test_title_too_long_raises_error(self) -> None:
        """Test that title exceeding max length raises error."""
        with pytest.raises(ValidationError):
            CreateSessionCommand(title="x" * 201)


class TestSwitchSessionCommand:
    """Tests for SwitchSessionCommand model."""

    def test_switch_command(self) -> None:
        """Test switch session command."""
        cmd = SwitchSessionCommand(session_id="chat_abc123")
        assert cmd.command == "switch"
        assert cmd.session_id == "chat_abc123"

    def test_switch_command_requires_session_id(self) -> None:
        """Test that session_id is required."""
        with pytest.raises(ValidationError):
            SwitchSessionCommand()


class TestDeleteSessionCommand:
    """Tests for DeleteSessionCommand model."""

    def test_delete_command(self) -> None:
        """Test delete session command."""
        cmd = DeleteSessionCommand(session_id="chat_test123")
        assert cmd.command == "delete"
        assert cmd.session_id == "chat_test123"

    def test_delete_command_requires_session_id(self) -> None:
        """Test that session_id is required."""
        with pytest.raises(ValidationError):
            DeleteSessionCommand()


class TestListSessionsCommand:
    """Tests for ListSessionsCommand model."""

    def test_list_command_defaults(self) -> None:
        """Test list command with defaults."""
        cmd = ListSessionsCommand()
        assert cmd.command == "list"
        assert cmd.limit is None
        assert cmd.offset == 0

    def test_list_command_with_limit(self) -> None:
        """Test list command with limit."""
        cmd = ListSessionsCommand(limit=10)
        assert cmd.limit == 10

    def test_list_command_with_offset(self) -> None:
        """Test list command with offset."""
        cmd = ListSessionsCommand(offset=5)
        assert cmd.offset == 5

    def test_list_command_with_limit_and_offset(self) -> None:
        """Test list command with both limit and offset."""
        cmd = ListSessionsCommand(limit=20, offset=10)
        assert cmd.limit == 20
        assert cmd.offset == 10


class TestRenameSessionCommand:
    """Tests for RenameSessionCommand model."""

    def test_rename_command(self) -> None:
        """Test rename session command."""
        cmd = RenameSessionCommand(
            session_id="chat_test",
            title="New Title",
        )
        assert cmd.command == "rename"
        assert cmd.session_id == "chat_test"
        assert cmd.title == "New Title"

    def test_rename_command_requires_fields(self) -> None:
        """Test that required fields must be provided."""
        with pytest.raises(ValidationError):
            RenameSessionCommand()

    def test_rename_title_validation(self) -> None:
        """Test title validation on rename."""
        with pytest.raises(ValidationError):
            RenameSessionCommand(
                session_id="chat_test",
                title="",  # Empty title should fail
            )


class TestSummarizeSessionCommand:
    """Tests for SummarizeSessionCommand model."""

    def test_summarize_session_command_defaults(self) -> None:
        """Test summarize session command with defaults."""
        cmd = SummarizeSessionCommand()
        assert cmd.command == "summarize"

    def test_summarize_session_command_json(self) -> None:
        """Test summarize session command JSON serialization."""
        cmd = SummarizeSessionCommand()
        json_str = cmd.to_json()
        assert "summarize" in json_str


class TestContentTypes:
    """Tests for content type models (TextContent, ImageContent, etc)."""

    def test_text_content(self) -> None:
        """Test TextContent model."""
        from models.session_models import TextContent

        item = TextContent(type="text", text="Hello world")
        assert item.text == "Hello world"
        assert item.type == "text"

    def test_image_content(self) -> None:
        """Test ImageContent model."""
        from models.session_models import ImageContent

        item = ImageContent(type="image_url", image_url={"url": "https://example.com/image.png"})
        assert item.type == "image_url"
        assert item.image_url["url"] == "https://example.com/image.png"

    def test_refusal_content(self) -> None:
        """Test RefusalContent model."""
        from models.session_models import RefusalContent

        item = RefusalContent(type="refusal", refusal="I cannot help with that")
        assert item.type == "refusal"
        assert item.refusal == "I cannot help with that"
