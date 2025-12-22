"""Shared message utilities for API services.

Provides common functions for converting database rows to API response formats.
"""

from __future__ import annotations

import contextlib
import json

from typing import Any, Protocol


class MessageRow(Protocol):
    """Protocol for message database row access."""

    def get(self, key: str) -> Any: ...

    def __getitem__(self, key: str) -> Any: ...


def _extract_display_content(content: str | None) -> str | None:
    """Extract displayable text from message content.

    Multimodal messages are stored as JSON arrays like:
    [{"type": "input_text", "text": "..."}, {"type": "input_image", ...}]

    This extracts just the text portions for UI display.

    Args:
        content: Raw content from database (may be plain text or JSON)

    Returns:
        Plain text content for display, or None if content is None
    """
    if content is None:
        return None

    # Check if content looks like a JSON array (multimodal)
    if isinstance(content, str) and content.startswith("["):
        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                # Extract text from all text-type content parts using list comprehension
                text_parts = [
                    item["text"]
                    for item in parsed
                    if isinstance(item, dict)
                    and (
                        (item.get("type") == "input_text" and "text" in item)
                        or (item.get("type") == "text" and "text" in item)
                    )
                ]
                if text_parts:
                    return "\n".join(text_parts)
                # If no text parts found, return placeholder
                return "[Image attachment]"
        except json.JSONDecodeError:
            pass  # Not valid JSON, return as-is

    return content


def row_to_message(row: MessageRow) -> dict[str, Any]:
    """Convert database row to message dict.

    For tool_call messages, passes through DB field names directly:
    - tool_call_id, tool_name, tool_arguments (parsed from JSON),
      tool_result, tool_success
    - status: "completed" for all persisted tool calls

    For partial/interrupted messages:
    - partial: True if message was interrupted (from metadata JSONB)

    Args:
        row: Database row with message data (asyncpg.Record or similar)

    Returns:
        Dictionary with message data formatted for frontend consumption
    """
    # Extract partial flag from metadata JSONB
    metadata = row.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}

    msg: dict[str, Any] = {
        "id": str(row["id"]),
        "role": row["role"],
        "content": _extract_display_content(row["content"]),
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "metadata": metadata,
    }

    # Add partial flag if present in metadata (for interrupted responses)
    if metadata.get("partial"):
        msg["partial"] = True

    # For tool_call messages, pass through DB field names directly (no renaming)
    if row["role"] == "tool_call":
        # Parse arguments from JSON string if stored that way
        args = row["tool_arguments"]
        if isinstance(args, str):
            with contextlib.suppress(json.JSONDecodeError):
                args = json.loads(args)

        # Determine status
        status = calculate_tool_status(metadata, row["tool_success"])

        msg.update(
            {
                "tool_call_id": row["tool_call_id"],
                "tool_name": row["tool_name"],
                "tool_arguments": args,
                "tool_result": row["tool_result"],
                "status": status,
                "tool_success": row["tool_success"],
            }
        )

    return msg


def calculate_tool_status(metadata: dict[str, Any], tool_success: bool | None) -> str:
    """Calculate normalized tool status string.

    Args:
        metadata: Message metadata dictionary
        tool_success: Boolean success flag from DB

    Returns:
        One of: "interrupted", "completed", "failed", "pending"
    """
    interrupted = metadata.get("interrupted", False)
    if interrupted:
        return "interrupted"
    if tool_success is True:
        return "completed"
    if tool_success is False:
        return "failed"
    return "pending"
