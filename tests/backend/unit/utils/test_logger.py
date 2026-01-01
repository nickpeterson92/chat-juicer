"""Tests for logger module with security improvements.

Tests logging configuration, handlers, structure, and secure PII redaction.
"""

from __future__ import annotations

import logging

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


class TestChatLoggerSecurity:
    """Tests for ChatLogger security features (redaction, opt-in logging)."""

    def test_redact_content_email(self) -> None:
        """Test email redaction."""
        logger_inst = ChatLogger("test-security")
        text = "Contact me at user@example.com please."
        redacted = logger_inst._redact_content(text)
        assert "[EMAIL]" in redacted
        assert "user@example.com" not in redacted

    def test_redact_content_credit_card(self) -> None:
        """Test credit card redaction."""
        logger_inst = ChatLogger("test-security")
        text = "My card is 1234-5678-9012-3456 used here."
        redacted = logger_inst._redact_content(text)
        assert "[CARD]" in redacted
        assert "1234-5678-9012-3456" not in redacted

    def test_redact_content_api_key(self) -> None:
        """Test API key redaction."""
        logger_inst = ChatLogger("test-security")
        text = "Key: sk-1234567890abcdef12345678 is secret."
        redacted = logger_inst._redact_content(text)
        assert "[API_KEY]" in redacted
        assert "sk-1234567890abcdef12345678" not in redacted

    def test_log_content_disabled_by_default(self) -> None:
        """Test that content is hidden by default."""
        with patch("utils.logger.get_settings") as mock_settings:
            mock_settings.return_value.enable_content_logging = False

            chat_logger = ChatLogger("test-hidden")
            chat_logger.logger = Mock()

            chat_logger.log_conversation_turn("Secret input", "Secret output")

            call_args = chat_logger.logger.info.call_args
            message = call_args[0][0]
            extra = call_args[1]["extra"]

            assert "[HIDDEN]" in message
            assert "Secret" not in message
            assert extra["content_logging"] is False

    def test_log_content_enabled_redacted(self) -> None:
        """Test that content is logged but redacted when enabled."""
        with patch("utils.logger.get_settings") as mock_settings:
            mock_settings.return_value.enable_content_logging = True

            chat_logger = ChatLogger("test-visible")
            chat_logger.logger = Mock()

            chat_logger.log_conversation_turn("My email is test@test.com", "Confirmed test@test.com")

            call_args = chat_logger.logger.info.call_args
            message = call_args[0][0]

            assert "[EMAIL]" in message
            assert "test@test.com" not in message

    def test_log_function_call_hidden_by_default(self) -> None:
        """Test function args hidden by default."""
        with patch("utils.logger.get_settings") as mock_settings:
            mock_settings.return_value.enable_content_logging = False

            chat_logger = ChatLogger("test-func-hidden")
            chat_logger.logger = Mock()

            chat_logger.log_function_call("my_func", {"secret": "value"}, "result")

            call_args = chat_logger.logger.info.call_args
            message = call_args[0][0]  # Console message
            extra = call_args[1]["extra"]
            file_msg = extra["file_message"]

            assert "..." in message or "[HIDDEN]" in message
            assert "value" not in message
            assert "[HIDDEN]" in file_msg


class TestChatLoggerIntegration:
    """Integration tests covering context injection and global instance."""

    def test_context_injection(self) -> None:
        """Test that request context is injected if available."""
        from api.middleware.request_context import RequestContext, set_request_context

        ctx = RequestContext(request_id="req_123", session_id="sess_abc")
        set_request_context(ctx)

        chat_logger = ChatLogger("test-context")
        chat_logger.logger = Mock()

        chat_logger.info("Test context")

        call_args = chat_logger.logger.info.call_args
        extra = call_args[1]["extra"]

        assert extra["request_id"] == "req_123"
        assert extra["session_id"] == "sess_abc"

    def test_global_logger_instance(self) -> None:
        """Test that global logger instance is created."""
        from utils.logger import logger as global_logger

        assert isinstance(global_logger, ChatLogger)
        assert global_logger.logger is not None
