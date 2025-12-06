"""Tests for IPC utility functions.

Tests IPC message formatting and communication protocol.
Protocol V2 uses binary MessagePack encoding with length-prefixed framing.
"""

from __future__ import annotations

from typing import Any

from utils.ipc import IPCManager


class TestIPCManagerSend:
    """Tests for IPCManager send methods."""

    def test_send_message(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending a basic message."""
        message = {"type": "test", "data": "value"}
        IPCManager.send(message)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "test"
        assert output["data"] == "value"

    def test_send_raw_message(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending a raw JSON string (converted to dict for V2)."""
        json_str = '{"type":"raw","value":42}'
        IPCManager.send_raw(json_str)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "raw"
        assert output["value"] == 42

    def test_send_error(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending an error message."""
        IPCManager.send_error("Something went wrong")

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "error"
        assert output["message"] == "Something went wrong"

    def test_send_error_with_code(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending an error with error code."""
        IPCManager.send_error("Rate limit", code="rate_limit")

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["code"] == "rate_limit"

    def test_send_error_with_details(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending an error with details."""
        details = {"retry_after": 60}
        IPCManager.send_error("Rate limit", details=details)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["details"]["retry_after"] == 60

    def test_send_assistant_start(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending assistant start signal."""
        IPCManager.send_assistant_start()

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "assistant_start"

    def test_send_assistant_end(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending assistant end signal."""
        IPCManager.send_assistant_end()

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "assistant_end"


class TestIPCManagerSessionResponses:
    """Tests for session response methods."""

    def test_send_session_response_success(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending successful session response."""
        data = {"success": True, "session_id": "chat_123"}
        IPCManager.send_session_response(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "session_response"
        assert output["data"]["success"] is True

    def test_send_session_response_error(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending error session response."""
        data = {"success": False, "error": "Session not found"}
        IPCManager.send_session_response(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["data"]["success"] is False
        assert "error" in output["data"]

    def test_send_session_updated(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending session updated notification."""
        data = {"sessions": [{"session_id": "chat_123", "title": "Test"}]}
        IPCManager.send_session_updated(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["type"] == "session_updated"


class TestIPCManagerUploadResponses:
    """Tests for file upload response methods."""

    def test_send_upload_response_success(self, mock_ipc_output: list[dict[str, Any]]) -> None:
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
        assert output["type"] == "upload_response"
        assert output["data"]["success"] is True

    def test_send_upload_response_error(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending error upload response."""
        data = {"success": False, "error": "Upload failed"}
        IPCManager.send_upload_response(data)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["data"]["success"] is False


class TestIPCManagerTemplates:
    """Tests for IPCManager templates."""

    def test_template_precompilation(self) -> None:
        """Test that common templates are precompiled as dicts."""
        assert "assistant_start" in IPCManager._TEMPLATES
        assert "assistant_end" in IPCManager._TEMPLATES

        # Templates should be valid dicts for V2 binary protocol
        for template in IPCManager._TEMPLATES.values():
            assert isinstance(template, dict)
            assert "type" in template


class TestIPCManagerComplexScenarios:
    """Tests for complex IPC scenarios."""

    def test_unicode_in_messages(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test handling unicode in messages."""
        message = {"text": "Hello 世界 مرحبا"}
        IPCManager.send(message)

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert output["text"] == "Hello 世界 مرحبا"

    def test_special_characters_in_error(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test special characters in error messages."""
        IPCManager.send_error("Path: /test/file.txt | Error: <invalid>")

        assert len(mock_ipc_output) == 1
        output = mock_ipc_output[0]
        assert "<invalid>" in output["message"]

    def test_large_data_payload(self, mock_ipc_output: list[dict[str, Any]]) -> None:
        """Test sending large data payload."""
        large_data = {"data": "x" * 10000}
        IPCManager.send(large_data)

        assert len(mock_ipc_output) == 1
        # Should successfully serialize and send
        output = mock_ipc_output[0]
        assert len(output["data"]) == 10000
