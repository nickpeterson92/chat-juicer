from __future__ import annotations

import io
import struct
import sys
import types
import zlib

import msgpack
import pytest

from utils.binary_io import (
    FLAG_COMPRESSED,
    PROTOCOL_VERSION,
    BinaryIOError,
    read_message,
    write_message,
)


def _set_stdio(monkeypatch: pytest.MonkeyPatch, data: bytes) -> None:
    """Point stdin/stdout at in-memory buffers."""
    monkeypatch.setattr(sys, "stdin", types.SimpleNamespace(buffer=io.BytesIO(data)))
    monkeypatch.setattr(sys, "stdout", types.SimpleNamespace(buffer=io.BytesIO()))


def test_read_incomplete_header(monkeypatch: pytest.MonkeyPatch) -> None:
    """Should reject messages that do not contain the full 7-byte header."""
    _set_stdio(monkeypatch, b"\x00\x02\x00")
    with pytest.raises(BinaryIOError):
        read_message()


def test_read_incomplete_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Should reject payloads shorter than declared length."""
    body = msgpack.packb({"type": "ping"}, use_bin_type=True)
    header = struct.pack("!H", PROTOCOL_VERSION)
    header += struct.pack("B", 0)
    header += struct.pack("!I", len(body) + 5)  # declare more bytes than provided
    _set_stdio(monkeypatch, header + body)

    with pytest.raises(BinaryIOError):
        read_message()


def test_read_compressed_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Should decompress payloads when compression flag is set."""
    body = msgpack.packb({"type": "pong"}, use_bin_type=True)
    compressed = zlib.compress(body)
    header = struct.pack("!H", PROTOCOL_VERSION)
    header += struct.pack("B", FLAG_COMPRESSED)
    header += struct.pack("!I", len(compressed))
    _set_stdio(monkeypatch, header + compressed)

    result = read_message()
    assert result["type"] == "pong"
    assert result["_compressed"] is True


def test_read_invalid_messagepack_type(monkeypatch: pytest.MonkeyPatch) -> None:
    """Should raise when MessagePack payload is not a dict."""
    payload = msgpack.packb(123, use_bin_type=True)  # not a dict
    header = struct.pack("!H", PROTOCOL_VERSION) + struct.pack("B", 0) + struct.pack("!I", len(payload))
    _set_stdio(monkeypatch, header + payload)

    with pytest.raises(BinaryIOError):
        read_message()


def test_read_decompression_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Should raise when compressed payload cannot be decompressed."""
    header = struct.pack("!H", PROTOCOL_VERSION)
    header += struct.pack("B", FLAG_COMPRESSED)
    bogus_payload = b"not-compressed"
    header += struct.pack("!I", len(bogus_payload))
    _set_stdio(monkeypatch, header + bogus_payload)

    with pytest.raises(BinaryIOError):
        read_message()


def test_write_message_too_large(monkeypatch: pytest.MonkeyPatch) -> None:
    """Should raise when payload exceeds MAX_MESSAGE_SIZE."""
    _set_stdio(monkeypatch, b"")
    monkeypatch.setattr("utils.binary_io.MAX_MESSAGE_SIZE", 10)

    with pytest.raises(BinaryIOError):
        write_message({"type": "big", "data": "x" * 100})
