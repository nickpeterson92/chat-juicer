"""
Constants and configuration for Chat Juicer.
Centralizes all magic numbers and configuration values.
Includes Pydantic validation for environment variables.
"""

from __future__ import annotations

import os
import threading

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from models.schemas.config import ReasoningLevelConfig

from pydantic import Field, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic_settings.sources import (
    DotEnvSettingsSource,
    PydanticBaseSettingsSource,
)

# ============================================================================
# Project Paths
# ============================================================================

#: Project root directory (parent of src/)
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

#: Data files directory for session workspaces
DATA_FILES_PATH = PROJECT_ROOT / "data" / "files"

#: Global templates directory
TEMPLATES_PATH = PROJECT_ROOT / "templates"

# ============================================================================
# Model Configuration - Single Source of Truth
# ============================================================================


@dataclass(frozen=True, slots=True)
class ModelConfig:
    """Single source of truth for model configuration.

    All model-related constants are derived from MODEL_CONFIGS tuple.
    To add a new model, add ONE entry to MODEL_CONFIGS below.

    Attributes:
        id: API model name (e.g., "gpt-5.1")
        display_name: Human-readable name for UI (e.g., "GPT-5.1")
        description: Short description for model selector
        token_limit: Maximum input context window size
        supports_reasoning: Whether model supports reasoning_effort parameter
        is_primary: Whether to show prominently in UI model selector
        is_ui_model: Whether model appears in frontend UI selector
        model_family: Optional family grouping for sub-dropdown (e.g., "gpt-5", "gpt-4.1")
    """

    id: str
    display_name: str
    description: str
    token_limit: int
    supports_reasoning: bool
    is_primary: bool
    is_ui_model: bool = True  # Default True for backward compatibility
    model_family: str | None = None  # Optional family for sub-dropdown grouping


#: Master model configuration - ADD NEW MODELS HERE ONLY!
#: Order determines display order in UI model selector.
#: Models with is_ui_model=False are backend-only (for token limits, etc.)
#: model_family groups secondary models into sub-dropdowns (e.g., "gpt-5", "gpt-4.1")
MODEL_CONFIGS: tuple[ModelConfig, ...] = (
    # GPT-5.2/5.1 series (latest) - Primary models shown at top level
    ModelConfig("gpt-5.2", "GPT-5.2", "Latest and most capable model", 272000, True, True),
    ModelConfig("gpt-5.1", "GPT-5.1", "Advanced reasoning model", 272000, True, True),
    # GPT-5 series - Secondary models in "GPT-5 Models" sub-dropdown
    ModelConfig("gpt-5-pro", "GPT-5 Pro", "Most capable for complex tasks", 272000, True, False, is_ui_model=False),
    ModelConfig(
        "gpt-5.1-codex-max",
        "GPT-5.1 Codex Max",
        "Maximum capability code generation",
        272000,
        True,
        False,
        model_family="gpt-5.1",
    ),
    ModelConfig("gpt-5", "GPT-5", "Deep reasoning for hard problems", 272000, True, False, model_family="gpt-5"),
    ModelConfig(
        "gpt-5-mini", "GPT-5 Mini", "Smart and fast for everyday use", 272000, True, False, model_family="gpt-5"
    ),
    ModelConfig(
        "gpt-5-codex", "GPT-5 Codex", "Optimized for code generation", 272000, True, False, model_family="gpt-5"
    ),
    ModelConfig("gpt-5-nano", "GPT-5 Nano", "Lightweight reasoning model", 272000, True, False, is_ui_model=False),
    # GPT-4.1 series (non-reasoning) - Secondary models in "GPT-4.1 Models" sub-dropdown
    ModelConfig(
        "gpt-4.1", "GPT-4.1", "Previous generation, still capable", 128000, False, False, model_family="gpt-4.1"
    ),
    ModelConfig(
        "gpt-4.1-mini",
        "GPT-4.1 Mini",
        "Faster responses for simple tasks",
        128000,
        False,
        False,
        model_family="gpt-4.1",
    ),
    # Legacy models (backend-only for token limits)
    ModelConfig("gpt-4o", "GPT-4o", "GPT-4 Optimized", 128000, False, False, is_ui_model=False),
    ModelConfig("gpt-4o-mini", "GPT-4o Mini", "GPT-4 Optimized Mini", 128000, False, False, is_ui_model=False),
    ModelConfig("gpt-4", "GPT-4", "GPT-4 Base", 128000, False, False, is_ui_model=False),
    ModelConfig("gpt-4-turbo", "GPT-4 Turbo", "GPT-4 Turbo", 128000, False, False, is_ui_model=False),
    ModelConfig("gpt-3.5-turbo", "GPT-3.5 Turbo", "GPT-3.5 Turbo", 15360, False, False, is_ui_model=False),
    ModelConfig("gpt-35-turbo", "GPT-3.5 Turbo", "GPT-3.5 Turbo (Azure)", 15360, False, False, is_ui_model=False),
    # O1 series (reasoning, backend-only)
    ModelConfig("o1", "O1", "O1 Reasoning", 128000, True, False, is_ui_model=False),
    ModelConfig("o1-mini", "O1 Mini", "O1 Mini Reasoning", 128000, True, False, is_ui_model=False),
    ModelConfig("o1-preview", "O1 Preview", "O1 Preview Reasoning", 128000, True, False, is_ui_model=False),
    # O3 series (reasoning, backend-only)
    ModelConfig("o3", "O3", "O3 Reasoning", 128000, True, False, is_ui_model=False),
    ModelConfig("o3-mini", "O3 Mini", "O3 Mini Reasoning", 128000, True, False, is_ui_model=False),
)

