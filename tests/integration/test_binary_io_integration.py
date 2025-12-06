"""Integration tests for binary I/O protocol V2.

These validate end-to-end stdin/stdout piping between processes; unit tests alone
are insufficient to catch pipe/encoding regressions.
"""

from __future__ import annotations

import struct
import subprocess
import sys
import time

from contextlib import suppress
from pathlib import Path
from typing import Any

import msgpack
import pytest

# Path to main.py
PROJECT_ROOT = Path(__file__).parent.parent.parent
MAIN_PY = PROJECT_ROOT / "src" / "main.py"


def encode_v2_message(message: dict[str, Any]) -> bytes:
    """Encode a message using V2 binary protocol."""
    payload = msgpack.packb(message, use_bin_type=True)
    header = struct.pack("!H", 2)  # version
    header += struct.pack("B", 0)  # flags
    header += struct.pack("!I", len(payload))  # length
    result: bytes = header + payload
    return result


def decode_v2_message(binary_data: bytes) -> dict[str, Any]:
    """Decode a V2 binary message."""
    if len(binary_data) < 7:
        raise ValueError(f"Message too short: {len(binary_data)} bytes")

    version = struct.unpack("!H", binary_data[0:2])[0]
    length = struct.unpack("!I", binary_data[3:7])[0]
    if version != 2:
        raise ValueError(f"Unsupported protocol version: {version}")
    if len(binary_data) < 7 + length:
        raise ValueError(f"Incomplete payload: got {len(binary_data) - 7}, expected {length}")

    payload = binary_data[7 : 7 + length]
    decoded = msgpack.unpackb(payload, raw=False)
    if not isinstance(decoded, dict):
        raise ValueError(f"Expected dict from MessagePack, got {type(decoded)}")
    return decoded


@pytest.mark.integration
def test_binary_stdin_stdout_protocol_negotiation() -> None:
    """Verify protocol negotiation works over subprocess pipes."""
    proc = subprocess.Popen(
        [sys.executable, str(MAIN_PY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    try:
        assert proc.stdin is not None
        assert proc.stdout is not None

        negotiation = {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "1.0.0-test"}
        proc.stdin.write(encode_v2_message(negotiation))
        proc.stdin.flush()

        header = proc.stdout.read(7)
        assert len(header) == 7

        version = struct.unpack("!H", header[0:2])[0]
        length = struct.unpack("!I", header[3:7])[0]
        assert version == 2
        assert 0 < length < 10000

        payload = proc.stdout.read(length)
        assert len(payload) == length

        response = msgpack.unpackb(payload, raw=False)
        assert response["type"] == "protocol_negotiation_response"
        assert response["selected_version"] == 2
        assert "server_version" in response
    finally:
        with suppress(subprocess.TimeoutExpired, PermissionError, OSError):
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=2)
        with suppress(PermissionError, OSError):
            if proc.poll() is None:
                proc.kill()


@pytest.mark.integration
def test_binary_message_encoding() -> None:
    """Ensure messages encode/decode correctly."""
    messages: list[dict[str, Any]] = [
        {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "1.0.0"},
        {"type": "session", "command": "list", "params": {}},
        {"type": "message", "role": "user", "content": "Test message"},
    ]

    for msg in messages:
        encoded = encode_v2_message(msg)
        assert struct.unpack("!H", encoded[0:2])[0] == 2
        decoded = decode_v2_message(encoded)
        assert decoded["type"] == msg["type"]


@pytest.mark.integration
def test_malformed_binary_handling() -> None:
    """Backend should not crash on malformed binary."""
    proc = subprocess.Popen(
        [sys.executable, str(MAIN_PY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    try:
        assert proc.stdin is not None
        proc.stdin.write(b"\x00\x00\x00\x00\x00\x00\x00\xff\xff\xff")
        proc.stdin.flush()
        time.sleep(0.5)
        assert proc.poll() is None
    finally:
        with suppress(subprocess.TimeoutExpired, PermissionError, OSError):
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=2)
        with suppress(PermissionError, OSError):
            if proc.poll() is None:
                proc.kill()


@pytest.mark.integration
def test_error_recovery_incomplete_header() -> None:
    incomplete = b"\x00\x02\x00\x00"
    with pytest.raises(ValueError, match="Message too short"):
        decode_v2_message(incomplete)


@pytest.mark.integration
def test_error_recovery_incomplete_payload() -> None:
    header = struct.pack("!H", 2) + struct.pack("B", 0) + struct.pack("!I", 1000)
    incomplete = header + b"x" * 10
    with pytest.raises(ValueError, match="Incomplete payload"):
        decode_v2_message(incomplete)


@pytest.mark.integration
def test_error_recovery_corrupted_msgpack() -> None:
    payload = b"\xff\xff\xff\xff\xff"
    header = struct.pack("!H", 2) + struct.pack("B", 0) + struct.pack("!I", len(payload))
    corrupted = header + payload
    with pytest.raises((ValueError, msgpack.exceptions.UnpackException)):
        decode_v2_message(corrupted)


@pytest.mark.integration
def test_error_recovery_wrong_version() -> None:
    payload = msgpack.packb({"type": "test"}, use_bin_type=True)
    header = struct.pack("!H", 99) + struct.pack("B", 0) + struct.pack("!I", len(payload))
    wrong_version = header + payload
    with pytest.raises(ValueError, match="Unsupported protocol version"):
        decode_v2_message(wrong_version)


@pytest.mark.integration
def test_binary_data_edge_cases() -> None:
    """Binary encodes/decodes unusual byte content."""
    edge_cases: list[dict[str, Any]] = [
        {"type": "message", "content": "null\x00byte"},
        {"type": "message", "content": "high\xff\xfebytes"},
        {"type": "message", "content": "unicode: 日本語 한국어"},
        {"type": "message", "content": "emoji: 👋🎉🚀"},
        {"type": "message", "content": "mixed: \x00\xff日本語👋"},
        {"type": "message", "content": "newlines:\n\r\n\r"},
        {"type": "message", "content": "tabs:\t\t\t"},
        {"type": "message", "content": 'json: {"key": "value"}'},
    ]

    for msg in edge_cases:
        encoded = encode_v2_message(msg)
        decoded = decode_v2_message(encoded)
        assert decoded["content"] == msg["content"]


@pytest.mark.integration
def test_multiple_messages_concatenated() -> None:
    """Decode multiple concatenated messages."""
    messages: list[dict[str, Any]] = [
        {"type": "message", "content": "First"},
        {"type": "message", "content": "Second"},
        {"type": "message", "content": "Third"},
    ]

    encoded_concat = b"".join(encode_v2_message(msg) for msg in messages)
    offset = 0
    decoded_messages = []

    while offset < len(encoded_concat):
        header = encoded_concat[offset : offset + 7]
        if len(header) < 7:
            break
        length = struct.unpack("!I", header[3:7])[0]
        total_size = 7 + length
        msg_bytes = encoded_concat[offset : offset + total_size]
        decoded_messages.append(decode_v2_message(msg_bytes))
        offset += total_size

    assert len(decoded_messages) == 3
    assert decoded_messages[0]["content"] == "First"
    assert decoded_messages[1]["content"] == "Second"
    assert decoded_messages[2]["content"] == "Third"
