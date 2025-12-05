"""Binary stdin/stdout I/O for Protocol V2.

This module handles raw binary communication with the Electron frontend.
All I/O is via sys.stdin.buffer and sys.stdout.buffer - no text wrappers.
"""

import struct
import sys
import zlib

from typing import Any

import msgpack

from utils.logger import logger

# Protocol constants
PROTOCOL_VERSION = 2
FLAG_COMPRESSED = 0x01
MAX_MESSAGE_SIZE = 100 * 1024 * 1024  # 100MB


class BinaryIOError(Exception):
    """Raised when binary I/O operations fail."""

    pass


def read_message() -> dict[str, Any]:
    """Read one complete binary V2 message from stdin.

    Returns:
        Decoded message dictionary

    Raises:
        BinaryIOError: On I/O errors or malformed messages
        EOFError: On end of stream
    """
    try:
        # Read 7-byte header
        header = sys.stdin.buffer.read(7)
        if not header:
            raise EOFError("End of input stream")
        if len(header) < 7:
            raise BinaryIOError(f"Incomplete header: got {len(header)} bytes, expected 7")

        # Parse header
        version = struct.unpack("!H", header[0:2])[0]
        flags = header[2]
        length = struct.unpack("!I", header[3:7])[0]

        # Validate
        if version != PROTOCOL_VERSION:
            raise BinaryIOError(f"Unsupported protocol version: {version}")
        if length > MAX_MESSAGE_SIZE:
            raise BinaryIOError(f"Message too large: {length} bytes (max {MAX_MESSAGE_SIZE})")

        # Read payload
        payload = sys.stdin.buffer.read(length)
        if len(payload) < length:
            raise BinaryIOError(f"Incomplete payload: got {len(payload)} bytes, expected {length}")

        # Decompress if needed
        compressed = bool(flags & FLAG_COMPRESSED)
        if compressed:
            try:
                payload = zlib.decompress(payload)
            except zlib.error as e:
                raise BinaryIOError(f"Decompression failed: {e}") from e

        # Decode MessagePack
        try:
            decoded = msgpack.unpackb(payload, raw=False)
            # Cast to dict for type safety (msgpack.unpackb returns Any)
            if not isinstance(decoded, dict):
                raise BinaryIOError(f"Expected dict from MessagePack, got {type(decoded)}")
            message: dict[str, Any] = decoded
        except Exception as e:
            raise BinaryIOError(f"MessagePack decode failed: {e}") from e

        # Add metadata for logging
        message["_size"] = length
        message["_compressed"] = compressed

        logger.debug(f"Read message: type={message.get('type')}, size={length}, compressed={compressed}")

        return message

    except (BinaryIOError, EOFError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error reading message: {e}", exc_info=True)
        raise BinaryIOError(f"Read failed: {e}") from e


def write_message(message: dict[str, Any]) -> None:
    """Write one complete binary V2 message to stdout.

    Args:
        message: Message dictionary to send

    Raises:
        BinaryIOError: On encoding or I/O errors
    """
    try:
        # Remove metadata fields
        message = {k: v for k, v in message.items() if not k.startswith("_")}

        # Encode as MessagePack
        payload = msgpack.packb(message, use_bin_type=True)

        # Compress if large enough
        flags = 0
        if len(payload) > 1024:  # Compress if >1KB
            compressed_payload = zlib.compress(payload, level=6)
            if len(compressed_payload) < len(payload):
                payload = compressed_payload
                flags |= FLAG_COMPRESSED

        # Build header
        if len(payload) > MAX_MESSAGE_SIZE:
            raise BinaryIOError(f"Message too large: {len(payload)} bytes")

        header = struct.pack("!H", PROTOCOL_VERSION)  # version
        header += struct.pack("B", flags)  # flags
        header += struct.pack("!I", len(payload))  # length

        # Write header + payload
        sys.stdout.buffer.write(header + payload)
        sys.stdout.buffer.flush()

        logger.debug(
            f"Wrote message: type={message.get('type')}, size={len(payload)}, compressed={bool(flags & FLAG_COMPRESSED)}"
        )

    except Exception as e:
        logger.error(f"Failed to write message: {e}", exc_info=True)
        raise BinaryIOError(f"Write failed: {e}") from e


__all__ = ["BinaryIOError", "read_message", "write_message"]