# ============================================================================
# File Operations Configuration
# ============================================================================

#: Maximum file size in bytes for read_file operations (100MB).
#: Protects against accidentally reading huge files that could exhaust memory.
#: Model cannot override this value to prevent low-limit failures.
MAX_FILE_SIZE = 100 * 1024 * 1024


#: Default maximum results for file search operations.
#: Prevents resource exhaustion on large directory scans while providing
#: enough results for typical search scenarios. Can be overridden per-call.
DEFAULT_SEARCH_MAX_RESULTS = 100

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
#: for processing by the agent. Requires markitdown[pdf,docx,pptx,xlsx,xls] extras.
#: Image file extensions that support native vision API processing.
#: These formats can be passed directly to vision-enabled models (GPT-4o, GPT-4-turbo, GPT-5)
#: for image understanding without intermediate text conversion.
IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",  # JPEG images
    ".png",  # PNG images
    ".gif",  # GIF images (first frame)
    ".webp",  # WebP images
}

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
    # Image formats - converted to text descriptions via markitdown
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tiff",
    ".tif",
    ".webp",  # Images
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

#: Top-level streaming event type for raw LLM response deltas (token-by-token streaming).
#: Contains ResponseTextDeltaEvent with individual token deltas.
RAW_RESPONSE_EVENT = "raw_response_event"

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
# IPC Message Type Constants
# ============================================================================

#: Message type for assistant response start signal.
#: Signals to frontend that assistant is beginning to respond.
MSG_TYPE_ASSISTANT_START = "assistant_start"

#: Message type for assistant response end signal.
#: Signals to frontend that assistant has completed the response.
MSG_TYPE_ASSISTANT_END = "assistant_end"

#: Message type for token usage updates.
#: Sends current/limit/threshold token counts to frontend.
MSG_TYPE_TOKEN_USAGE = "token_usage"

#: Message type for incremental assistant content delta.
#: Contains streaming text chunks as assistant generates response.
MSG_TYPE_ASSISTANT_DELTA = "assistant_delta"

#: Message type for function/tool call detection notification.
#: Sent when agent decides to call a function before execution.
MSG_TYPE_FUNCTION_DETECTED = "function_detected"

#: Message type for function/tool execution start notification.
#: Sent when arguments are complete and tool is about to execute.
MSG_TYPE_FUNCTION_EXECUTING = "function_executing"

#: Message type for function/tool execution completion notification.
#: Sent after function completes with success/failure status and result.
MSG_TYPE_FUNCTION_COMPLETED = "function_completed"

#: Message type for error notifications to frontend.
#: Contains error message, optional code, and details for user display.
MSG_TYPE_ERROR = "error"

#: Message type for session management responses.
#: Contains success/error data for session commands (new, switch, delete).
MSG_TYPE_SESSION_RESPONSE = "session_response"

#: Message type for spontaneous session updates (title generation, etc.).
#: Not filtered by main process, goes directly to renderer for real-time UI updates.
MSG_TYPE_SESSION_UPDATED = "session_updated"

#: Message type for file upload responses.
#: Contains success/error data for file upload operations to sources directory.
MSG_TYPE_UPLOAD_RESPONSE = "upload_response"

