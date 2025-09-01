"""
Professional logging setup for Chat Juicer using Python's standard logging
with JSON formatting for structured logs.

Log destinations:
- Console (stderr): Human-readable format for debugging
- logs/conversations.jsonl: JSON format for conversation history
- logs/errors.jsonl: JSON format for error tracking
"""
import os
import sys
import logging
import logging.handlers
import json
import pathlib
from datetime import datetime
import uuid
from typing import Any, Optional

# Check if python-json-logger is installed, otherwise use fallback
try:
    from pythonjsonlogger import jsonlogger
    HAS_JSON_LOGGER = True
except ImportError:
    HAS_JSON_LOGGER = False
    # Fallback JSON formatter
    class JsonFormatter(logging.Formatter):
        def format(self, record):
            log_data = {
                'timestamp': datetime.utcnow().isoformat(),
                'level': record.levelname,
                'logger': record.name,
                'message': record.getMessage(),
                'module': record.module,
                'function': record.funcName,
                'line': record.lineno
            }
            # Add all extra fields from the record
            # Skip internal logging attributes
            skip_attrs = {'name', 'msg', 'args', 'created', 'filename', 'funcName', 
                         'levelname', 'levelno', 'lineno', 'module', 'msecs', 
                         'message', 'pathname', 'process', 'processName', 
                         'relativeCreated', 'thread', 'threadName', 'exc_info',
                         'exc_text', 'stack_info'}
            for key, value in record.__dict__.items():
                if key not in skip_attrs:
                    log_data[key] = value
            return json.dumps(log_data)


class ConversationFilter(logging.Filter):
    """Filter to only allow conversation turn logs"""
    def filter(self, record):
        return hasattr(record, 'conversation_turn') and record.conversation_turn


class ErrorFilter(logging.Filter):
    """Filter to only allow ERROR and CRITICAL logs"""
    def filter(self, record):
        return record.levelno >= logging.ERROR


def setup_logging(name: str = "chat-juicer", debug: bool = None) -> logging.Logger:
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
        debug = os.getenv('DEBUG', 'false').lower() in ('true', '1', 'yes')
    
    # --- Console Handler (Human-readable) ---
    # Always add console handler to stderr for debugging
    # This goes to terminal, not Electron (due to stdio configuration)
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.DEBUG if debug else logging.INFO)
    
    # Simple format for console
    console_format = '%(asctime)s [%(levelname)8s] %(name)s - %(message)s'
    console_handler.setFormatter(logging.Formatter(
        console_format,
        datefmt='%H:%M:%S'
    ))
    logger.addHandler(console_handler)
    
    # --- Conversation Log Handler (JSON) ---
    # Use absolute path to project root logs directory
    project_root = pathlib.Path(__file__).parent.parent
    log_dir = project_root / 'logs'
    log_dir.mkdir(exist_ok=True)
    
    conv_handler = logging.handlers.RotatingFileHandler(
        log_dir / 'conversations.jsonl',
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    conv_handler.setLevel(logging.INFO)
    conv_handler.addFilter(ConversationFilter())
    
    if HAS_JSON_LOGGER:
        conv_formatter = jsonlogger.JsonFormatter(
            '%(timestamp)s %(session_id)s %(user_input)s %(response)s %(function_calls)s',
            timestamp=True
        )
    else:
        conv_formatter = JsonFormatter()
    
    conv_handler.setFormatter(conv_formatter)
    logger.addHandler(conv_handler)
    
    # --- Error Log Handler (JSON) ---
    error_handler = logging.handlers.RotatingFileHandler(
        log_dir / 'errors.jsonl',
        maxBytes=10*1024*1024,  # 10MB
        backupCount=3
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.addFilter(ErrorFilter())
    
    if HAS_JSON_LOGGER:
        error_formatter = jsonlogger.JsonFormatter(
            '%(timestamp)s %(levelname)s %(name)s %(message)s %(exc_info)s',
            timestamp=True
        )
    else:
        error_formatter = JsonFormatter()
    
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
        self.session_id = str(uuid.uuid4())[:8]
        
    def debug(self, message: str, **kwargs):
        """Debug level logging"""
        self.logger.debug(message, extra=kwargs)
        
    def info(self, message: str, **kwargs):
        """Info level logging"""
        self.logger.info(message, extra=kwargs)
        
    def warning(self, message: str, **kwargs):
        """Warning level logging"""
        self.logger.warning(message, extra=kwargs)
        
    def error(self, message: str, exc_info=False, **kwargs):
        """Error level logging with optional exception info"""
        self.logger.error(message, extra=kwargs, exc_info=exc_info)
        
    def log_conversation_turn(self, 
                            user_input: str, 
                            response: str,
                            function_calls: Optional[list] = None,
                            duration_ms: Optional[float] = None,
                            tokens_used: Optional[int] = None):
        """
        Log a complete conversation turn to conversations.jsonl
        
        Args:
            user_input: The user's input text
            response: The AI's response text
            function_calls: List of function calls made
            duration_ms: Response time in milliseconds
            tokens_used: Number of tokens used
        """
        extra_data = {
            'conversation_turn': True,  # Flag for filter
            'timestamp': datetime.utcnow().isoformat(),
            'session_id': self.session_id,
            'user_input': user_input,
            'response': response,
            'function_calls': function_calls or [],
            'user_input_length': len(user_input),
            'response_length': len(response),
            'has_function_calls': bool(function_calls),
            'function_count': len(function_calls) if function_calls else 0
        }
        
        if duration_ms is not None:
            extra_data['duration_ms'] = duration_ms
        if tokens_used is not None:
            extra_data['tokens_used'] = tokens_used
            
        # Log with special flag for conversation filter
        self.logger.info(
            f"Turn: {user_input[:50]}... → {response[:50]}...",
            extra=extra_data
        )
        
    def log_function_call(self, function_name: str, args: dict, result: Any):
        """
        Log a function call for debugging.
        
        Args:
            function_name: Name of the function called
            args: Arguments passed to the function
            result: Result returned by the function
        """
        self.debug(
            f"Function call: {function_name}",
            function_name=function_name,
            arguments=args,
            result=str(result)
        )


# Global logger instance
logger = ChatLogger()