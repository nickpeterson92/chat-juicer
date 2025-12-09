from __future__ import annotations

from typing import Any

import pytest

from utils.ipc import IPCManager


def test_send_raw_invalid_json(mock_ipc_output: list[dict[str, Any]]) -> None:
    """send_raw should wrap invalid JSON as raw content."""
    IPCManager.send_raw("not-json")

    assert len(mock_ipc_output) == 1
    output = mock_ipc_output[0]
    assert output["type"] == "raw"
    assert output["content"] == "not-json"


def test_send_session_response_serialization_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """send_session_response should fall back to error payload when serialization fails."""
    calls: list[dict[str, Any]] = []

    def flaky_write(payload: dict[str, Any]) -> None:
        calls.append(payload)
        if len(calls) == 1:
            raise ValueError("boom")

    monkeypatch.setattr("utils.ipc.write_message", flaky_write)

    IPCManager.send_session_response({"success": True}, session_id="chat_123")

    assert len(calls) == 2, "Expected retry with error payload after serialization failure"
    assert calls[1]["data"]["error"].startswith("Serialization failed")
    assert calls[1]["session_id"] == "chat_123"


def test_send_session_updated_serialization_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """send_session_updated should swallow serialization errors and still log."""
    calls: list[dict[str, Any]] = []

    def flaky_write(payload: dict[str, Any]) -> None:
        calls.append(payload)
        if len(calls) == 1:
            raise RuntimeError("serialize fail")

    monkeypatch.setattr("utils.ipc.write_message", flaky_write)

    # Should not raise
    IPCManager.send_session_updated({"sessions": []}, session_id="chat_456")

    # Only the first attempt should have been made; second write is skipped by design
    assert len(calls) == 1
    assert calls[0]["type"] == "session_updated"