#: Message type for agent configuration update notifications.
#: Sent when agent state or configuration changes during execution.
MSG_TYPE_AGENT_UPDATED = "agent_updated"

#: Message type for multi-agent handoff initiation.
#: Signals that control is being transferred to another agent.
MSG_TYPE_HANDOFF_STARTED = "handoff_started"

#: Message type for multi-agent handoff completion.
#: Contains results from delegated agent execution.
MSG_TYPE_HANDOFF_COMPLETED = "handoff_completed"

#: Message type for function call arguments streaming delta.
#: Contains incremental JSON chunks as function arguments are generated.
MSG_TYPE_FUNCTION_ARGUMENTS_DELTA = "function_call_arguments_delta"

#: Message type for function call arguments completion signal.
#: Signals that function arguments JSON is complete and ready for execution.
MSG_TYPE_FUNCTION_ARGUMENTS_DONE = "function_call_arguments_done"

#: Message type for reasoning text streaming delta (backend only, no frontend display yet).
#: Contains incremental reasoning text chunks from reasoning models (GPT-5, O1, O3).
MSG_TYPE_REASONING_DELTA = "reasoning_delta"

#: Message type for reasoning summary streaming delta (backend only).
#: Contains summary of reasoning process as it's generated.
MSG_TYPE_REASONING_SUMMARY_DELTA = "reasoning_summary_delta"

#: Message type for model refusal streaming delta.
#: Contains incremental text when model refuses to answer a request.
MSG_TYPE_REFUSAL_DELTA = "refusal_delta"

#: Message type for content part boundary events.
#: Signals when new content parts are added or completed (text chunks, refusals, etc.).
MSG_TYPE_CONTENT_PART_ADDED = "content_part_added"

# ============================================================================
# MCP Server Configuration
# ============================================================================
# Note: Tool call delay patches removed - no longer needed with client-side sessions

# ============================================================================
# Error Messages
# ============================================================================

#: Error message when session manager is not initialized.
ERROR_SESSION_MANAGER_NOT_INITIALIZED = "Session manager not initialized"

#: Error message when no active session exists.
ERROR_NO_ACTIVE_SESSION = "No active session"

#: Error message when agent is not available for summarization.
ERROR_AGENT_NOT_AVAILABLE = "Agent not available for summarization"

#: Error message template when session is not found (use .format(session_id=...)).
ERROR_SESSION_NOT_FOUND = "Session {session_id} not found"

#: Error message when not enough messages exist for summarization.
ERROR_INSUFFICIENT_MESSAGES = "Not enough messages to summarize (need at least 3)"

#: Error message when summarization returns empty result.
ERROR_EMPTY_SUMMARY = "Summarization failed: empty summary returned"

#: Error message when all items are recent and nothing to summarize.
ERROR_NOTHING_TO_SUMMARIZE = "All items are recent - nothing to summarize"


# ============================================================================
# Security Error Messages
# ============================================================================

#: Error message for null byte injection attacks in file paths.
ERROR_NULL_BYTE_IN_PATH = "Access denied: Null bytes in path"

#: Error message for path traversal attacks (.. or absolute paths).
ERROR_PATH_TRAVERSAL = "Access denied: Path traversal not allowed"

#: Error message when path is outside session workspace boundaries.
ERROR_PATH_OUTSIDE_WORKSPACE = "Access denied: Path outside session workspace"

#: Error message for symlink escape attempts after resolution.
ERROR_SYMLINK_ESCAPE = "Access denied: Symlink escape attempt detected"

#: Error message when path is outside project scope (no session isolation).
ERROR_PATH_OUTSIDE_PROJECT = "Access denied: Path outside project scope"

# ============================================================================
# Session Naming Configuration
# ============================================================================

#: Trigger automatic session naming after this many user messages.
#: Even a single user message provides enough context for the LLM to generate
#: a meaningful title, and users expect sessions to be named immediately.
SESSION_NAMING_TRIGGER_MESSAGES = 1

#: Maximum tokens allowed for session title generation.
#: Keeps titles concise (3-10 words typically = 5-15 tokens).
SESSION_TITLE_MAX_TOKENS = 20

# ============================================================================
# Session Summarization Configuration
# ============================================================================

#: Prefix for auto-generated summarization call IDs.
#: Used to create unique identifiers for summarization operations in the format "sum_<8-char-hex>".
SUMMARY_CALL_ID_PREFIX = "sum_"

