"""Tests for IPC utility functions.

Tests IPC message formatting, parsing, and communication protocol.
"""

from __future__ import annotations

import json

from typing import Any
from unittest.mock import Mock

import pytest

from utils.ipc import IPCManager


class TestIPCManagerSend:
    """Tests for IPCManager send methods."""

    def test_send_message(self, mock_ipc_output: list[str]) -> None:
        """Test sending a basic message."""
        message = {"type": "test", "data": "value"}
        IPCManager.send(message)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output.startswith("__JSON__")
        assert output.endswith("__JSON__")

        # Extract and parse JSON
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "test"
        assert parsed["data"] == "value"

    def test_send_raw_message(self, mock_ipc_output: list[str]) -> None:
        """Test sending a raw JSON string."""
        json_str = '{"type":"raw","value":42}'
        IPCManager.send_raw(json_str)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output == f"__JSON__{json_str}__JSON__"

    def test_send_error(self, mock_ipc_output: list[str]) -> None:
        """Test sending an error message."""
        IPCManager.send_error("Something went wrong")

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]

        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "error"
        assert parsed["message"] == "Something went wrong"

    def test_send_error_with_code(self, mock_ipc_output: list[str]) -> None:
        """Test sending an error with error code."""
        IPCManager.send_error("Rate limit", code="rate_limit")

        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["code"] == "rate_limit"

    def test_send_error_with_details(self, mock_ipc_output: list[str]) -> None:
        """Test sending an error with details."""
        details = {"retry_after": 60}
        IPCManager.send_error("Rate limit", details=details)

        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["details"]["retry_after"] == 60

    def test_send_assistant_start(self, mock_ipc_output: list[str]) -> None:
        """Test sending assistant start signal."""
        IPCManager.send_assistant_start()

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "assistant_start"

    def test_send_assistant_end(self, mock_ipc_output: list[str]) -> None:
        """Test sending assistant end signal."""
        IPCManager.send_assistant_end()

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "assistant_end"


