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
            # Use file_message if available, otherwise use regular message
            message = getattr(record, 'file_message', record.getMessage())
            
            # Start with minimal essential fields
            log_data = {
                'ts': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
                'lvl': record.levelname[0],  # Just first letter: I, W, E, D
                'msg': message  # Use the potentially shortened message
            }
            
            # Only add important extra fields if they exist
            important_fields = ['session_id', 'ms', 'tokens', 'chars', 'functions', 'func']
            
            for field in important_fields:
                if hasattr(record, field):
                    value = getattr(record, field)
                    if value is not None:  # Only add if not None
                        log_data[field] = value
            
            # Add error info if present
            if record.exc_info:
                log_data['error'] = self.formatException(record.exc_info)
                
            # Return compact single-line JSON
            return json.dumps(log_data, separators=(',', ':'))


class ConversationFilter(logging.Filter):
    """Filter to allow all INFO level logs for conversations"""
    def filter(self, record):
        # Allow all INFO and above logs (not DEBUG)
        return record.levelno >= logging.INFO


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
        # Use concise format for JSON logger too
        conv_formatter = jsonlogger.JsonFormatter(
            '%(asctime)s %(levelname)s %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            rename={'asctime': 'ts', 'levelname': 'lvl', 'message': 'msg'}
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
        # Create concise summary for log file
        user_preview = user_input[:50].replace('\n', ' ')
        if len(user_input) > 50:
            user_preview += "..."
        
        response_preview = response[:50].replace('\n', ' ')
        if len(response) > 50:
            response_preview += "..."
        
        # Build concise message
        msg_parts = [f"User: {user_preview} → AI: {response_preview}"]
        
        if function_calls:
            msg_parts.append(f"[{len(function_calls)} functions]")
        
        if duration_ms:
            msg_parts.append(f"[{duration_ms:.0f}ms]")
            
        if tokens_used:
            msg_parts.append(f"[{tokens_used} tokens]")
        
        # Log concise message with minimal extra data
        extra_data = {
            'conversation_turn': True,  # Flag for filter
            'timestamp': datetime.utcnow().isoformat(),
            'session_id': self.session_id,
            'chars': len(user_input) + len(response),
            'functions': len(function_calls) if function_calls else 0
        }
        
        # Only add performance metrics if present
        if duration_ms is not None:
            extra_data['ms'] = int(duration_ms)
        if tokens_used is not None:
            extra_data['tokens'] = tokens_used
            
        # Log with special flag for conversation filter
        self.logger.info(" ".join(msg_parts), extra=extra_data)
        
    def log_function_call(self, function_name: str, args: dict, result: Any):
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
        result_str = str(result)[:50]
        if len(str(result)) > 50:
            result_str += "..."
        
        file_msg = f"Func: {function_name}({args_summary}) → {result_str}"
        
        # Log different messages to console vs file
        # Console handler will show console_msg, file handler will show file_msg
        # We'll use a custom attribute to differentiate
        self.logger.info(console_msg, extra={'file_message': file_msg, 'func': function_name})


# Global logger instance
logger = ChatLogger()