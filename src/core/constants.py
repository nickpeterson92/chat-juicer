"""
Constants and configuration for Chat Juicer.
Centralizes all magic numbers and configuration values.
Includes Pydantic validation for environment variables.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ============================================================================
# File Operations Configuration
# ============================================================================

#: Maximum number of backup versions to keep for generated files.
#: When create_backup=True in generate_document(), old versions are saved as
#: .backup, .backup1, .backup2, etc. up to this limit.
MAX_BACKUP_VERSIONS = 10

# ============================================================================
# Logging Configuration
# ============================================================================

#: Maximum size in bytes for log files before rotation (10MB).
#: When a log file reaches this size, it's rotated to .log.1, .log.2, etc.
LOG_MAX_SIZE = 10 * 1024 * 1024

#: Number of conversation log backups to retain during rotation.
#: Maintains the last 5 conversation log files (~50MB total).
LOG_BACKUP_COUNT_CONVERSATIONS = 5

#: Number of error log backups to retain during rotation.
#: Maintains the last 3 error log files (~30MB total).
LOG_BACKUP_COUNT_ERRORS = 3

#: Maximum characters to show in log previews for user input/response.
#: Keeps log files concise while preserving enough context for debugging.
LOG_PREVIEW_LENGTH = 50

# ============================================================================
# File Processing Configuration
# ============================================================================

#: File extensions that can be converted to markdown using markitdown.
#: The read_file() tool automatically converts these formats to text/markdown
#: for processing by the agent. Requires markitdown[all] for full support.
CONVERTIBLE_EXTENSIONS = {
    # Microsoft Office formats
    ".xlsx",
    ".xls",  # Excel spreadsheets
    ".docx",
    ".doc",  # Word documents
    ".pptx",
    ".ppt",  # PowerPoint presentations
    # Document formats
    ".pdf",  # PDF documents
    ".rtf",  # Rich Text Format
    ".odt",  # OpenDocument Text
    # Data formats
    ".csv",  # CSV files
    ".json",  # JSON data
    ".xml",  # XML data
    # Web formats
    ".html",
    ".htm",  # HTML files
    ".mhtml",
    ".mht",  # MHTML archives
    # Code/Notebook formats
    ".ipynb",  # Jupyter notebooks
    # Image formats (if LLM client configured in markitdown)
    ".jpg",
    ".jpeg",  # JPEG images
    ".png",  # PNG images
    ".gif",  # GIF images
    ".bmp",  # Bitmap images
    ".tiff",
    ".tif",  # TIFF images
    ".webp",  # WebP images
}

# ============================================================================
# System Configuration
# ============================================================================

#: Length of generated session IDs (hex characters).
#: Session IDs are used for log correlation and session tracking.
#: 8 hex chars = 4 bytes = 4.3 billion unique IDs.
SESSION_ID_LENGTH = 8

# ============================================================================
# Agent/Runner Event Types
# ============================================================================

#: Top-level streaming event type for run items (messages, tools, reasoning).
#: Used to identify Agent/Runner streaming events in the event loop.
RUN_ITEM_STREAM_EVENT = "run_item_stream_event"

#: Top-level streaming event type for agent state changes.
#: Fired when agent configuration or state is updated during execution.
AGENT_UPDATED_STREAM_EVENT = "agent_updated_stream_event"

# ============================================================================
# Run Item Types (for streaming events)
# ============================================================================

#: Item type for AI-generated text responses.
#: Contains content[] array with text/output_text items.
MESSAGE_OUTPUT_ITEM = "message_output_item"

#: Item type for function/tool call detection.
#: Contains tool name, arguments, and call_id for tracking.
TOOL_CALL_ITEM = "tool_call_item"

#: Item type for Sequential Thinking reasoning steps.
#: Contains structured reasoning with revision/branching capabilities.
REASONING_ITEM = "reasoning_item"

#: Item type for function/tool execution results.
#: Contains output from tool execution and associated call_id.
TOOL_CALL_OUTPUT_ITEM = "tool_call_output_item"

#: Item type for agent-to-agent handoff calls (future feature).
#: For multi-agent workflows with agent delegation.
HANDOFF_CALL_ITEM = "handoff_call_item"

#: Item type for agent handoff results (future feature).
#: Contains results from delegated agent execution.
HANDOFF_OUTPUT_ITEM = "handoff_output_item"

# ============================================================================
# SDK Token Tracking Source Labels
# ============================================================================

#: Token source label for native function call inputs.
#: Tracks tokens consumed when calling tools/functions.
TOKEN_SOURCE_TOOL_CALL = "tool_call"

#: Token source label for function output/results.
#: Tracks tokens in function return values.
TOKEN_SOURCE_TOOL_OUTPUT = "tool_output"

#: Token source label for function execution errors.
#: Tracks tokens in error messages and stack traces.
TOKEN_SOURCE_TOOL_ERROR = "tool_error"

#: Token source label for Sequential Thinking reasoning steps.
#: Tracks tokens consumed during MCP reasoning operations.
TOKEN_SOURCE_REASONING = "reasoning"

#: Token source label for agent handoffs (future feature).
#: Tracks tokens for inter-agent communication.
TOKEN_SOURCE_HANDOFF = "handoff"

#: Token source label for unclassified token usage.
#: Fallback for unexpected or unrecognized sources.
TOKEN_SOURCE_UNKNOWN = "unknown"

# ============================================================================
# MCP Server Configuration
# ============================================================================
# Note: Tool call delay patches removed - no longer needed with client-side sessions

# ============================================================================
# Session Summarization Configuration
# ============================================================================

#: Trigger conversation summarization at this fraction of model's token limit.
#: Example: 0.2 × GPT-5's 272k tokens = 54,400 token trigger point.
#: When total_tokens exceeds this threshold, TokenAwareSQLiteSession automatically
#: summarizes the conversation and resets the context.
CONVERSATION_SUMMARIZATION_THRESHOLD = 0.2

#: Number of recent user messages to keep when summarizing conversations.
#: Keeps the last N complete user-assistant exchanges unsummarized.
#: Value of 2 = last 2 user messages + their assistant responses preserved.
#: Tool calls between exchanges are included in the summary, not kept.
#: Used as default parameter in TokenAwareSQLiteSession.summarize_with_agent()
KEEP_LAST_N_MESSAGES = 2

#: Token count threshold for document summarization during read_file().
#: Documents exceeding this token count are automatically summarized to
#: fit within context windows while preserving technical accuracy.
#: Set to 7000 to allow ~3k tokens for summary + metadata.
DOCUMENT_SUMMARIZATION_THRESHOLD = 7000

# ============================================================================
# Model Token Limits (Input Context Windows)
# ============================================================================

#: Model-specific input token limits for conversation tracking.
#: These are INPUT limits (not output) since we track conversation context,
#: not generation tokens. Used by TokenAwareSQLiteSession for auto-summarization.
#:
#: Format: {"model-name": input_token_limit}
#:
#: Notes:
#: - Values are approximate and may change with model updates
#: - Conservative limits preferred to avoid context overflow
#: - Azure model names (gpt-35-turbo) included for compatibility
MODEL_TOKEN_LIMITS: dict[str, int] = {
    # GPT-5 models (272k input context)
    "gpt-5": 272000,
    "gpt-5-mini": 272000,
    "gpt-5-nano": 272000,
    # GPT-4 models (128k input context)
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4": 128000,
    "gpt-4-turbo": 128000,
    # GPT-3.5 models (16k input, conservative 15.3k limit)
    "gpt-3.5-turbo": 15360,
    "gpt-35-turbo": 15360,  # Azure naming convention
}

# ============================================================================
# Environment Configuration with Pydantic Validation
# ============================================================================


class Settings(BaseSettings):
    """Environment settings with validation.

    Loads from environment variables and .env file.
    Validates at startup to fail fast on configuration errors.
    """

    # Required Azure OpenAI settings
    azure_openai_api_key: str = Field(..., description="Azure OpenAI API key for authentication")
    azure_openai_endpoint: HttpUrl = Field(..., description="Azure OpenAI endpoint URL")
    azure_openai_deployment: str = Field(default="gpt-5-mini", description="Azure OpenAI deployment name")

    # Optional debug setting
    debug: bool = Field(default=False, description="Enable debug logging")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,  # Allow both AZURE_OPENAI_API_KEY and azure_openai_api_key
        extra="ignore",  # Ignore extra environment variables
    )

    @field_validator("azure_openai_endpoint")
    @classmethod
    def ensure_endpoint_format(cls, v: HttpUrl) -> HttpUrl:
        """Ensure endpoint URL ends with trailing slash for OpenAI client."""
        url_str = str(v)
        if not url_str.endswith("/"):
            return HttpUrl(url_str + "/")
        return v

    @field_validator("azure_openai_api_key")
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        """Basic validation of API key format."""
        if not v or len(v) < 10:
            raise ValueError("Invalid API key format")
        return v

    @property
    def azure_endpoint_str(self) -> str:
        """Get endpoint as string for OpenAI client."""
        return str(self.azure_openai_endpoint)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance.

    Uses LRU cache to ensure we only load and validate settings once.
    This function will raise validation errors at startup if config is invalid.
    Pydantic will load from environment variables automatically.
    """
    return Settings()  # type: ignore[call-arg]  # Pydantic loads from env vars
