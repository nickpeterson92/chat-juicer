"""
Professional logging setup for Chat Juicer using Python's standard logging
with JSON formatting for structured logs.

Log destinations:
- Console (stderr): Human-readable format for debugging
- logs/conversations.jsonl: JSON format for conversation history
- logs/errors.jsonl: JSON format for error tracking
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import pathlib
import sys
import uuid

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from pythonjsonlogger import jsonlogger

from core.constants import (
    LOG_BACKUP_COUNT_CONVERSATIONS,
    LOG_BACKUP_COUNT_ERRORS,
    LOG_MAX_SIZE,
    LOG_PREVIEW_LENGTH,
    SESSION_ID_LENGTH,
)


@dataclass
class ConversationTurn:
    """Structured representation of a conversation turn for logging."""

    user_input: str
    response: str
    function_calls: list[str] = field(default_factory=list)
    duration_ms: float | None = None
    tokens_used: int | None = None
    session_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class ConversationFilter(logging.Filter):
    """Filter to allow all INFO level logs for conversations"""

    def filter(self, record: logging.LogRecord) -> bool:
        # Allow all INFO and above logs (not DEBUG)
        return record.levelno >= logging.INFO


class ErrorFilter(logging.Filter):
    """Filter to only allow ERROR and CRITICAL logs"""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.ERROR


def setup_logging(name: str = "chat-juicer", debug: bool | None = None) -> logging.Logger:
    """
    Set up professional logging with multiple handlers.

    Args:
        name: Logger name
        debug: Enable debug logging (overrides DEBUG env var)

    Returns:
        Configured logger instance
    """
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)  # Capture all, filter at handler level

    # Remove any existing handlers
    logger.handlers = []

    # Determine debug mode
    if debug is None:
        debug = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")

    # --- Console Handler (Human-readable) ---
    # Always add console handler to stderr for debugging
    # This goes to terminal, not Electron (due to stdio configuration)
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.DEBUG if debug else logging.INFO)

    # Simple format for console
    console_format = "%(asctime)s [%(levelname)8s] %(name)s - %(message)s"
    console_handler.setFormatter(
        logging.Formatter(
            console_format,
            datefmt="%H:%M:%S",
        )
    )
    logger.addHandler(console_handler)

    # --- Conversation Log Handler (JSON) ---
    # Use absolute path to project root logs directory
    project_root = pathlib.Path(__file__).parent.parent.parent
    log_dir = project_root / "logs"
    log_dir.mkdir(exist_ok=True)

    conv_handler = logging.handlers.RotatingFileHandler(
        log_dir / "conversations.jsonl",
        maxBytes=LOG_MAX_SIZE,
        backupCount=LOG_BACKUP_COUNT_CONVERSATIONS,
    )
    conv_handler.setLevel(logging.INFO)
    conv_handler.addFilter(ConversationFilter())

    # Use JSON formatter for conversations
    conv_formatter = jsonlogger.JsonFormatter(  # type: ignore[attr-defined]
        "%(timestamp)s %(levelname)s %(message)s %(session_id)s %(tokens)s %(functions)s %(func)s",
        timestamp=True,
    )

    conv_handler.setFormatter(conv_formatter)
    logger.addHandler(conv_handler)

    # --- Error Log Handler (JSON) ---
    error_handler = logging.handlers.RotatingFileHandler(
        log_dir / "errors.jsonl",
        maxBytes=LOG_MAX_SIZE,
        backupCount=LOG_BACKUP_COUNT_ERRORS,
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.addFilter(ErrorFilter())

    # Use JSON formatter for errors
    error_formatter = jsonlogger.JsonFormatter(  # type: ignore[attr-defined]
        "%(timestamp)s %(levelname)s %(name)s %(message)s",
        timestamp=True,
    )

    error_handler.setFormatter(error_formatter)
    logger.addHandler(error_handler)

    return logger


class ChatLogger:
    """
    High-level logging interface for Chat Juicer.
    Wraps standard Python logging with convenience methods.
    """

    def __init__(self, name: str = "chat-juicer"):
        self.logger = setup_logging(name)
        self.session_id = str(uuid.uuid4())[:SESSION_ID_LENGTH]

    def debug(self, message: str, **kwargs: Any) -> None:
        """Debug level logging"""
        # Merge session_id into kwargs for all log calls
        kwargs["session_id"] = self.session_id
        self.logger.debug(message, extra=kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        """Info level logging"""
        # Merge session_id into kwargs for all log calls
        kwargs["session_id"] = self.session_id
        self.logger.info(message, extra=kwargs)

    def warning(self, message: str, **kwargs: Any) -> None:
        """Warning level logging"""
        # Merge session_id into kwargs for all log calls
        kwargs["session_id"] = self.session_id
        self.logger.warning(message, extra=kwargs)

    def error(self, message: str, exc_info: bool = False, **kwargs: Any) -> None:
        """Error level logging with optional exception info"""
        # Merge session_id into kwargs for all log calls
        kwargs["session_id"] = self.session_id
        self.logger.error(message, extra=kwargs, exc_info=exc_info)

    def log_conversation_turn(
        self,
        user_input: str,
        response: str,
        function_calls: list[Any] | None = None,
        duration_ms: float | None = None,
        tokens_used: int | None = None,
    ) -> None:
        """
        Log a complete conversation turn to conversations.jsonl

        Args:
            user_input: The user's input text
            response: The AI's response text
            function_calls: List of function calls made
            duration_ms: Response time in milliseconds
            tokens_used: Number of tokens used
        """
        # Create structured conversation turn
        turn = ConversationTurn(
            user_input=user_input,
            response=response,
            function_calls=function_calls or [],
            duration_ms=duration_ms,
            tokens_used=tokens_used,
            session_id=self.session_id,
        )

        # Create concise summary for log file
        user_preview = turn.user_input[:LOG_PREVIEW_LENGTH].replace("\\n", " ")
        if len(turn.user_input) > LOG_PREVIEW_LENGTH:
            user_preview += "..."

        response_preview = turn.response[:LOG_PREVIEW_LENGTH].replace("\\n", " ")
        if len(turn.response) > LOG_PREVIEW_LENGTH:
            response_preview += "..."

        # Build concise message
        msg_parts = [f"User: {user_preview} → AI: {response_preview}"]

        if turn.function_calls:
            msg_parts.append(f"[{len(turn.function_calls)} functions]")

        if turn.duration_ms:
            msg_parts.append(f"[{turn.duration_ms:.0f}ms]")

        if turn.tokens_used:
            msg_parts.append(f"[{turn.tokens_used} tokens]")

        # Log concise message with minimal extra data
        extra_data = {
            "conversation_turn": True,  # Flag for filter
            "timestamp": turn.timestamp,
            "session_id": turn.session_id,
            "chars": len(turn.user_input) + len(turn.response),
            "functions": len(turn.function_calls),
        }

        # Only add performance metrics if present
        if turn.duration_ms is not None:
            extra_data["ms"] = int(turn.duration_ms)
        if turn.tokens_used is not None:
            extra_data["tokens"] = turn.tokens_used

        # Log with special flag for conversation filter
        self.logger.info(" ".join(msg_parts), extra=extra_data)

    def log_function_call(self, function_name: str, args: dict[str, Any], result: Any) -> None:
        """
        Log a function call - verbose to console, concise to file.

        Args:
            function_name: Name of the function called
            args: Arguments passed to the function
            result: Result returned by the function
        """
        # CONSOLE: Full verbose output
        console_msg = f"Function call: {function_name}({args}) → {result}"

        # FILE: Concise summary
        args_parts = []
        for key, value in args.items():
            value_str = str(value)
            if len(value_str) > 20:
                value_str = value_str[:20] + "..."
            args_parts.append(f"{key}={value_str}")

        args_summary = ", ".join(args_parts) if args_parts else ""

        # Truncate result for file
        result_str = str(result)[:LOG_PREVIEW_LENGTH]
        if len(str(result)) > LOG_PREVIEW_LENGTH:
            result_str += "..."

        file_msg = f"Func: {function_name}({args_summary}) → {result_str}"

        # Log different messages to console vs file
        # Console handler will show console_msg, file handler will show file_msg
        # We'll use a custom attribute to differentiate
        self.logger.info(console_msg, extra={"file_message": file_msg, "func": function_name})


# Global logger instance
logger = ChatLogger()
