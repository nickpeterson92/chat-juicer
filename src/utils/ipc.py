"""
IPC (Inter-Process Communication) utilities for Chat Juicer.
Manages communication between Electron frontend and Python backend.

This module centralizes all IPC protocol constants and methods.
All IPC-related code should use this module to ensure consistency.

Protocol V2: Uses binary MessagePack encoding with length-prefixed framing.
All output goes through binary_io.write_message() for consistency.
"""

from __future__ import annotations

import json

from typing import Any, ClassVar, cast

from core.constants import (
    MSG_TYPE_ASSISTANT_END,
    MSG_TYPE_ASSISTANT_START,
    MSG_TYPE_ERROR,
    MSG_TYPE_SESSION_RESPONSE,
    MSG_TYPE_SESSION_UPDATED,
)
from models.event_models import ErrorNotification
from utils.binary_io import write_message


class IPCManager:
    """Manages IPC communication with clean abstraction.

    Protocol V2 Specification:
        - All messages use binary MessagePack encoding
        - 7-byte header: version(2) + flags(1) + length(4)
        - Automatic compression for messages >1KB

    All IPC output methods use binary_io.write_message() for consistency.
    """

    #: Delimiter for JSON messages (V1 legacy - kept for parsing incoming commands)
    DELIMITER: ClassVar[str] = "__JSON__"

    #: Prefix for session management commands (V1 legacy - kept for parsing)
    SESSION_PREFIX: ClassVar[str] = "__SESSION__"

    #: Prefix for file upload commands (V1 legacy - kept for parsing)
    UPLOAD_PREFIX: ClassVar[str] = "__UPLOAD__"

    #: Index of command name in parsed session command
    SESSION_CMD_INDEX: ClassVar[int] = 2

    #: Index of JSON data in parsed session command
    SESSION_DATA_INDEX: ClassVar[int] = 3

    #: Minimum parts required for valid session command
    MIN_SESSION_PARTS: ClassVar[int] = 4

    # Pre-create common message dicts to avoid repeated dict creation
    _TEMPLATES: ClassVar[dict[str, dict[str, Any]]] = {
        "assistant_start": {"type": MSG_TYPE_ASSISTANT_START},
        "assistant_end": {"type": MSG_TYPE_ASSISTANT_END},
    }

    @staticmethod
    def send(message: dict[str, Any]) -> None:
        """Send a message to the Electron frontend via binary V2 IPC."""
        write_message(message)

    @staticmethod
    def send_raw(message: str) -> None:
        """Send a raw JSON string message (converts to dict for V2).

        For backwards compatibility - parses JSON and sends as binary V2.
        """
        try:
            msg_dict = json.loads(message)
            write_message(msg_dict)
        except json.JSONDecodeError:
            # If it's not valid JSON, wrap it as content
            write_message({"type": "raw", "content": message})

    @staticmethod
    def send_error(message: str, code: str | None = None, details: dict[str, Any] | None = None) -> None:
        """Send an error message to the frontend with validation."""
        # Use Pydantic model for validation
        error_msg = ErrorNotification(type=MSG_TYPE_ERROR, message=message, code=code, details=details)
        # Send via binary V2
        write_message(error_msg.model_dump(exclude_none=True))

    @staticmethod
    def send_assistant_start() -> None:
        """Send assistant start signal."""
        write_message(IPCManager._TEMPLATES["assistant_start"])

    @staticmethod
    def send_assistant_end() -> None:
        """Send assistant end signal."""
        write_message(IPCManager._TEMPLATES["assistant_end"])

    @staticmethod
    def send_session_response(data: dict[str, Any]) -> None:
        """Send a session management response.

        Args:
            data: Response data dict (success/error info)
        """
        response = {"type": MSG_TYPE_SESSION_RESPONSE, "data": data}
        try:
            write_message(response)
        except Exception as e:
            # Log serialization error and send error response instead
            from utils.logger import logger

            logger.error(f"Failed to serialize session response: {e}", exc_info=True)
            error_response = {"type": MSG_TYPE_SESSION_RESPONSE, "data": {"error": f"Serialization failed: {e}"}}
            write_message(error_response)

    @staticmethod
    def send_session_updated(data: dict[str, Any]) -> None:
        """Send a spontaneous session update notification (not filtered by main process).

        Used for background operations like title generation that need to update the UI in real-time.

        Args:
            data: Session update data dict (success/error info, updated sessions list)
        """
        response = {"type": MSG_TYPE_SESSION_UPDATED, "data": data}
        try:
            write_message(response)
        except Exception as e:
            # Log serialization error
            from utils.logger import logger

            logger.error(f"Failed to serialize session update: {e}", exc_info=True)

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

    @staticmethod
    def is_upload_command(raw_input: str) -> bool:
        """Check if input is a file upload command.

        Args:
            raw_input: Raw input string from stdin

        Returns:
            True if input is an upload command
        """
        return raw_input.startswith(IPCManager.UPLOAD_PREFIX)

    @staticmethod
    def parse_upload_command(raw_input: str) -> dict[str, Any] | None:
        """Parse file upload command from raw input.

        Protocol format: ``__UPLOAD__<json_data>__``

        Args:
            raw_input: Raw input string from stdin

        Returns:
            Upload data dict if valid, None if invalid

        Example:
            >>> IPCManager.parse_upload_command("__UPLOAD__{'file': 'test.txt'}__")
            {'file': 'test.txt'}
        """
        try:
            # Find JSON payload between delimiters
            json_start = raw_input.index(IPCManager.UPLOAD_PREFIX) + len(IPCManager.UPLOAD_PREFIX)
            json_end = raw_input.index("__", json_start)
            upload_json = raw_input[json_start:json_end]
            return cast(dict[str, Any], json.loads(upload_json))
        except (ValueError, json.JSONDecodeError, IndexError):
            return None

    @staticmethod
    def send_upload_response(data: dict[str, Any]) -> None:
        """Send a file upload response.

        Args:
            data: Response data dict (success/error info)
        """
        response = {"type": "upload_response", "data": data}
        IPCManager.send(response)