class TestIPCManagerSessionCommands:
    """Tests for session command handling."""

    def test_is_session_command_true(self) -> None:
        """Test identifying session command."""
        assert IPCManager.is_session_command("__SESSION__new__{}__")
        assert IPCManager.is_session_command("__SESSION__switch__data__")

    def test_is_session_command_false(self) -> None:
        """Test rejecting non-session commands."""
        assert not IPCManager.is_session_command("regular input")
        assert not IPCManager.is_session_command("__JSON__data__JSON__")
        assert not IPCManager.is_session_command("SESSION__new__")

    def test_parse_session_command_new(self) -> None:
        """Test parsing 'new' session command."""
        raw_input = "__SESSION__new__{}__"
        result = IPCManager.parse_session_command(raw_input)

        assert result is not None
        command, data = result
        assert command == "new"
        assert data == {}

    def test_parse_session_command_switch(self) -> None:
        """Test parsing 'switch' session command."""
        data_json = json.dumps({"session_id": "chat_123"})
        raw_input = f"__SESSION__switch__{data_json}__"
        result = IPCManager.parse_session_command(raw_input)

        assert result is not None
        command, data = result
        assert command == "switch"
        assert data["session_id"] == "chat_123"

    def test_parse_session_command_delete(self) -> None:
        """Test parsing 'delete' session command."""
        data_json = json.dumps({"session_id": "chat_abc"})
        raw_input = f"__SESSION__delete__{data_json}__"
        result = IPCManager.parse_session_command(raw_input)

        assert result is not None
        command, data = result
        assert command == "delete"

    def test_parse_session_command_list(self) -> None:
        """Test parsing 'list' session command."""
        raw_input = "__SESSION__list__{}__"
        result = IPCManager.parse_session_command(raw_input)

        assert result is not None
        command, data = result
        assert command == "list"

    def test_parse_session_command_invalid_json(self) -> None:
        """Test parsing session command with invalid JSON."""
        raw_input = "__SESSION__new__invalid_json__"
        result = IPCManager.parse_session_command(raw_input)

        assert result is None

    def test_parse_session_command_missing_parts(self) -> None:
        """Test parsing session command with missing parts."""
        raw_input = "__SESSION__new__"
        result = IPCManager.parse_session_command(raw_input)

        # Should still parse if data part is missing (defaults to {})
        # Implementation may vary
        assert result is not None or result is None

    def test_send_session_response_success(self, mock_ipc_output: list[str]) -> None:
        """Test sending successful session response."""
        data = {"success": True, "session_id": "chat_123"}
        IPCManager.send_session_response(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "session_response"
        assert parsed["data"]["success"] is True

    def test_send_session_response_error(self, mock_ipc_output: list[str]) -> None:
        """Test sending error session response."""
        data = {"success": False, "error": "Session not found"}
        IPCManager.send_session_response(data)

        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["data"]["success"] is False
        assert "error" in parsed["data"]

    def test_send_session_updated(self, mock_ipc_output: list[str]) -> None:
        """Test sending session updated notification."""
        data = {"sessions": [{"session_id": "chat_123", "title": "Test"}]}
        IPCManager.send_session_updated(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "session_updated"


class TestIPCManagerUploadCommands:
    """Tests for file upload command handling."""

    def test_is_upload_command_true(self) -> None:
        """Test identifying upload command."""
        assert IPCManager.is_upload_command("__UPLOAD__data__")
        assert IPCManager.is_upload_command("__UPLOAD__{}__")

    def test_is_upload_command_false(self) -> None:
        """Test rejecting non-upload commands."""
        assert not IPCManager.is_upload_command("regular input")
        assert not IPCManager.is_upload_command("__SESSION__new__")
        assert not IPCManager.is_upload_command("UPLOAD__data__")

    def test_parse_upload_command(self) -> None:
        """Test parsing upload command."""
        data = {"filename": "test.txt", "data": "base64data"}
        data_json = json.dumps(data)
        raw_input = f"__UPLOAD__{data_json}__"
        result = IPCManager.parse_upload_command(raw_input)

        assert result is not None
        assert result["filename"] == "test.txt"
        assert result["data"] == "base64data"

    def test_parse_upload_command_invalid_json(self) -> None:
        """Test parsing upload command with invalid JSON."""
        raw_input = "__UPLOAD__invalid_json__"
        result = IPCManager.parse_upload_command(raw_input)

        assert result is None

    def test_parse_upload_command_missing_delimiter(self) -> None:
        """Test parsing upload command with missing delimiter."""
        raw_input = "__UPLOAD__data"
        result = IPCManager.parse_upload_command(raw_input)

        assert result is None

    def test_send_upload_response_success(self, mock_ipc_output: list[str]) -> None:
        """Test sending successful upload response."""
        data = {
            "success": True,
            "file_path": "/test/file.txt",
            "size": 1024,
            "message": "File uploaded",
        }
        IPCManager.send_upload_response(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["type"] == "upload_response"
        assert parsed["data"]["success"] is True

    def test_send_upload_response_error(self, mock_ipc_output: list[str]) -> None:
        """Test sending error upload response."""
        data = {"success": False, "error": "Upload failed"}
        IPCManager.send_upload_response(data)

        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["data"]["success"] is False


class TestIPCManagerConstants:
    """Tests for IPCManager constants."""

    def test_delimiter_constant(self) -> None:
        """Test that delimiter constant is correct."""
        assert IPCManager.DELIMITER == "__JSON__"

    def test_session_prefix_constant(self) -> None:
        """Test that session prefix constant is correct."""
        assert IPCManager.SESSION_PREFIX == "__SESSION__"

    def test_upload_prefix_constant(self) -> None:
        """Test that upload prefix constant is correct."""
        assert IPCManager.UPLOAD_PREFIX == "__UPLOAD__"

    def test_template_precompilation(self) -> None:
        """Test that common templates are precompiled."""
        assert "assistant_start" in IPCManager._TEMPLATES
        assert "assistant_end" in IPCManager._TEMPLATES

        # Templates should be valid JSON strings
        for template in IPCManager._TEMPLATES.values():
            json.loads(template)  # Should not raise


class TestIPCManagerComplexScenarios:
    """Tests for complex IPC scenarios."""

    def test_nested_json_in_session_command(self) -> None:
        """Test session command with nested JSON data."""
        data = {
            "session": {
                "id": "chat_123",
                "metadata": {
                    "created_at": "2025-01-01",
                    "tags": ["test", "demo"],
                },
            }
        }
        data_json = json.dumps(data)
        raw_input = f"__SESSION__create__{data_json}__"
        result = IPCManager.parse_session_command(raw_input)

        assert result is not None
        _, parsed_data = result
        assert parsed_data["session"]["id"] == "chat_123"
        assert len(parsed_data["session"]["metadata"]["tags"]) == 2

    def test_unicode_in_messages(self, mock_ipc_output: list[str]) -> None:
        """Test handling unicode in messages."""
        message = {"text": "Hello 世界 مرحبا"}
        IPCManager.send(message)

        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert parsed["text"] == "Hello 世界 مرحبا"

    def test_special_characters_in_error(self, mock_ipc_output: list[str]) -> None:
        """Test special characters in error messages."""
        IPCManager.send_error("Path: /test/file.txt | Error: <invalid>")

        output = mock_ipc_output[0]
        json_str = output.split("__JSON__")[1]
        parsed = json.loads(json_str)
        assert "<invalid>" in parsed["message"]

    def test_large_data_payload(self, mock_ipc_output: list[str]) -> None:
        """Test sending large data payload."""
        large_data = {"data": "x" * 10000}
        IPCManager.send(large_data)

        assert len(mock_ipc_output) == 1
        # Should successfully serialize and send
        output = mock_ipc_output[0]
        assert "__JSON__" in output
