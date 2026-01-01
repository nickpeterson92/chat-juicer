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
import re
import sys
import uuid

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, cast

from pythonjsonlogger import json as jsonlogger

from api.middleware.request_context import get_request_context
from core.constants import (
    LOG_BACKUP_COUNT_CONVERSATIONS,
    LOG_BACKUP_COUNT_ERRORS,
    LOG_MAX_SIZE,
    LOG_PREVIEW_LENGTH,
    PROJECT_ROOT,
    SESSION_ID_LENGTH,
    get_settings,
)

# PII Redaction patterns
REDACTION_PATTERNS = [
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL]"),
    (r"\b(?:\d{4}[- ]?){3}\d{4}\b", "[CARD]"),
    (r"\b(sk-|pk-|api[-_]?key[-_]?)[A-Za-z0-9]{20,}\b", "[API_KEY]"),
    (r"\b(password|secret|token)\s*[:=]\s*\S+", "[REDACTED]"),
]


@dataclass
class ConversationTurn:
    """Structured representation of a conversation turn for logging."""

    user_input: str
    response: str
    function_calls: list[str] = field(default_factory=list)
    duration_ms: float | None = None
    tokens_used: int | None = None
    session_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class ConversationFilter(logging.Filter):
    """Filter to allow all INFO level logs for conversations"""

    def filter(self, record: logging.LogRecord) -> bool:
        # Allow all INFO and above logs (not DEBUG)
        return record.levelno >= logging.INFO


class ErrorFilter(logging.Filter):
    """Filter to only allow ERROR and CRITICAL logs"""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.ERROR


class ColoredConsoleFormatter(logging.Formatter):
    """
    Custom formatter that adds colors to log levels and standardizes format.
    Format: HH:MM:SS [LEVEL] logger_name - message
    """

    # ANSI color codes
    GREY = "\x1b[38;20m"
    GREEN = "\x1b[32;20m"
    YELLOW = "\x1b[33;20m"
    RED = "\x1b[31;20m"
    BOLD_RED = "\x1b[31;1m"
    BLUE = "\x1b[34;20m"
    RESET = "\x1b[0m"

    # We only color the level part: [LEVEL]
    def format(self, record: logging.LogRecord) -> str:
        level_fmt = f"[{record.levelname}]"

        if record.levelno == logging.DEBUG:
            level_fmt = f"{self.GREY}{level_fmt}{self.RESET}"
        elif record.levelno == logging.INFO:
            level_fmt = f"{self.GREEN}{level_fmt}{self.RESET}"
        elif record.levelno == logging.WARNING:
            level_fmt = f"{self.YELLOW}{level_fmt}{self.RESET}"
        elif record.levelno == logging.ERROR:
            level_fmt = f"{self.RED}{level_fmt}{self.RESET}"
        elif record.levelno == logging.CRITICAL:
            level_fmt = f"{self.BOLD_RED}{level_fmt}{self.RESET}"

        # Manually formatting to allow for the dynamic level part
        # Format: TIME [LEVEL] NAME - MESSAGE

        # Format time
        record.asctime = self.formatTime(record, "%H:%M:%S")

        # Special handling for uvicorn access logs to restore "tasteful" bolding/colors
        # record.args structure from uvicorn: (client_addr, method, full_path, http_version, status_code)
        if record.name == "uvicorn.access" and record.args and len(record.args) == 5:
            client_addr, method, full_path, http_version, status_code = record.args

            # Colorize status code
            status_code_num = int(cast(Any, status_code))
            status_code_fmt = str(status_code)
            if status_code_num < 400:
                status_code_fmt = f"{self.GREEN}{status_code}{self.RESET}"
            elif status_code_num < 500:
                status_code_fmt = f"{self.YELLOW}{status_code}{self.RESET}"
            else:
                status_code_fmt = f"{self.RED}{status_code}{self.RESET}"

            # Bold method (using ANSI bold \033[1m)
            method_fmt = f"\x1b[1m{method}\x1b[0m"

            # Reconstruct message: client - "METHOD /path HTTP/1.1" STATUS
            message = f'{client_addr} - "{method_fmt} {full_path} HTTP/{http_version}" {status_code_fmt}'
            return f"{record.asctime} {level_fmt} {record.name} - {message}"

        return f"{record.asctime} {level_fmt} {record.name} - {record.getMessage()}"


