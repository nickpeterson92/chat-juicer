"""Validation utilities for input sanitization and security.

This module provides validation functions to ensure data safety,
particularly for SQL operations and user inputs.
"""

import re


def validate_session_id(session_id: str) -> bool:
    """Validate session_id is SQL-safe (alphanumeric, hyphen, underscore only).

    Args:
        session_id: Session identifier to validate

    Returns:
        True if session_id matches safe pattern, False otherwise
    """
    return bool(re.match(r"^[a-zA-Z0-9_-]+$", session_id))


def sanitize_session_id(session_id: str) -> str:
    """Sanitize session_id or raise ValueError if invalid.

    This ensures session IDs used in table names are SQL-safe,
    preventing SQL injection vulnerabilities.

    Args:
        session_id: Session identifier to sanitize

    Returns:
        The validated session_id

    Raises:
        ValueError: If session_id contains invalid characters
    """
    if not validate_session_id(session_id):
        raise ValueError(
            f"Invalid session_id format: '{session_id}'. "
            "Must contain only alphanumeric characters, hyphens, and underscores."
        )
    return session_id
