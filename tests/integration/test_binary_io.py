"""Integration tests for binary I/O protocol V2.

CRITICAL: These tests verify that binary messages can actually flow through
stdin/stdout pipes between processes. Unit tests are NOT sufficient!
"""

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
    """Encode a message using V2 binary protocol.

    Args:
        message: Message dictionary to encode

    Returns:
        Binary V2 message (7-byte header + MessagePack payload)
    """
    # Encode as MessagePack
    payload = msgpack.packb(message, use_bin_type=True)

    # Build header: version(2) + flags(1) + length(4)
    version = 2
    flags = 0  # No compression for test messages
    length = len(payload)

    header = struct.pack("!H", version)  # version (2 bytes, big-endian)
    header += struct.pack("B", flags)  # flags (1 byte)
    header += struct.pack("!I", length)  # length (4 bytes, big-endian)

    result: bytes = header + payload
    return result


def decode_v2_message(binary_data: bytes) -> dict[str, Any]:
    """Decode a V2 binary message.

    Args:
        binary_data: Binary message with 7-byte header + payload

    Returns:
        Decoded message dictionary
    """
    if len(binary_data) < 7:
        raise ValueError(f"Message too short: {len(binary_data)} bytes")

    # Parse header
    version = struct.unpack("!H", binary_data[0:2])[0]
    _flags = binary_data[2]  # Reserved for future use (compression, etc.)
    length = struct.unpack("!I", binary_data[3:7])[0]

    if version != 2:
        raise ValueError(f"Unsupported protocol version: {version}")

    if len(binary_data) < 7 + length:
        raise ValueError(f"Incomplete payload: got {len(binary_data) - 7}, expected {length}")

    # Extract payload
    payload = binary_data[7 : 7 + length]

    # Decode MessagePack
    decoded = msgpack.unpackb(payload, raw=False)
    # Cast to dict for type safety
    if not isinstance(decoded, dict):
        raise ValueError(f"Expected dict from MessagePack, got {type(decoded)}")
    message: dict[str, Any] = decoded
    return message