def configure_uvicorn_logging() -> None:
    """
    Configure uvicorn loggers to use our standard colored formatting.
    This ensures uvicorn logs (access, error) match the application log style.
    """
    formatter = ColoredConsoleFormatter()

    # Configure main uvicorn logger
    main_logger = logging.getLogger("uvicorn")
    main_logger.handlers = []
    main_logger.setLevel(logging.INFO)

    # Configure access logger
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers = []
    access_logger.setLevel(logging.INFO)
    access_handler = logging.StreamHandler(sys.stderr)
    access_handler.setFormatter(formatter)
    access_logger.addHandler(access_handler)
    access_logger.propagate = False

    # Configure error logger
    error_logger = logging.getLogger("uvicorn.error")
    error_logger.handlers = []
    error_logger.setLevel(logging.INFO)
    error_handler = logging.StreamHandler(sys.stderr)
    error_handler.setFormatter(formatter)
    error_logger.addHandler(error_handler)
    error_logger.propagate = False


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
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.DEBUG if debug else logging.INFO)

    # Use our custom colored formatter
    console_handler.setFormatter(ColoredConsoleFormatter())
    logger.addHandler(console_handler)

    # --- Conversation Log Handler (JSON) ---
    # Use absolute path to project root logs directory
    log_dir = PROJECT_ROOT / "logs"
    log_dir.mkdir(exist_ok=True)

    conv_handler = logging.handlers.RotatingFileHandler(
        log_dir / "conversations.jsonl",
        maxBytes=LOG_MAX_SIZE,
        backupCount=LOG_BACKUP_COUNT_CONVERSATIONS,
        encoding="utf-8",
    )
    conv_handler.setLevel(logging.INFO)
    conv_handler.addFilter(ConversationFilter())

    # Use JSON formatter for conversations
    conv_formatter = jsonlogger.JsonFormatter(
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
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.addFilter(ErrorFilter())

    # Use JSON formatter for errors
    error_formatter = jsonlogger.JsonFormatter(
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

    def _enrich_context(self, kwargs: dict[str, Any]) -> dict[str, Any]:
        """Enrich log arguments with request context and session ID."""
        # Always include instance session_id (which acts as a fallback or component ID)
        kwargs.setdefault("session_id", self.session_id)

        # Inject request context if available
        if ctx := get_request_context():
            kwargs.update(ctx.to_log_context())
            # If context has a specific session_id (e.g. from URL), override the default
            if ctx.session_id:
                kwargs["session_id"] = ctx.session_id

        return kwargs

    def debug(self, message: str, **kwargs: Any) -> None:
        """Debug level logging"""
        # Merge context into kwargs
        kwargs = self._enrich_context(kwargs)
        self.logger.debug(message, extra=kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        """Info level logging"""
        # Merge context into kwargs
        kwargs = self._enrich_context(kwargs)
        self.logger.info(message, extra=kwargs)

    def warning(self, message: str, **kwargs: Any) -> None:
        """Warning level logging"""
        # Merge context into kwargs
        kwargs = self._enrich_context(kwargs)
        self.logger.warning(message, extra=kwargs)

    def error(self, message: str, exc_info: bool = False, **kwargs: Any) -> None:
        """Error level logging with optional exception info"""
        # Merge context into kwargs
        kwargs = self._enrich_context(kwargs)
        self.logger.error(message, extra=kwargs, exc_info=exc_info)

    def _should_log_content(self) -> bool:
        """Check if content logging is enabled via settings."""
        try:
            return bool(get_settings().enable_content_logging)
        except Exception:
            # Fallback if settings not loaded
            return False

    def _redact_content(self, text: str) -> str:
        """Redact PII from text using defined patterns."""
        if not text:
            return text

        redacted = text
        for pattern, replacement in REDACTION_PATTERNS:
            redacted = re.sub(pattern, replacement, redacted)
        return redacted

    def log_conversation_turn(
        self,
        user_input: str,
        response: str,
        function_calls: list[Any] | None = None,
        duration_ms: float | None = None,
        tokens_used: int | None = None,
        attachments_count: int = 0,
        is_multimodal: bool = False,
        tool_names: list[str] | None = None,
    ) -> None:
        """
        Log a conversation turn securely.
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

        should_log_content = self._should_log_content()

        # Prepare content previews (redacted or hidden)
        if should_log_content:
            user_preview = self._redact_content(turn.user_input[:LOG_PREVIEW_LENGTH].replace("\\n", " "))
            if len(turn.user_input) > LOG_PREVIEW_LENGTH:
                user_preview += "..."

            response_preview = self._redact_content(turn.response[:LOG_PREVIEW_LENGTH].replace("\\n", " "))
            if len(turn.response) > LOG_PREVIEW_LENGTH:
                response_preview += "..."
        else:
            user_preview = "[HIDDEN]"
            response_preview = "[HIDDEN]"

        # Build concise message
        msg_parts = [f"User: {user_preview} → AI: {response_preview}"]

        if turn.function_calls:
            msg_parts.append(f"[{len(turn.function_calls)} functions]")

        if turn.duration_ms:
            msg_parts.append(f"[{turn.duration_ms:.0f}ms]")

        if turn.tokens_used:
            msg_parts.append(f"[{turn.tokens_used} tokens]")

        # Log structure
        extra_data = {
            "conversation_turn": True,
            "timestamp": turn.timestamp,
            "session_id": turn.session_id,
            "chars_input": len(turn.user_input),
            "chars_response": len(turn.response),
            "functions": len(turn.function_calls),
            "content_logging": should_log_content,
        }

        # Optional metadata fields
        if attachments_count > 0:
            extra_data["attachments"] = attachments_count
        if is_multimodal:
            extra_data["multimodal"] = True
        if tool_names:
            extra_data["tool_names"] = tool_names

        # Only add performance metrics if present
        if turn.duration_ms is not None:
            extra_data["ms"] = int(turn.duration_ms)
        if turn.tokens_used is not None:
            extra_data["tokens"] = turn.tokens_used

        # Enrich with request context
        extra_data = self._enrich_context(extra_data)

        self.logger.info(" ".join(msg_parts), extra=extra_data)

    def log_function_call(self, function_name: str, args: dict[str, Any], result: Any) -> None:
        """
        Log a function call - secure version.
        """
        should_log_content = self._should_log_content()

        if should_log_content:
            # Redact args for logging
            args_str = str(args)
            redacted_args = self._redact_content(args_str)

            # Console: Verbose redacted
            console_msg = f"Function call: {function_name}({redacted_args}) → {str(result)[:50]}..."

            # File: Concise redacted
            file_msg = f"Func: {function_name}({redacted_args[:50]}...) → {str(result)[:20]}..."
        else:
            # Metadata only
            console_msg = f"Function call: {function_name}(...) -> [HIDDEN]"
            file_msg = f"Func: {function_name} -> [HIDDEN]"

        extra_data = {"file_message": file_msg, "func": function_name, "content_logging": should_log_content}
        extra_data = self._enrich_context(extra_data)

        self.logger.info(console_msg, extra=extra_data)


# Global logger instance
logger = ChatLogger()
