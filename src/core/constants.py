"""
Constants and configuration for Chat Juicer.
Centralizes all magic numbers and configuration values.
Includes Pydantic validation for environment variables.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# File size limits
MAX_BACKUP_VERSIONS = 10

# Token optimization thresholds
TOKEN_OPTIMIZATION_THRESHOLD = 1000  # Only optimize content > 1000 tokens
MAX_SEPARATOR_LENGTH = 20  # Truncate separators to this length

# Logging configuration
LOG_MAX_SIZE = 10 * 1024 * 1024  # 10MB
LOG_BACKUP_COUNT_CONVERSATIONS = 5
LOG_BACKUP_COUNT_ERRORS = 3
LOG_PREVIEW_LENGTH = 50  # Characters for preview in logs

# File processing
CONVERTIBLE_EXTENSIONS = {
    # Microsoft Office formats
    ".xlsx",
    ".xls",  # Excel
    ".docx",
    ".doc",  # Word
    ".pptx",
    ".ppt",  # PowerPoint
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
    # Image formats (if LLM client configured)
    ".jpg",
    ".jpeg",  # JPEG images
    ".png",  # PNG images
    ".gif",  # GIF images
    ".bmp",  # Bitmap images
    ".tiff",
    ".tif",  # TIFF images
    ".webp",  # WebP images
}

TEMPLATE_EXTENSIONS = [".md", ".txt", ".template", ""]

# System limits
SESSION_ID_LENGTH = 8

# Agent/Runner Event Types
RUN_ITEM_STREAM_EVENT = "run_item_stream_event"
AGENT_UPDATED_STREAM_EVENT = "agent_updated_stream_event"

# Item Types for streaming events
MESSAGE_OUTPUT_ITEM = "message_output_item"
TOOL_CALL_ITEM = "tool_call_item"
REASONING_ITEM = "reasoning_item"
TOOL_CALL_OUTPUT_ITEM = "tool_call_output_item"
HANDOFF_CALL_ITEM = "handoff_call_item"
HANDOFF_OUTPUT_ITEM = "handoff_output_item"

# SDK Token Tracking source labels
TOKEN_SOURCE_TOOL_CALL = "tool_call"
TOKEN_SOURCE_TOOL_OUTPUT = "tool_output"
TOKEN_SOURCE_TOOL_ERROR = "tool_error"
TOKEN_SOURCE_REASONING = "reasoning"
TOKEN_SOURCE_HANDOFF = "handoff"
TOKEN_SOURCE_UNKNOWN = "unknown"

# MCP Server Configuration
# (Tool call delay patches removed - no longer needed with client-side sessions)

# Token Management Configuration
CONVERSATION_SUMMARIZATION_THRESHOLD = 0.2  # Trigger conversation summarization at configured % of model's token limit
KEEP_LAST_N_MESSAGES = 2  # Keep last N messages when summarizing (1 user-assistant pair)
DOCUMENT_SUMMARIZATION_THRESHOLD = (
    7000  # Amount of tokens to trigger document summarization during read_file operations.
)
# Model Token Limits
# Using INPUT limits since that's what we're tracking for summarization
MODEL_TOKEN_LIMITS: dict[str, int] = {
    # GPT-5 models
    "gpt-5": 272000,
    "gpt-5-mini": 272000,
    "gpt-5-nano": 272000,
    # GPT-4 models
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4": 128000,
    "gpt-4-turbo": 128000,
    # GPT-3.5 models
    "gpt-3.5-turbo": 15360,
    "gpt-35-turbo": 15360,  # Azure naming
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