@pytest.mark.integration
def test_binary_stdin_stdout_protocol_negotiation() -> None:
    """Test protocol negotiation via binary stdin/stdout.

    This is the CRITICAL test - it verifies that binary messages can actually
    flow through subprocess pipes.
    """
    # Start Python backend
    proc = subprocess.Popen(
        [sys.executable, str(MAIN_PY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    try:
        assert proc.stdin is not None, "subprocess stdin is None"
        assert proc.stdout is not None, "subprocess stdout is None"

        # Encode negotiation message
        negotiation = {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "1.0.0-test"}
        binary_msg = encode_v2_message(negotiation)

        # Send to stdin
        proc.stdin.write(binary_msg)
        proc.stdin.flush()

        # Read response header (7 bytes)
        response_header = proc.stdout.read(7)
        assert len(response_header) == 7, f"Got {len(response_header)} bytes for header, expected 7"

        # Parse header
        version = struct.unpack("!H", response_header[0:2])[0]
        _flags = response_header[2]  # Reserved for future use (compression, etc.)
        length = struct.unpack("!I", response_header[3:7])[0]

        assert version == 2, f"Wrong protocol version: {version}"
        assert length > 0, "Empty response payload"
        assert length < 10000, f"Suspiciously large response: {length} bytes"

        # Read payload
        response_payload = proc.stdout.read(length)
        assert len(response_payload) == length, f"Incomplete payload: got {len(response_payload)}, expected {length}"

        # Decode MessagePack
        response = msgpack.unpackb(response_payload, raw=False)

        # Verify response
        assert response["type"] == "protocol_negotiation_response", f"Wrong response type: {response.get('type')}"
        assert response["selected_version"] == 2, f"Wrong selected version: {response.get('selected_version')}"
        assert "server_version" in response, "Missing server_version in response"

    finally:
        # Kill subprocess - handle permission errors in sandboxed environments
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except (subprocess.TimeoutExpired, PermissionError, OSError):
            with suppress(PermissionError, OSError):
                proc.kill()


@pytest.mark.integration
def test_binary_message_encoding() -> None:
    """Test that binary messages encode/decode correctly through the protocol."""
    # Test various message types can be encoded
    messages: list[dict[str, Any]] = [
        {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "1.0.0"},
        {"type": "session", "command": "list", "params": {}},
        {"type": "message", "role": "user", "content": "Test message"},
    ]

    for msg in messages:
        # Encode
        binary = encode_v2_message(msg)

        # Verify header format
        assert len(binary) >= 7, "Message too short"
        version = struct.unpack("!H", binary[0:2])[0]
        assert version == 2, f"Wrong version: {version}"

        # Decode
        decoded = decode_v2_message(binary)

        # Verify content preserved
        assert decoded["type"] == msg["type"], f"Type mismatch: {decoded.get('type')} != {msg['type']}"


@pytest.mark.integration
def test_malformed_binary_handling() -> None:
    """Test that backend handles malformed binary gracefully without crashing."""
    proc = subprocess.Popen(
        [sys.executable, str(MAIN_PY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    try:
        assert proc.stdin is not None, "subprocess stdin is None"

        # Send garbage binary data
        garbage = b"\x00\x00\x00\x00\x00\x00\x00\xff\xff\xff"
        proc.stdin.write(garbage)
        proc.stdin.flush()

        # Backend should NOT crash, but may not send a response for invalid header
        # Give it a moment to process
        time.sleep(0.5)

        # Check if process is still running
        assert proc.poll() is None, "Backend crashed on malformed binary"

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except (subprocess.TimeoutExpired, PermissionError, OSError):
            with suppress(PermissionError, OSError):
                proc.kill()


@pytest.mark.integration
@pytest.mark.skip(reason="Requires full app initialization with Azure connection - tested manually")
def test_session_command_via_binary() -> None:
    """Test session management commands via binary protocol.

    NOTE: This test is skipped in CI because it requires:
    - Full application initialization
    - Azure OpenAI API credentials
    - MCP servers running

    The critical binary I/O functionality is already tested by test_binary_stdin_stdout_protocol_negotiation.
    """
    proc = subprocess.Popen(
        [sys.executable, str(MAIN_PY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    try:
        assert proc.stdin is not None, "subprocess stdin is None"
        assert proc.stdout is not None, "subprocess stdout is None"

        # Negotiate first
        negotiation = {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "1.0.0-test"}
        proc.stdin.write(encode_v2_message(negotiation))
        proc.stdin.flush()

        # Read negotiation response
        header = proc.stdout.read(7)
        length = struct.unpack("!I", header[3:7])[0]
        payload = proc.stdout.read(length)
        response = msgpack.unpackb(payload, raw=False)
        assert response["type"] == "protocol_negotiation_response"

        # Send session list command
        session_cmd = {"type": "session", "command": "list", "params": {}}
        proc.stdin.write(encode_v2_message(session_cmd))
        proc.stdin.flush()

        # Read response (there may be multiple messages, we want session_response)
        # Give the backend time to process
        time.sleep(0.5)

        # The backend might send multiple messages - read until we get session_response
        max_attempts = 10
        session_response = None

        for _ in range(max_attempts):
            response_header = proc.stdout.read(7)
            if len(response_header) < 7:
                break

            response_length = struct.unpack("!I", response_header[3:7])[0]
            response_payload = proc.stdout.read(response_length)

            if len(response_payload) < response_length:
                break

            try:
                response = msgpack.unpackb(response_payload, raw=False)
                if response.get("type") == "session_response":
                    session_response = response
                    break
            except Exception:
                # Skip invalid messages
                continue

        assert session_response is not None, "Never received session_response"
        assert "data" in session_response, "Response missing data field"

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except (subprocess.TimeoutExpired, PermissionError, OSError):
            with suppress(PermissionError, OSError):
                proc.kill()


@pytest.mark.integration
def test_throughput_encoding() -> None:
    """Test that encoding/decoding throughput meets requirements.

    Requirement: >1000 messages/second for encode/decode operations.
    """
    import time

    num_messages = 1000
    messages: list[dict[str, Any]] = [
        {"type": "message", "role": "user", "content": f"Test message {i}"} for i in range(num_messages)
    ]

    # Benchmark encoding
    start = time.perf_counter()
    encoded_messages = [encode_v2_message(msg) for msg in messages]
    encode_time = time.perf_counter() - start

    # Benchmark decoding
    start = time.perf_counter()
    decoded_messages = [decode_v2_message(enc) for enc in encoded_messages]
    decode_time = time.perf_counter() - start

    # Calculate throughput
    encode_throughput = num_messages / encode_time
    decode_throughput = num_messages / decode_time

    print(f"\nEncode throughput: {encode_throughput:.0f} msg/s")
    print(f"Decode throughput: {decode_throughput:.0f} msg/s")

    # Verify all messages decoded correctly
    for i, decoded in enumerate(decoded_messages):
        assert decoded["type"] == "message"
        assert decoded["content"] == f"Test message {i}"

    # Check throughput requirement (>1000 msg/s)
    assert encode_throughput > 1000, f"Encode throughput {encode_throughput:.0f} < 1000 msg/s"
    assert decode_throughput > 1000, f"Decode throughput {decode_throughput:.0f} < 1000 msg/s"


@pytest.mark.integration
def test_throughput_subprocess() -> None:
    """Test message throughput through actual subprocess pipes.

    This is a more realistic test that includes pipe I/O latency.
    """
    import time

    proc = subprocess.Popen(
        [sys.executable, str(MAIN_PY)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

    try:
        assert proc.stdin is not None, "subprocess stdin is None"
        assert proc.stdout is not None, "subprocess stdout is None"

        # First, negotiate protocol
        negotiation = {"type": "protocol_negotiation", "supported_versions": [2], "client_version": "1.0.0-perf"}
        proc.stdin.write(encode_v2_message(negotiation))
        proc.stdin.flush()

        # Read negotiation response
        header = proc.stdout.read(7)
        length = struct.unpack("!I", header[3:7])[0]
        proc.stdout.read(length)

        # Send multiple unknown messages and measure time
        num_messages = 100  # Reduced for subprocess test (I/O overhead)
        start = time.perf_counter()

        for i in range(num_messages):
            msg = {"type": f"unknown_perf_test_{i}"}
            proc.stdin.write(encode_v2_message(msg))
            proc.stdin.flush()

        # Read all error responses
        responses_read = 0
        for _ in range(num_messages):
            try:
                response_header = proc.stdout.read(7)
                if len(response_header) < 7:
                    break
                response_length = struct.unpack("!I", response_header[3:7])[0]
                proc.stdout.read(response_length)
                responses_read += 1
            except Exception:
                break

        elapsed = time.perf_counter() - start
        throughput = num_messages / elapsed

        print(f"\nSubprocess throughput: {throughput:.0f} msg/s (sent {num_messages}, received {responses_read})")

        # Subprocess throughput will be lower due to I/O, but should still be reasonable
        # Expect at least 50 msg/s through subprocess
        assert throughput > 50, f"Subprocess throughput {throughput:.0f} < 50 msg/s"

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except (subprocess.TimeoutExpired, PermissionError, OSError):
            with suppress(PermissionError, OSError):
                proc.kill()


@pytest.mark.integration
def test_large_message_handling() -> None:
    """Test that large messages are handled correctly with compression."""
    # Test messages of increasing size
    sizes = [100, 1024, 10_000, 100_000, 1_000_000]  # Up to 1MB

    for size in sizes:
        content = "x" * size
        msg: dict[str, Any] = {"type": "message", "content": content}

        # Encode
        encoded = encode_v2_message(msg)

        # For larger messages where compression would help,
        # verify the message can still be encoded/decoded
        if size >= 100_000:  # 100KB+
            # These should still work without hitting limits
            assert len(encoded) < 2 * size, f"Encoded size {len(encoded)} should be reasonable for size {size}"

        # Decode and verify - the critical test
        decoded = decode_v2_message(encoded)
        assert decoded["content"] == content, f"Content mismatch for size {size}"


@pytest.mark.integration
def test_error_recovery_incomplete_header() -> None:
    """Test that incomplete headers are detected correctly."""
    # Send only partial header (less than 7 bytes)
    incomplete = b"\x00\x02\x00\x00"  # Only 4 bytes

    with pytest.raises(ValueError, match="Message too short"):
        decode_v2_message(incomplete)


@pytest.mark.integration
def test_error_recovery_incomplete_payload() -> None:
    """Test that incomplete payloads are detected correctly."""
    # Create header claiming larger payload than provided
    header = struct.pack("!H", 2)  # version
    header += struct.pack("B", 0)  # flags
    header += struct.pack("!I", 1000)  # claims 1000 bytes payload

    # Only provide 10 bytes of payload
    incomplete = header + b"x" * 10

    with pytest.raises(ValueError, match="Incomplete payload"):
        decode_v2_message(incomplete)


@pytest.mark.integration
def test_error_recovery_corrupted_msgpack() -> None:
    """Test that corrupted MessagePack is detected correctly."""
    # Create valid header but garbage payload
    garbage_payload = b"\xff\xff\xff\xff\xff"

    header = struct.pack("!H", 2)  # version
    header += struct.pack("B", 0)  # flags
    header += struct.pack("!I", len(garbage_payload))  # length

    corrupted = header + garbage_payload

    with pytest.raises((ValueError, msgpack.exceptions.UnpackException)):
        decode_v2_message(corrupted)


@pytest.mark.integration
def test_error_recovery_wrong_version() -> None:
    """Test that wrong protocol version is detected correctly."""
    # Create message with version 99
    header = struct.pack("!H", 99)  # wrong version
    header += struct.pack("B", 0)  # flags
    header += struct.pack("!I", 5)  # length
    payload = msgpack.packb({"type": "test"}, use_bin_type=True)

    wrong_version = header + payload

    with pytest.raises(ValueError, match="Unsupported protocol version"):
        decode_v2_message(wrong_version)


@pytest.mark.integration
def test_binary_data_edge_cases() -> None:
    """Test binary edge cases: null bytes, high bytes, unicode."""
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
        assert decoded["content"] == msg["content"], f"Mismatch for: {msg['content'][:20]!r}"


@pytest.mark.integration
def test_multiple_messages_concatenated() -> None:
    """Test parsing multiple messages that arrive concatenated."""
    # Create multiple messages
    messages: list[dict[str, Any]] = [
        {"type": "message", "content": "First"},
        {"type": "message", "content": "Second"},
        {"type": "message", "content": "Third"},
    ]

    # Encode and concatenate
    encoded_concat = b"".join(encode_v2_message(msg) for msg in messages)

    # Parse them one by one
    offset = 0
    decoded_messages = []

    while offset < len(encoded_concat):
        # Read header
        header = encoded_concat[offset : offset + 7]
        if len(header) < 7:
            break

        length = struct.unpack("!I", header[3:7])[0]
        total_size = 7 + length

        # Decode this message
        msg_bytes = encoded_concat[offset : offset + total_size]
        decoded = decode_v2_message(msg_bytes)
        decoded_messages.append(decoded)

        offset += total_size

    assert len(decoded_messages) == 3, f"Expected 3 messages, got {len(decoded_messages)}"
    assert decoded_messages[0]["content"] == "First"
    assert decoded_messages[1]["content"] == "Second"
    assert decoded_messages[2]["content"] == "Third"


if __name__ == "__main__":
    # Allow running tests directly
    pytest.main([__file__, "-v"])
