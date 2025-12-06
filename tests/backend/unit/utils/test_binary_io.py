from __future__ import annotations

import io
import struct
import sys
import types

from typing import cast

import msgpack
import pytest

from utils.binary_io import FLAG_COMPRESSED, PROTOCOL_VERSION, BinaryIOError, read_message, write_message


def _set_stdio(monkeypatch: pytest.MonkeyPatch, data: bytes) -> None:
    """Helper to point stdin/stdout at in-memory streams."""
    monkeypatch.setattr(sys, "stdin", types.SimpleNamespace(buffer=io.BytesIO(data)))
    monkeypatch.setattr(sys, "stdout", types.SimpleNamespace(buffer=io.BytesIO()))


def test_read_write_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure messages roundtrip without compression and keep content."""
    _set_stdio(monkeypatch, b"")
    original = {"type": "ping", "data": 123}

    write_message(original)
    raw = cast(io.BytesIO, sys.stdout.buffer).getvalue()

    monkeypatch.setattr(sys.stdin, "buffer", io.BytesIO(raw))
    result = read_message()

    # Strip metadata added on read for comparison
    parsed = {k: v for k, v in result.items() if not k.startswith("_")}
    assert parsed == original
    assert result["_compressed"] is False
    assert result["_size"] == len(raw) - 7  # header is 7 bytes


def test_write_sets_compression_flag_for_large_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Large payloads should be compressed when beneficial."""
    _set_stdio(monkeypatch, b"")
    payload = {"type": "bulk", "blob": "x" * 5000}

    write_message(payload)
    raw = cast(io.BytesIO, sys.stdout.buffer).getvalue()

    flags = raw[2]
    assert flags & FLAG_COMPRESSED, "Expected compression flag to be set for large payloads"


def test_read_rejects_unknown_protocol_version(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reading a message with an unexpected protocol version should fail."""
    body = msgpack.packb({"type": "ping"}, use_bin_type=True)
    header = struct.pack("!H", PROTOCOL_VERSION + 1)  # wrong version
    header += struct.pack("B", 0)
    header += struct.pack("!I", len(body))

    _set_stdio(monkeypatch, header + body)

    with pytest.raises(BinaryIOError):
        read_message()
