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

from typing import Any, ClassVar

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

    # Pre-create common message dicts to avoid repeated dict creation
    _TEMPLATES: ClassVar[dict[str, dict[str, Any]]] = {
        "assistant_start": {"type": MSG_TYPE_ASSISTANT_START},
        "assistant_end": {"type": MSG_TYPE_ASSISTANT_END},
    }

    @staticmethod
    def send(message: dict[str, Any], session_id: str | None = None) -> None:
        """Send a message to the Electron frontend via binary V2 IPC.

        Args:
            message: Message dictionary to send
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        payload = message.copy()
        if session_id:
            payload["session_id"] = session_id
        write_message(payload)

    @staticmethod
    def send_raw(message: str, session_id: str | None = None) -> None:
        """Send a raw JSON string message (converts to dict for V2).

        For backwards compatibility - parses JSON and sends as binary V2.

        Args:
            message: JSON string to send
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        try:
            msg_dict = json.loads(message)
            if session_id:
                msg_dict["session_id"] = session_id
            write_message(msg_dict)
        except json.JSONDecodeError:
            # If it's not valid JSON, wrap it as content
            payload = {"type": "raw", "content": message}
            if session_id:
                payload["session_id"] = session_id
            write_message(payload)

    @staticmethod
    def send_error(
        message: str, code: str | None = None, details: dict[str, Any] | None = None, session_id: str | None = None
    ) -> None:
        """Send an error message to the frontend with validation.

        Args:
            message: Error message text
            code: Optional error code
            details: Optional error details dictionary
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        # Use Pydantic model for validation
        error_msg = ErrorNotification(type=MSG_TYPE_ERROR, message=message, code=code, details=details)
        payload = error_msg.model_dump(exclude_none=True)
        if session_id:
            payload["session_id"] = session_id
        # Send via binary V2
        write_message(payload)

    @staticmethod
    def send_assistant_start(session_id: str | None = None) -> None:
        """Send assistant start signal.

        Args:
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        msg = IPCManager._TEMPLATES["assistant_start"].copy()
        if session_id:
            msg["session_id"] = session_id
        write_message(msg)

    @staticmethod
    def send_assistant_end(session_id: str | None = None) -> None:
        """Send assistant end signal.

        Args:
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        msg = IPCManager._TEMPLATES["assistant_end"].copy()
        if session_id:
            msg["session_id"] = session_id
        write_message(msg)

    @staticmethod
    def send_session_response(data: dict[str, Any], session_id: str | None = None) -> None:
        """Send a session management response.

        Args:
            data: Response data dict (success/error info)
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        response = {"type": MSG_TYPE_SESSION_RESPONSE, "data": data}
        if session_id:
            response["session_id"] = session_id
        try:
            write_message(response)
        except Exception as e:
            # Log serialization error and send error response instead
            from utils.logger import logger

            logger.error(f"Failed to serialize session response: {e}", exc_info=True)
            error_response = {"type": MSG_TYPE_SESSION_RESPONSE, "data": {"error": f"Serialization failed: {e}"}}
            if session_id:
                error_response["session_id"] = session_id
            write_message(error_response)

    @staticmethod
    def send_session_updated(data: dict[str, Any], session_id: str | None = None) -> None:
        """Send a spontaneous session update notification (not filtered by main process).

        Used for background operations like title generation that need to update the UI in real-time.

        Args:
            data: Session update data dict (success/error info, updated sessions list)
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        response = {"type": MSG_TYPE_SESSION_UPDATED, "data": data}
        if session_id:
            response["session_id"] = session_id
        try:
            write_message(response)
        except Exception as e:
            # Log serialization error
            from utils.logger import logger

            logger.error(f"Failed to serialize session update: {e}", exc_info=True)

    @staticmethod
    def send_token_usage(current: int, limit: int, threshold: int, session_id: str | None = None) -> None:
        """Send token usage update to frontend.

        Args:
            current: Current used tokens
            limit: Maximum token limit for model
            threshold: Summarization threshold
            session_id: Optional session identifier
        """
        IPCManager.send(
            {
                "type": "token_usage",
                "current": current,
                "limit": limit,
                "threshold": threshold,
            },
            session_id=session_id,
        )

    @staticmethod
    def send_upload_response(data: dict[str, Any], session_id: str | None = None) -> None:
        """Send a file upload response.

        Args:
            data: Response data dict (success/error info)
            session_id: Optional session identifier for routing (Phase 1: Concurrent Sessions)
        """
        response = {"type": "upload_response", "data": data}
        if session_id:
            response["session_id"] = session_id
        IPCManager.send(response)