#: Trigger conversation summarization at this fraction of model's token limit.
#: Example: 0.8 × GPT-5's 272k tokens = 217,600 token trigger point.
#: When total_tokens exceeds this threshold, PostgresTokenAwareSession automatically
#: summarizes the conversation and resets the context.
CONVERSATION_SUMMARIZATION_THRESHOLD = 0.8

#: Number of recent user messages to keep when summarizing conversations.
#: Keeps the last N complete user-assistant exchanges unsummarized.
#: Value of 2 = last 2 user messages + their assistant responses preserved.
#: Tool calls between exchanges are included in the summary, not kept.
#: Used as default parameter in PostgresTokenAwareSession.summarize_with_agent()
KEEP_LAST_N_MESSAGES = 2

#: Token count threshold for document summarization during read_file().
#: Documents exceeding this token count are automatically summarized to
#: fit within context windows while preserving technical accuracy.
#: Set to 10000 to allow ~3k tokens for summary + metadata.
#: Rationale: Based on typical document sizes and the need to preserve
#: technical detail while keeping room for multiple sources
DOCUMENT_SUMMARIZATION_THRESHOLD = 10000

#: Per-message token overhead for message structure (role, metadata, formatting).
#: Added to each message token count during conversation token calculation.
#: Rationale: OpenAI API adds ~4 tokens for role field, ~3 for formatting,
#: ~3 for message delimiters. 10 tokens provides safety margin for variations.
MESSAGE_STRUCTURE_TOKEN_OVERHEAD = 10

#: Minimum number of messages required before summarization can be triggered.
#: Prevents summarization of very short conversations (need at least 3 items).
#: Rationale: Need at least user→assistant→user pattern to have meaningful
#: conversation context worth summarizing. Below this, the summary would be
#: longer than the conversation itself.
MIN_MESSAGES_FOR_SUMMARIZATION = 3

#: Maximum completion tokens allowed for conversation summary generation.
#: Controls summary length to balance detail with token efficiency.
#: Rationale: 3000 tokens allows comprehensive summaries (~2000 words) while
#: staying well below typical context windows. Prevents runaway token usage
#: during auto-summarization while preserving conversation context.
SUMMARY_MAX_COMPLETION_TOKENS = 3000

# ============================================================================
# Agent/Runner Configuration
# ============================================================================

#: Default model name for fallback scenarios and initial agent setup.
#: Used when agent model is not specified or during bootstrap.
#: Sessions will override this with their own per-session model selection.
DEFAULT_MODEL = "gpt-5.2"

#: Models that support reasoning_effort parameter (derived from MODEL_CONFIGS).
#: Only these models can use the reasoning.effort configuration.
#: Setting reasoning_effort on non-reasoning models may cause errors or be ignored.
REASONING_MODELS: set[str] = {m.id for m in MODEL_CONFIGS if m.supports_reasoning}

#: Maximum number of conversation turns (user+assistant exchanges) per run.
#: Prevents infinite loops and controls maximum conversation length per execution.
MAX_CONVERSATION_TURNS = 100

# ============================================================================
# Token Counting Configuration
# ============================================================================

#: LRU cache size for token counting operations.
#: Caches the last N unique (text, model) pairs to avoid repeated tokenization.
#: 128 entries provides good hit rate for typical conversation patterns.
#: Rationale: Power of 2 for efficient hashing, balances memory (~50KB) with
#: cache hit rate. Typical conversations reuse ~20-40 unique text chunks
#: (messages, function args, results), so 128 provides 3-6x headroom.
TOKEN_CACHE_SIZE = 128

# ============================================================================
# Session Loading Pagination Configuration
# ============================================================================

#: Number of messages to load initially when switching sessions.
#: Provides fast initial load while allowing progressive loading of remaining messages.
#: Value of 50 balances between quick display and minimizing number of pagination requests.
INITIAL_SESSION_CHUNK_SIZE = 50

#: Maximum number of messages to load per pagination request.
#: Prevents excessively large payloads that could exceed IPC buffer limits (1-2 MB).
#: Value of 100 provides good throughput while staying well under buffer constraints.
MAX_MESSAGES_PER_CHUNK = 100

# ============================================================================
# Reasoning Effort Configuration
# ============================================================================

