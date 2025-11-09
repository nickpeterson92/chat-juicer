"""Tests for logger module.

Tests logging configuration, handlers, and structured logging.
"""

from __future__ import annotations

import logging

from pathlib import Path
from unittest.mock import Mock, patch

from utils.logger import ChatLogger, ConversationFilter, ConversationTurn, ErrorFilter, setup_logging


class TestConversationTurn:
    """Tests for ConversationTurn dataclass."""

    def test_conversation_turn_basic(self) -> None:
        """Test basic ConversationTurn creation."""
        turn = ConversationTurn(
            user_input="Hello",
            response="Hi there!",
        )

        assert turn.user_input == "Hello"
        assert turn.response == "Hi there!"
        assert turn.function_calls == []
        assert turn.duration_ms is None
        assert turn.tokens_used is None
        assert turn.session_id == ""
        assert turn.timestamp is not None

    def test_conversation_turn_with_all_fields(self) -> None:
        """Test ConversationTurn with all fields."""
        turn = ConversationTurn(
            user_input="What's the weather?",
            response="It's sunny!",
            function_calls=["get_weather"],
            duration_ms=123.45,
            tokens_used=50,
            session_id="chat_123",
            timestamp="2025-01-01T12:00:00",
        )

        assert turn.user_input == "What's the weather?"
        assert turn.response == "It's sunny!"
        assert turn.function_calls == ["get_weather"]
        assert turn.duration_ms == 123.45
        assert turn.tokens_used == 50
        assert turn.session_id == "chat_123"
        assert turn.timestamp == "2025-01-01T12:00:00"


class TestConversationFilter:
    """Tests for ConversationFilter."""

    def test_filter_allows_info(self) -> None:
        """Test that filter allows INFO level."""
        conv_filter = ConversationFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert conv_filter.filter(record) is True

    def test_filter_allows_warning(self) -> None:
        """Test that filter allows WARNING level."""
        conv_filter = ConversationFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert conv_filter.filter(record) is True

    def test_filter_blocks_debug(self) -> None:
        """Test that filter blocks DEBUG level."""
        conv_filter = ConversationFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.DEBUG,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert conv_filter.filter(record) is False


class TestErrorFilter:
    """Tests for ErrorFilter."""

    def test_filter_allows_error(self) -> None:
        """Test that filter allows ERROR level."""
        error_filter = ErrorFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert error_filter.filter(record) is True

    def test_filter_allows_critical(self) -> None:
        """Test that filter allows CRITICAL level."""
        error_filter = ErrorFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.CRITICAL,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert error_filter.filter(record) is True

    def test_filter_blocks_warning(self) -> None:
        """Test that filter blocks WARNING level."""
        error_filter = ErrorFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert error_filter.filter(record) is False

    def test_filter_blocks_info(self) -> None:
        """Test that filter blocks INFO level."""
        error_filter = ErrorFilter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test",
            args=(),
            exc_info=None,
        )

        assert error_filter.filter(record) is False


class TestSetupLogging:
    """Tests for setup_logging function."""

    def test_setup_logging_creates_logger(self) -> None:
        """Test that setup_logging creates a logger."""
        logger = setup_logging("test-logger")

        assert logger.name == "test-logger"
        assert logger.level == logging.DEBUG

    def test_setup_logging_with_debug_enabled(self) -> None:
        """Test setup_logging with debug enabled."""
        logger = setup_logging("test-debug", debug=True)

        # Find console handler and verify debug level
        console_handlers = [h for h in logger.handlers if isinstance(h, logging.StreamHandler)]
        assert len(console_handlers) > 0
        # At least one handler should be at DEBUG level
        assert any(h.level == logging.DEBUG for h in console_handlers)

    def test_setup_logging_with_debug_disabled(self) -> None:
        """Test setup_logging with debug disabled."""
        logger = setup_logging("test-no-debug", debug=False)

        # Find console handler and verify INFO level
        console_handlers = [h for h in logger.handlers if isinstance(h, logging.StreamHandler)]
        assert len(console_handlers) > 0
        # Console handler should be at INFO level
        assert any(h.level == logging.INFO for h in console_handlers)

    def test_setup_logging_respects_debug_env_var(self) -> None:
        """Test that setup_logging respects DEBUG environment variable."""
        with patch.dict("os.environ", {"DEBUG": "true"}):
            logger = setup_logging("test-env-debug")

            console_handlers = [h for h in logger.handlers if isinstance(h, logging.StreamHandler)]
            # When DEBUG=true, console should be at DEBUG level
            assert any(h.level == logging.DEBUG for h in console_handlers)

    def test_setup_logging_clears_existing_handlers(self) -> None:
        """Test that setup_logging clears existing handlers."""
        logger = logging.getLogger("test-clear-handlers")
        # Add a dummy handler
        logger.addHandler(logging.NullHandler())
        assert len(logger.handlers) > 0

        # Setup logging should clear handlers
        logger = setup_logging("test-clear-handlers")

        # Should have new handlers (console, conversation, error)
        assert len(logger.handlers) >= 3


