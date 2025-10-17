"""Centralized JSON serialization utilities.

Pre-created partial functions for common JSON serialization patterns.
Follows the codebase pattern of performance optimization through partial application.
"""

from __future__ import annotations

import json

from collections.abc import Callable
from functools import partial
from typing import Any

# Type-annotated partial functions for JSON serialization
# Explicitly typed as Callable[..., str] to satisfy mypy strict mode

# Compact JSON serialization (no spaces) with fallback to str for non-serializable types.
# Use for IPC messages and network transmission where size matters.
# Example: json_compact({"key": "value"}) -> '{"key":"value"}'
json_compact: Callable[..., str] = partial(json.dumps, separators=(",", ":"), default=str)

# Standard JSON serialization with fallback to str for non-serializable types.
# Use for logging and debugging where readability is more important than size.
# Example: json_safe({"key": "value"}) -> '{"key": "value"}'
json_safe: Callable[..., str] = partial(json.dumps, default=str)

# Pretty-printed JSON with 2-space indentation.
# Use for human-readable output files and user-facing responses.
# Example: json_pretty({"key": "value"}) -> multi-line formatted output
json_pretty: Callable[..., str] = partial(json.dumps, indent=2, default=str)


def safe_json_dumps(obj: Any, **kwargs: Any) -> str:
    """JSON serialization with error handling and fallback.

    Attempts to serialize the object with provided kwargs. If serialization fails,
    returns a JSON error object instead of raising an exception.

    Args:
        obj: Object to serialize
        **kwargs: Additional arguments passed to json.dumps

    Returns:
        JSON string or error JSON if serialization fails

    Example:
        >>> safe_json_dumps({"data": datetime.now()})
        '{"data": "2025-01-20 10:30:00"}'  # datetime converted to string

        >>> safe_json_dumps({"circular": ...})
        '{"error": "Serialization failed: ..."}'  # Error fallback
    """
    try:
        # Default to compact format with str fallback if not specified
        if "separators" not in kwargs:
            kwargs["separators"] = (",", ":")
        if "default" not in kwargs:
            kwargs["default"] = str

        return json.dumps(obj, **kwargs)

    except (TypeError, ValueError) as e:
        # Return error as JSON instead of raising
        return json.dumps({"error": f"Serialization failed: {e}"})