#: Human-readable labels for reasoning effort levels.
#: Used by frontend to display user-friendly options in model selection UI.
REASONING_EFFORT_OPTIONS: dict[str, str] = {
    "none": "None",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
}

#: Default reasoning effort level for new sessions.
DEFAULT_REASONING_EFFORT = "medium"


#: Reasoning level configuration for frontend UI.
#: Each entry contains value, label, and whether it's the default.
#: Import ReasoningLevelConfig at runtime to avoid circular imports.
def get_reasoning_levels() -> list[ReasoningLevelConfig]:
    """Get reasoning levels as ReasoningLevelConfig instances."""
    from models.schemas.config import ReasoningLevelConfig

    return [
        ReasoningLevelConfig(value=k, label=v, isDefault=k == DEFAULT_REASONING_EFFORT)
        for k, v in REASONING_EFFORT_OPTIONS.items()
    ]


# Note: 'minimal' is also valid but deprecated in favor of 'none'
# The backend maps between them based on model version

# ============================================================================
# Model Configuration (Frontend Display)
# ============================================================================

#: Model metadata with display names, descriptions, and feature flags (derived from MODEL_CONFIGS).
#: Used by frontend for model selection UI and configuration.
MODEL_METADATA: dict[str, dict[str, str | bool | None]] = {
    m.id: {
        "displayName": m.display_name,
        "description": m.description,
        "isPrimary": m.is_primary,
        "modelFamily": m.model_family,
    }
    for m in MODEL_CONFIGS
    if m.is_ui_model
}

#: Ordered list of supported models for frontend display (derived from MODEL_CONFIGS).
#: Controls the order of models in the model selection UI.
SUPPORTED_MODELS: list[str] = [m.id for m in MODEL_CONFIGS if m.is_ui_model]

#: Models that support reasoning effort configuration (derived from MODEL_CONFIGS).
#: GPT-5 family has reasoning, GPT-4.1 family does not.
#: Used to conditionally show reasoning effort selector in UI.
MODELS_WITH_REASONING: list[str] = [m.id for m in MODEL_CONFIGS if m.supports_reasoning and m.is_ui_model]

# ============================================================================
# Model Token Limits (Input Context Windows)
# ============================================================================
#
#: **Note**: IPC uses binary V2 protocol (MessagePack + length-prefixed framing).
#: See :class:`utils.ipc.IPCManager` for IPC communication methods.

#: Model-specific input token limits for conversation tracking (derived from MODEL_CONFIGS).
#: These are INPUT limits (not output) since we track conversation context,
#: not generation tokens. Used by PostgresTokenAwareSession for auto-summarization.
#:
#: Notes:
#: - Values are approximate and may change with model updates
#: - Conservative limits preferred to avoid context overflow
#: - Azure model names (gpt-35-turbo) included for compatibility
MODEL_TOKEN_LIMITS: dict[str, int] = {m.id: m.token_limit for m in MODEL_CONFIGS}

# ============================================================================
# Environment Configuration with Pydantic Validation
# ============================================================================

#: Valid environment names for configuration loading
Environment = Literal["development", "production", "test"]

#: Backend source directory for .env file resolution
_BACKEND_DIR = Path(__file__).parent.parent


def _get_env_files() -> list[Path]:
    """Determine which .env files to load based on APP_ENV.

    Load order (later files override earlier - pydantic-settings last-wins):
    1. .env (base defaults) - lowest priority
    2. .env.{environment} (environment-specific overrides)
    3. .env.local (local developer overrides, gitignored) - highest priority

    Returns:
        List of Path objects for env files that exist.
    """
    env_name = os.getenv("APP_ENV", "development").lower()
    if env_name not in ("development", "production", "test"):
        env_name = "development"

    # Order: lowest priority first, highest priority last (last-wins)
    candidates = [
        _BACKEND_DIR / ".env",
        _BACKEND_DIR / f".env.{env_name}",
        _BACKEND_DIR / ".env.local",
    ]
    return [p for p in candidates if p.exists()]


def _reload_dotenv_into_environ() -> None:
    """Reload our dotenv files into os.environ to fix third-party pollution.

    Some libraries (magika via markitdown) call load_dotenv() at import time,
    loading just the base .env file into os.environ. This pollutes os.environ
    with base values that should be overridden by environment-specific configs.

    This function reloads our full dotenv chain into os.environ to ensure
    environment-specific values (.env.development, .env.production) take precedence.

    Must be called BEFORE Settings() instantiation.
    """
    from dotenv import load_dotenv

    for env_file in _get_env_files():
        load_dotenv(env_file, override=True)