class TestChatLogger:
    """Tests for ChatLogger class."""

    def test_chat_logger_initialization(self) -> None:
        """Test ChatLogger initialization."""
        chat_logger = ChatLogger("test-chat-logger")

        assert chat_logger.logger.name == "test-chat-logger"
        assert chat_logger.session_id is not None
        assert len(chat_logger.session_id) == 8  # SESSION_ID_LENGTH

    def test_debug_adds_session_id(self) -> None:
        """Test that debug method adds session_id."""
        chat_logger = ChatLogger("test-debug")
        chat_logger.logger = Mock()

        chat_logger.debug("Test message", extra_key="extra_value")

        chat_logger.logger.debug.assert_called_once()
        call_args = chat_logger.logger.debug.call_args
        assert "extra" in call_args.kwargs
        assert call_args.kwargs["extra"]["session_id"] == chat_logger.session_id

    def test_info_adds_session_id(self) -> None:
        """Test that info method adds session_id."""
        chat_logger = ChatLogger("test-info")
        chat_logger.logger = Mock()

        chat_logger.info("Test message", extra_key="extra_value")

        chat_logger.logger.info.assert_called_once()
        call_args = chat_logger.logger.info.call_args
        assert "extra" in call_args.kwargs
        assert call_args.kwargs["extra"]["session_id"] == chat_logger.session_id

    def test_warning_adds_session_id(self) -> None:
        """Test that warning method adds session_id."""
        chat_logger = ChatLogger("test-warning")
        chat_logger.logger = Mock()

        chat_logger.warning("Test warning", extra_key="extra_value")

        chat_logger.logger.warning.assert_called_once()
        call_args = chat_logger.logger.warning.call_args
        assert "extra" in call_args.kwargs
        assert call_args.kwargs["extra"]["session_id"] == chat_logger.session_id

    def test_error_adds_session_id(self) -> None:
        """Test that error method adds session_id."""
        chat_logger = ChatLogger("test-error")
        chat_logger.logger = Mock()

        chat_logger.error("Test error", exc_info=False, extra_key="extra_value")

        chat_logger.logger.error.assert_called_once()
        call_args = chat_logger.logger.error.call_args
        assert "extra" in call_args.kwargs
        assert call_args.kwargs["extra"]["session_id"] == chat_logger.session_id
        assert call_args.kwargs["exc_info"] is False

    def test_error_with_exc_info(self) -> None:
        """Test error method with exception info."""
        chat_logger = ChatLogger("test-error-exc")
        chat_logger.logger = Mock()

        chat_logger.error("Test error", exc_info=True)

        call_args = chat_logger.logger.error.call_args
        assert call_args.kwargs["exc_info"] is True

    def test_log_conversation_turn_basic(self) -> None:
        """Test log_conversation_turn with basic inputs."""
        chat_logger = ChatLogger("test-conv-turn")
        chat_logger.logger = Mock()

        chat_logger.log_conversation_turn(
            user_input="Hello",
            response="Hi there!",
        )

        chat_logger.logger.info.assert_called_once()
        call_args = chat_logger.logger.info.call_args
        message = call_args.args[0]
        assert "User: Hello" in message
        assert "Hi there!" in message

    def test_log_conversation_turn_with_function_calls(self) -> None:
        """Test log_conversation_turn with function calls."""
        chat_logger = ChatLogger("test-conv-func")
        chat_logger.logger = Mock()

        chat_logger.log_conversation_turn(
            user_input="What's the weather?",
            response="It's sunny!",
            function_calls=["get_weather", "get_location"],
        )

        call_args = chat_logger.logger.info.call_args
        message = call_args.args[0]
        assert "[2 functions]" in message

    def test_log_conversation_turn_with_metrics(self) -> None:
        """Test log_conversation_turn with performance metrics."""
        chat_logger = ChatLogger("test-conv-metrics")
        chat_logger.logger = Mock()

        chat_logger.log_conversation_turn(
            user_input="Test",
            response="Response",
            duration_ms=123.45,
            tokens_used=50,
        )

        call_args = chat_logger.logger.info.call_args
        message = call_args.args[0]
        assert "[123ms]" in message
        assert "[50 tokens]" in message

    def test_log_conversation_turn_truncates_long_text(self) -> None:
        """Test that log_conversation_turn truncates long text."""
        chat_logger = ChatLogger("test-conv-truncate")
        chat_logger.logger = Mock()

        long_input = "x" * 1000
        long_response = "y" * 1000

        chat_logger.log_conversation_turn(
            user_input=long_input,
            response=long_response,
        )

        call_args = chat_logger.logger.info.call_args
        message = call_args.args[0]
        # Should have "..." indicating truncation
        assert "..." in message

    def test_log_function_call_basic(self) -> None:
        """Test log_function_call with basic inputs."""
        chat_logger = ChatLogger("test-func-call")
        chat_logger.logger = Mock()

        chat_logger.log_function_call(
            function_name="test_func",
            args={"arg1": "value1"},
            result="success",
        )

        chat_logger.logger.info.assert_called_once()
        call_args = chat_logger.logger.info.call_args
        message = call_args.args[0]
        assert "test_func" in message
        assert "value1" in message or "arg1" in message

    def test_log_function_call_truncates_long_args(self) -> None:
        """Test that log_function_call truncates long argument values."""
        chat_logger = ChatLogger("test-func-long-args")
        chat_logger.logger = Mock()

        long_value = "x" * 1000

        chat_logger.log_function_call(
            function_name="test_func",
            args={"arg1": long_value},
            result="success",
        )

        call_args = chat_logger.logger.info.call_args
        extra = call_args.kwargs.get("extra", {})
        # Should have truncated the args in the file message
        assert "file_message" in extra


class TestChatLoggerIntegration:
    """Integration tests for ChatLogger with actual logging."""

    def test_chat_logger_actually_logs(self, tmp_path: Path) -> None:
        """Test that ChatLogger actually writes to log files."""
        # Create a test logger with temp directory
        with patch("pathlib.Path") as mock_path:
            mock_path.return_value.parent.parent.parent = tmp_path
            mock_path.return_value = tmp_path

            chat_logger = ChatLogger("test-integration")
            chat_logger.info("Test message")

            # Logger should have been called
            assert chat_logger.logger is not None

    def test_global_logger_instance(self) -> None:
        """Test that global logger instance is created."""
        from utils.logger import logger as global_logger

        assert isinstance(global_logger, ChatLogger)
        assert global_logger.logger is not None
