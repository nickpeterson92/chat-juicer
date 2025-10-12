"""
Models Module - Data Models and Type Definitions
=================================================

Provides Pydantic models for type safety, runtime validation, and API responses.
All models use Pydantic v2 for automatic validation and JSON serialization.

Modules:
    api_models: Response models for tool function outputs
    event_models: Models for IPC event messages between Electron and Python
    session_models: Session management and command models with runtime validation
    sdk_models: Protocol typing for OpenAI SDK integration (type checking only)

Key Components:

API Response Models (api_models.py):
    Standardized response schemas for all function tools:
    - DirectoryListResponse: File/folder listings with metadata
    - FileReadResponse: File content with format information
    - DocumentGenerateResponse: Document generation results
    - TextEditResponse: Text editing operation results

    All models include:
    - success: bool flag for operation status
    - error: Optional error message
    - to_json(): Serialization method for function returns

Event Models (event_models.py):
    IPC message models for Electron ↔ Python communication:
    - FunctionEventMessage: Function call events (detected/completed)
    - TokenUsageMessage: Token tracking updates
    - ErrorEventMessage: Error notifications

    Used for:
    - Real-time UI updates during tool execution
    - Token count display in frontend
    - Error handling and recovery

Session Models (session_models.py):
    Session management models with Pydantic validation:
    - SessionMetadata: Session metadata with runtime validation
    - SessionCommand: Type-safe session commands (new/switch/delete/list)
    - ContentItem: Message content type definitions for MessageNormalizer

    Features:
    - Runtime validation (session_id format, timestamps, message counts)
    - Type-safe command dispatch with discriminated unions
    - Automatic JSON serialization via model_dump()
    - Field constraints (min/max length, non-negative counts)

SDK Models (sdk_models.py):
    Protocol-based typing for OpenAI SDK structures:
    - RunItemStreamEvent: Agent/Runner streaming event protocol
    - AgentUpdatedStreamEvent: Agent state change protocol
    - ToolCallItem: Tool call structure protocol

    Purpose:
    - Type checking without runtime overhead
    - SDK integration without dependencies
    - Duck typing with structural subtyping

Benefits:
    - Automatic validation at runtime (Pydantic)
    - Type safety during development (mypy strict)
    - Self-documenting API responses
    - JSON serialization built-in
    - Consistent error handling

Example:
    Using response models in tools::

        from models.api_models import DocumentGenerateResponse

        async def generate_document(content: str, output_file: str) -> str:
            try:
                # ... generate document ...
                return DocumentGenerateResponse(
                    success=True,
                    output_file=output_file,
                    size=byte_count,
                    message="Document saved"
                ).to_json()
            except Exception as e:
                return DocumentGenerateResponse(
                    success=False,
                    error=str(e)
                ).to_json()

    Using event models for IPC::

        from models.event_models import FunctionEventMessage

        event = FunctionEventMessage(
            type="function_completed",
            call_id="abc123",
            success=True,
            output="Operation completed"
        )
        print(f"__JSON__{event.to_json()}__JSON__")

See Also:
    :mod:`tools`: Functions that use these response models
    :mod:`utils.ipc`: IPC communication using event models
    :mod:`integrations.event_handlers`: Event processing for Agent/Runner streams
"""
