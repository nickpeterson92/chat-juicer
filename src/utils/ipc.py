"""
IPC (Inter-Process Communication) utilities for Chat Juicer.
Manages communication between Electron frontend and Python backend.
"""

from __future__ import annotations

import json

from functools import partial
from typing import Any, ClassVar

from models.event_models import AssistantMessage, ErrorNotification


class IPCManager:
    """Manages IPC communication with clean abstraction."""

    DELIMITER: ClassVar[str] = "__JSON__"

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


# Pre-create partial JSON builders for common patterns
_json_builder = partial(json.dumps, separators=(",", ":"))  # Compact JSON
