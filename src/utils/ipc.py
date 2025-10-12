"""
IPC (Inter-Process Communication) utilities for Chat Juicer.
Manages communication between Electron frontend and Python backend.

This module centralizes all IPC protocol constants and methods.
All IPC-related code should use this module to ensure consistency.
"""

from __future__ import annotations

import json

from functools import partial
from typing import Any, ClassVar

from models.event_models import AssistantMessage, ErrorNotification


class IPCManager:
    """Manages IPC communication with clean abstraction.

    Protocol Specification:
        - JSON messages: ``__JSON__<payload>__JSON__``
        - Session commands: ``__SESSION__<command>__<json_data>__``

    All IPC constants and helper methods are centralized here
    to maintain a single source of truth for the protocol.
    """

    #: Delimiter for JSON messages in IPC protocol
    DELIMITER: ClassVar[str] = "__JSON__"

    #: Prefix for session management commands
    SESSION_PREFIX: ClassVar[str] = "__SESSION__"

    #: Index of command name in parsed session command
    SESSION_CMD_INDEX: ClassVar[int] = 2

    #: Index of JSON data in parsed session command
    SESSION_DATA_INDEX: ClassVar[int] = 3

    #: Minimum parts required for valid session command
    MIN_SESSION_PARTS: ClassVar[int] = 4

    # Pre-create common JSON templates to avoid repeated serialization
    _TEMPLATES: ClassVar[dict[str, str]] = {
        "assistant_start": AssistantMessage(type="assistant_start").to_json(),
        "assistant_end": AssistantMessage(type="assistant_end").to_json(),
    }

    @staticmethod
    def send(message: dict[str, Any]) -> None:
        """Send a message to the Electron frontend via IPC."""
        msg = _json_builder(message)
        print(f"{IPCManager.DELIMITER}{msg}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def send_raw(message: str) -> None:
        """Send a raw JSON string message (for backwards compatibility)."""
        print(f"{IPCManager.DELIMITER}{message}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def send_error(message: str, code: str | None = None, details: dict[str, Any] | None = None) -> None:
        """Send an error message to the frontend with validation."""
        # Use Pydantic model for validation, but maintain backward compatibility
        error_msg = ErrorNotification(type="error", message=message, code=code, details=details)
        # Convert to dict and send using existing method to maintain format
        IPCManager.send(error_msg.model_dump(exclude_none=True))

    @staticmethod
    def send_assistant_start() -> None:
        """Send assistant start signal."""
        IPCManager.send_raw(IPCManager._TEMPLATES["assistant_start"])

    @staticmethod
    def send_assistant_end() -> None:
        """Send assistant end signal."""
        IPCManager.send_raw(IPCManager._TEMPLATES["assistant_end"])

    @staticmethod
    def send_session_response(data: dict[str, Any]) -> None:
        """Send a session management response.

        Args:
            data: Response data dict (success/error info)
        """
        import json

        response = {"type": "session_response", "data": data}
        try:
            # Use default=str to handle non-serializable objects
            msg = json.dumps(response, separators=(",", ":"), default=str)
            print(f"{IPCManager.DELIMITER}{msg}{IPCManager.DELIMITER}", flush=True)
        except (TypeError, ValueError) as e:
            # Log serialization error and send error response instead
            from utils.logger import logger

            logger.error(f"Failed to serialize session response: {e}", exc_info=True)
            error_response = {"type": "session_response", "data": {"error": f"Serialization failed: {e}"}}
            error_msg = json.dumps(error_response, separators=(",", ":"))
            print(f"{IPCManager.DELIMITER}{error_msg}{IPCManager.DELIMITER}", flush=True)

    @staticmethod
    def is_session_command(raw_input: str) -> bool:
        """Check if input is a session management command.

        Args:
            raw_input: Raw input string from stdin

        Returns:
            True if input is a session command
        """
        return raw_input.startswith(IPCManager.SESSION_PREFIX)

    @staticmethod
    def parse_session_command(raw_input: str) -> tuple[str, dict[str, Any]] | None:
        """Parse session management command from raw input.

        Protocol format: ``__SESSION__<command>__<json_data>__``

        Args:
            raw_input: Raw input string from stdin

        Returns:
            Tuple of (command, data) if valid, None if invalid

        Example:
            >>> IPCManager.parse_session_command("__SESSION__new__{}__")
            ('new', {})
        """
        parts = raw_input.split("__")

        if len(parts) < IPCManager.MIN_SESSION_PARTS:
            return None

        command = parts[IPCManager.SESSION_CMD_INDEX]
        data_json = parts[IPCManager.SESSION_DATA_INDEX] if len(parts) > IPCManager.SESSION_DATA_INDEX else "{}"

        try:
            data = json.loads(data_json) if data_json else {}
            return (command, data)
        except json.JSONDecodeError:
            return None


# Pre-create partial JSON builders for common patterns
_json_builder = partial(json.dumps, separators=(",", ":"))  # Compact JSON