class Settings(BaseSettings):
    """Environment settings with validation and environment-specific file support.

    Configuration priority (highest to lowest):
    1. Values passed to Settings() constructor
    2. Environment variables (standard Docker/K8s behavior)
    3. .env.local > .env.{APP_ENV} > .env (dotenv files, last wins)

    **Note on third-party library compatibility**: Some libraries (e.g., magika
    via markitdown) call load_dotenv() at import time, polluting os.environ with
    base .env values. We counteract this by explicitly reloading our environment-
    specific dotenv files into os.environ before Settings is instantiated, ensuring
    .env.{APP_ENV} values override any pollution from base .env.

    Set APP_ENV environment variable to control which environment config to load:
    - development (default): Local development settings
    - production: Production settings with stricter validation
    - test: Test environment settings

    Validates at startup to fail fast on configuration errors.
    Supports both Azure OpenAI and base OpenAI API providers.
    """

    # Environment identification
    app_env: Environment = Field(default="development", description="Application environment")

    # API provider selection
    api_provider: str = Field(default="azure", description="API provider: 'azure' or 'openai'")

    # Azure OpenAI settings (required if provider=azure)
    azure_openai_api_key: str | None = Field(default=None, description="Azure OpenAI API key for authentication")
    azure_openai_endpoint: HttpUrl | None = Field(default=None, description="Azure OpenAI endpoint URL")

    # Base OpenAI settings (required if provider=openai)
    openai_api_key: str | None = Field(default=None, description="OpenAI API key for authentication")

    # Debug and logging
    debug: bool = Field(default=False, description="Enable debug logging")
    http_request_logging: bool = Field(default=False, description="Enable HTTP request/response logging")

    # Tavily MCP server API key (optional - enables web search via Tavily)
    tavily_api_key: str | None = Field(default=None, description="Tavily API key for web search MCP server")

    # Database (Phase 1: local PostgreSQL)
    database_url: str = Field(
        default="postgresql://chatjuicer:localdev@localhost:5433/chatjuicer",
        description="PostgreSQL connection string",
    )

    # File storage
    file_storage: str = Field(default="local", description="File storage backend: 'local' or 's3'")
    file_storage_path: str = Field(default="data/files", description="Base path for local file storage")
    max_file_size: int = Field(default=10 * 1024 * 1024, description="Maximum upload file size in bytes (default 10MB)")

    # API server
    api_port: int = Field(default=8000, description="FastAPI port")
    api_host: str = Field(default="0.0.0.0", description="FastAPI host")
    app_version: str = Field(default="1.0.0", description="Application version")

    # Connection pool configuration
    db_pool_min_size: int = Field(default=2, description="Minimum PostgreSQL connections")
    db_pool_max_size: int = Field(default=10, description="Maximum PostgreSQL connections")
    db_command_timeout: float = Field(default=60.0, description="Default query timeout (seconds)")
    db_connection_timeout: float = Field(default=10.0, description="Connection acquire timeout (seconds)")
    db_statement_cache_size: int = Field(default=100, description="Prepared statement cache size per connection")
    db_max_inactive_connection_lifetime: float = Field(
        default=300.0, description="Close connections idle longer than this (seconds)"
    )
    mcp_pool_size: int = Field(default=3, description="MCP server instances per server type")
    mcp_acquire_timeout: float = Field(default=30.0, description="MCP server acquire timeout (seconds)")

    # WebSocket connection management
    ws_idle_timeout: float = Field(
        default=600.0,
        description="Close WebSocket connections idle longer than this (seconds, default 10 min)",
    )
    ws_max_connections: int = Field(
        default=100,
        description="Maximum total WebSocket connections allowed",
    )
    ws_max_connections_per_session: int = Field(
        default=3,
        description="Maximum WebSocket connections per session (prevents resource exhaustion)",
    )
    ws_heartbeat_interval: float = Field(
        default=30.0,
        description="WebSocket heartbeat/ping interval (seconds)",
    )

    # HTTP client timeouts (for Azure OpenAI streaming)
    # Reasoning models (GPT-5, O1, O3) can pause 30+ seconds while "thinking"
    http_read_timeout: float = Field(default=600.0, description="HTTP read timeout for streaming (seconds)")

    # Graceful shutdown configuration
    shutdown_timeout: float = Field(
        default=30.0,
        description="Maximum time to wait for graceful shutdown (seconds)",
    )
    shutdown_connection_drain_timeout: float = Field(
        default=10.0,
        description="Time to wait for WebSocket connections to drain during shutdown (seconds)",
    )

    # Auth (Phase 1 convenience)
    default_user_email: str = Field(default="local@chatjuicer.dev", description="Seeded default user email")
    allow_localhost_noauth: bool = Field(
        default=True,
        description="Allow auth bypass on localhost during local development",
    )
    jwt_secret: str = Field(default="change-me-in-prod", description="JWT signing secret")
    jwt_algorithm: str = Field(default="HS256", description="JWT signing algorithm")
    access_token_expires_minutes: int = Field(default=15, description="Access token lifetime (minutes)")
    refresh_token_expires_days: int = Field(default=7, description="Refresh token lifetime (days)")

    # Hot-reload support (development only)
    config_hot_reload: bool = Field(
        default=False,
        description="Enable configuration hot-reloading (development only, has performance cost)",
    )

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Customize settings source priority for environment-specific config.

        Priority (highest to lowest) - standard Docker/K8s behavior:
        1. init_settings - Values passed to Settings() constructor
        2. env_settings - Environment variables
        3. dotenv files - .env.local > .env.{APP_ENV} > .env (last-wins in list)

        Note: The env_settings source is already constructed before this method
        is called, capturing os.environ at that moment. To handle third-party
        library pollution (magika via markitdown calling load_dotenv at import),
        call _reload_dotenv_into_environ() BEFORE instantiating Settings().
        """
        # Determine env files dynamically at instantiation time
        env_files = _get_env_files()  # Returns [.env, .env.{env}, .env.local]

        # Use single DotEnvSettingsSource with all files - last-wins semantics
        dotenv_source = DotEnvSettingsSource(
            settings_cls,
            env_file=env_files,  # [.env, .env.development] - last wins
            env_file_encoding="utf-8",
        )

        # Standard priority: env vars override dotenv files
        # This enables proper Docker/Kubernetes deployments where config
        # is injected via environment variables
        return (init_settings, env_settings, dotenv_source)

    @field_validator("app_env", mode="before")
    @classmethod
    def validate_app_env(cls, v: str | None) -> str:
        """Validate and normalize APP_ENV value."""
        if v is None:
            return "development"
        normalized = str(v).lower()
        if normalized not in ("development", "production", "test"):
            raise ValueError(f"app_env must be 'development', 'production', or 'test', got '{v}'")
        return normalized

    @field_validator("api_provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        """Validate API provider selection."""
        if v not in ["azure", "openai"]:
            raise ValueError("api_provider must be 'azure' or 'openai'")
        return v.lower()

    @field_validator("azure_openai_endpoint")
    @classmethod
    def ensure_endpoint_format(cls, v: HttpUrl | None) -> HttpUrl | None:
        """Ensure endpoint URL ends with trailing slash for OpenAI client."""
        if v is None:
            return None
        url_str = str(v)
        if not url_str.endswith("/"):
            return HttpUrl(url_str + "/")
        return v

    @field_validator("azure_openai_api_key")
    @classmethod
    def validate_azure_api_key(cls, v: str | None) -> str | None:
        """Basic validation of Azure API key format."""
        if v is not None and (not v or len(v) < 10):
            raise ValueError("Invalid Azure API key format")
        return v

    @field_validator("openai_api_key")
    @classmethod
    def validate_openai_api_key(cls, v: str | None) -> str | None:
        """Basic validation of OpenAI API key format."""
        if v is not None and (not v or len(v) < 10):
            raise ValueError("Invalid OpenAI API key format")
        return v

    @field_validator("file_storage")
    @classmethod
    def validate_file_storage(cls, v: str) -> str:
        """Validate file storage backend selection."""
        allowed = {"local", "s3"}
        value = v.lower()
        if value not in allowed:
            raise ValueError(f"file_storage must be one of {sorted(allowed)}")
        return value

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        """Validate JWT secret meets minimum security requirements."""
        if not v or len(v) < 8:
            raise ValueError("jwt_secret must be at least 8 characters")
        return v

    @model_validator(mode="after")
    def validate_provider_credentials(self) -> Settings:
        """Validate that required credentials are present for the selected provider."""
        if self.api_provider == "azure":
            if not self.azure_openai_api_key:
                raise ValueError(
                    "Configuration Error: azure_openai_api_key is required when api_provider='azure'.\n"
                    "Set AZURE_OPENAI_API_KEY in your .env file or environment."
                )
            if not self.azure_openai_endpoint:
                raise ValueError(
                    "Configuration Error: azure_openai_endpoint is required when api_provider='azure'.\n"
                    "Set AZURE_OPENAI_ENDPOINT in your .env file or environment."
                )
        elif self.api_provider == "openai":
            if not self.openai_api_key:
                raise ValueError(
                    "Configuration Error: openai_api_key is required when api_provider='openai'.\n"
                    "Set OPENAI_API_KEY in your .env file or environment."
                )

        # Production environment validation
        if self.app_env == "production":
            if self.jwt_secret == "change-me-in-prod":
                raise ValueError(
                    "Configuration Error: jwt_secret must be changed from default in production.\n"
                    "Set JWT_SECRET to a secure random string in your .env.production file."
                )
            if self.allow_localhost_noauth:
                raise ValueError(
                    "Configuration Error: allow_localhost_noauth must be False in production.\n"
                    "Set ALLOW_LOCALHOST_NOAUTH=false in your .env.production file."
                )
        return self

    @property
    def azure_endpoint_str(self) -> str:
        """Get endpoint as string for OpenAI client."""
        if self.azure_openai_endpoint is None:
            return ""
        return str(self.azure_openai_endpoint)

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.app_env == "production"

    @property
    def is_test(self) -> bool:
        """Check if running in test mode."""
        return self.app_env == "test"


# ============================================================================
# Settings Management (Thread-safe with Hot-Reload Support)
# ============================================================================


class _SettingsManager:
    """Thread-safe settings manager with optional hot-reload support.

    Uses a class to avoid global statement warnings from linters.
    """

    __slots__ = ("_instance", "_lock")

    def __init__(self) -> None:
        self._instance: Settings | None = None
        self._lock = threading.Lock()

    def get(self) -> Settings:
        """Get settings instance with optional hot-reload support.

        In production: Settings are loaded once and cached (thread-safe singleton).
        In development with hot-reload enabled: Settings are reloaded on each call.

        Returns:
            Validated Settings instance.

        Raises:
            ValueError: If required configuration is missing or invalid.
        """
        # Fast path: return cached instance if available and hot-reload disabled
        if self._instance is not None and not self._instance.config_hot_reload:
            return self._instance

        with self._lock:
            # Double-check after acquiring lock
            if self._instance is not None and not self._instance.config_hot_reload:
                return self._instance

            # CRITICAL: Reload dotenv files BEFORE creating Settings.
            # This fixes third-party library pollution (magika via markitdown
            # calls load_dotenv() at import time, loading just base .env).
            # Our reload ensures .env.{APP_ENV} values override the pollution.
            _reload_dotenv_into_environ()

            # Load fresh settings
            self._instance = Settings()
            return self._instance

    def reload(self) -> Settings:
        """Force reload settings from environment files.

        Useful for development hot-reload or testing scenarios.
        Thread-safe: Uses lock to prevent concurrent reload issues.

        Returns:
            Fresh Settings instance loaded from current environment.
        """
        with self._lock:
            # Reload dotenv files to fix any third-party pollution
            _reload_dotenv_into_environ()
            self._instance = Settings()
            return self._instance

    def clear(self) -> None:
        """Clear cached settings instance.

        Primarily useful for testing to ensure fresh settings on each test.
        """
        with self._lock:
            self._instance = None


# Module-level singleton manager
_settings_manager = _SettingsManager()


def get_settings() -> Settings:
    """Get settings instance with optional hot-reload support.

    This is the primary entry point for accessing application settings.
    Settings are validated at startup and cached for performance.

    In development with CONFIG_HOT_RELOAD=true, settings are reloaded
    on each call to pick up .env file changes without restart.

    Returns:
        Validated Settings instance.

    Raises:
        ValueError: If required configuration is missing or invalid.
    """
    return _settings_manager.get()


def reload_settings() -> Settings:
    """Force reload settings from environment files.

    Useful for development hot-reload or testing scenarios.

    Returns:
        Fresh Settings instance loaded from current environment.
    """
    return _settings_manager.reload()


def clear_settings_cache() -> None:
    """Clear cached settings instance.

    Primarily useful for testing to ensure fresh settings on each test.
    """
    _settings_manager.clear()
