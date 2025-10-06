"""
Utils Module - Infrastructure Utilities and Support Functions
==============================================================

Provides infrastructure utilities for logging, token management, IPC communication,
file operations, and document processing.

Modules:
    logger: Enterprise-grade JSON structured logging with rotation
    token_utils: Token counting and optimization with LRU caching
    ipc: IPC message formatting for Electron ↔ Python communication
    file_utils: File system operations with validation and error handling
    document_processor: Document content optimization and summarization

Key Components:

Logging (logger.py):
    Structured JSON logging with multiple handlers:
    - Console handler: Human-readable format to stderr (debug mode)
    - Conversation handler: JSON Lines format to logs/conversations.jsonl
    - Error handler: JSON Lines format to logs/errors.jsonl

    Features:
    - Automatic session ID injection
    - Log rotation (10MB files, 5 conversation logs, 3 error logs)
    - Token tracking in log metadata
    - Function call logging with concise summaries

Token Management (token_utils.py):
    Exact token counting using tiktoken with LRU caching:
    - count_tokens(): Precise token counts for any model
    - LRU cache for last 128 unique (text, model) pairs

    Supports all models: GPT-5, GPT-4o, GPT-4, GPT-3.5-turbo

IPC Communication (ipc.py):
    Message formatting for Electron frontend:
    - Pre-cached JSON templates for performance
    - __JSON__delimiter__JSON__ format for reliable parsing
    - Structured message types (bot_message, function_*, token_update, error)

File Operations (file_utils.py):
    Safe file system operations:
    - Path validation and sanitization
    - Atomic file writes with error handling
    - Parent directory creation
    - Extension and permission checking

Document Processing (document_processor.py):
    Content optimization for context windows:
    - Automatic summarization for large documents (>7k tokens)
    - Whitespace and separator optimization
    - Header deduplication
    - Maintains technical accuracy while reducing tokens

Performance Optimizations:
    - LRU caching for token counting (avoid redundant encoding)
    - Pre-cached IPC templates (reduce JSON serialization overhead)
    - Lazy imports where appropriate
    - Efficient log rotation with compression

Example:
    Logging with token tracking::

        from utils.logger import logger

        logger.info(
            "Document generated successfully",
            tokens=1234,
            functions="generate_document"
        )

    Token counting with caching::

        from utils.token_utils import count_tokens

        result = count_tokens("Some text", "gpt-5-mini")
        print(f"Exact tokens: {result['exact_tokens']}")

    IPC message formatting::

        from utils.ipc import IPCManager

        ipc = IPCManager()
        ipc.send_bot_message("Hello from Python!")
        ipc.send_token_update(input_tokens=100, output_tokens=50)

    File operations with validation::

        from utils.file_utils import validate_file_path, write_file_content

        path, error = validate_file_path("output/doc.md", check_exists=False)
        if not error:
            await write_file_content(path, "Content here")

See Also:
    :mod:`core.constants`: Configuration values for logging and token limits
    :mod:`integrations.sdk_token_tracker`: Automatic token tracking for tool calls
"""
