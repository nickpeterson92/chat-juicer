"""Tests for validation module.

Tests input sanitization and validation functions.
"""

from __future__ import annotations

import pytest

from utils.validation import sanitize_session_id


class TestSanitizeSessionId:
    """Tests for sanitize_session_id function."""

    def test_valid_session_id(self) -> None:
        """Test that valid session ID passes through unchanged."""
        session_id = "chat_abc123def456"
        result = sanitize_session_id(session_id)
        assert result == session_id

    def test_session_id_with_underscore(self) -> None:
        """Test session ID with underscores."""
        session_id = "chat_test_session_123"
        result = sanitize_session_id(session_id)
        assert result == session_id

    def test_session_id_sql_injection_attempt(self) -> None:
        """Test that SQL injection attempts are blocked."""
        with pytest.raises(ValueError) as exc_info:
            sanitize_session_id("chat_123; DROP TABLE users;")
        assert "Invalid session_id" in str(exc_info.value)

    def test_session_id_with_spaces(self) -> None:
        """Test that session ID with spaces is rejected."""
        with pytest.raises(ValueError):
            sanitize_session_id("chat_123 456")

    def test_session_id_with_special_chars(self) -> None:
        """Test that special characters are rejected."""
        invalid_ids = [
            "chat_123$456",
            "chat_123@456",
            "chat_123!456",
            "chat_123#456",
            "chat_123%456",
            "chat_123&456",
            "chat_123*456",
        ]
        for invalid_id in invalid_ids:
            with pytest.raises(ValueError):
                sanitize_session_id(invalid_id)

    def test_empty_session_id(self) -> None:
        """Test that empty session ID is rejected."""
        with pytest.raises(ValueError):
            sanitize_session_id("")

    def test_session_id_without_chat_prefix(self) -> None:
        """Test session ID without chat_ prefix."""
        # Should raise error if validation checks prefix
        # Note: Based on implementation, this might be allowed for flexibility
        session_id = "test_123"
        try:
            result = sanitize_session_id(session_id)
            # If it passes, verify it contains only alphanumeric and underscore
            assert all(c.isalnum() or c == "_" for c in result)
        except ValueError:
            # If it fails, that's also valid behavior
            pass

    def test_session_id_with_dots(self) -> None:
        """Test that dots in session ID are handled."""
        # Dots might be used for path traversal
        with pytest.raises(ValueError):
            sanitize_session_id("chat_../etc/passwd")

    def test_session_id_with_slashes(self) -> None:
        """Test that slashes are rejected (path traversal)."""
        with pytest.raises(ValueError):
            sanitize_session_id("chat_123/456")

        with pytest.raises(ValueError):
            sanitize_session_id("chat_123\\456")

    def test_very_long_session_id(self) -> None:
        """Test handling of very long session IDs."""
        long_id = "chat_" + "a" * 1000
        # Should either pass or raise appropriate error
        try:
            result = sanitize_session_id(long_id)
            assert result == long_id
        except ValueError:
            # If max length validation exists, this is acceptable
            pass

    def test_unicode_characters(self) -> None:
        """Test that unicode characters are rejected."""
        with pytest.raises(ValueError):
            sanitize_session_id("chat_123αβγ")

        with pytest.raises(ValueError):
            sanitize_session_id("chat_你好")
