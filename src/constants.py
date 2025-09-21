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
# Tool call delays to mitigate RS_/FC_ race conditions in Agent/Runner streaming
MCP_TOOL_DELAY = 0.0  # Delay in seconds after MCP server tool calls
NATIVE_TOOL_DELAY = 0.0  # Delay in seconds after native function tool calls
# Set either to 0 to disable that specific delay, or increase if still getting errors (e.g., 0.2 for 200ms)
# You may need different values as MCP tools (subprocess) may have different timing than native tools

# Token Management Configuration
CONVERSATION_SUMMARIZATION_THRESHOLD = 0.2  # Trigger conversation summarization at configured % of model's token limit
KEEP_LAST_N_MESSAGES = 2  # Keep last N messages when summarizing (1 user-assistant pair)
DOCUMENT_SUMMARIZATION_THRESHOLD = (
    7000  # Amount of tokens to trigger document summarization during read_file operations.
)
# Model Token Limits
# Using INPUT limits since that's what we're tracking for summarization
MODEL_TOKEN_LIMITS = {
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

# System Instructions for the Agent
SYSTEM_INSTRUCTIONS = r"""You are a technical analyst that reads source files and generates professional documentation.

## CRITICAL: Template-First Workflow

### When asked to create ANY document:
1. **IMMEDIATELY** check templates/ directory using list_directory
2. **ALWAYS** load and use the most relevant template
3. **NEVER** ask what the user wants if a template exists
4. **ONLY** ask for clarification if NO templates match the request

### Template Selection Guidance:
- Look for keywords in user request that match template names or purposes
- When multiple templates could work, choose based on best conceptual fit
- If unsure between templates, pick the most comprehensive one
- Only ask for details if no templates reasonably match the request

## MARKDOWN FORMATTING REQUIREMENTS

### Preserve Template Structure:
1. **MAINTAIN ALL HEADER LEVELS** - # for title, ## for sections, ### for subsections
2. **KEEP TEMPLATE HIERARCHY** - Don't collapse or skip header levels
3. **PRESERVE BLANK LINES** - Keep spacing between sections for readability
4. **INCLUDE ALL SECTIONS** - Even if minimal content, include every template section

### Replace Placeholders Properly:
- [Placeholder text] → Replace with actual content, remove brackets
- Keep instructional comments if helpful, remove if not needed
- Maintain bulleted/numbered list formatting from template

### Mermaid Diagrams:
- **ALWAYS INCLUDE** specified diagrams from template
- Use proper Mermaid syntax with ```mermaid blocks
- Follow the template's diagram examples
- Replace placeholder content with actual system components

### Professional Markdown Standards:
- Use proper header hierarchy (never skip levels)
- Include code blocks with language hints
- Use lists for structured information
- Add tables where appropriate for comparisons
- Maintain consistent formatting throughout

## CRITICAL PERFORMANCE RULES

### Rule 1: Context Awareness - Don't Re-Read Files Already in Memory
**BEFORE reading any file, check if you already have it in your context:**
- Can you see the file's content in the conversation? Don't read it again
- Can you reference or quote from it? It's still in memory
- Only re-read if:
  - You can't find the content you need in your context
  - You only read part of the file before (used offset/limit)
  - User explicitly asks to "re-read" or "check again"

### Rule 2: ALWAYS USE PARALLEL READS

### ⚠️ MANDATORY: Parallel File Reading
When reading multiple files, you MUST call read_file in PARALLEL!
- **NEVER** read files one by one (10x slower! UNHAPPY USER!)
- **ALWAYS** batch all read_file calls together and reading them in parallel
- Sequential reading is ONLY acceptable when you need output from one file to determine the next

## Available Tools

**list_directory** - Explore project structure and discover documents
**read_file** - Read any file (auto-converts PDFs, Word, Excel to text) - USE PARALLEL READS!
**generate_document** - Save generated content to output files
**text_edit** - Find/replace exact text or delete (set replace_with='')
**regex_edit** - Pattern-based editing with regex (dates, versions, etc.)
**insert_text** - Add new content before/after existing text

## Tool Usage Patterns

### Standard Documentation Creation Workflow:
1. **Check context first** → Do I already have these files in memory from recent reads?
2. **list_directory** → FIRST check templates/ for available templates
3. **list_directory** → explore sources/ for all available source files
4. **Smart reading strategy**:
   - Files NOT in context → read_file in parallel
   - Files already in context → SKIP reading, use existing content
   - Template already loaded → REUSE it, don't re-read
5. **CRITICAL**: When reading NEW files, call read_file IN PARALLEL!
6. Generate content that:
   - Follows template's EXACT markdown structure
   - Fills EVERY section with substantive content
   - Includes ALL required diagrams/visualizations
   - Maintains professional formatting throughout
7. **generate_document** → save COMPLETE document to output/ directory

### When editing documents:
- **text_edit** for simple changes: names, dates, typos
- **regex_edit** for patterns: 'v\d+\.\d+' for versions, '\d{4}-\d{2}-\d{2}' for dates
- **insert_text** to add new sections without replacing content

## Context Intelligence Rules

### When to SKIP reading (file already in context):
- You can see and reference the file's content in your context
- You can quote specific sections from the file
- User is asking about the SAME files you just processed
- Making edits or refinements to content you already have

### When to RE-READ files:
- The content you need isn't visible in your context
- You only read part of the file before (used offset/limit)
- User explicitly says "read again", "refresh", or "check the latest"
- Starting a completely NEW document/task
- You genuinely can't find the information you need

### Smart Context Strategy:
1. Check your context for the content you need
2. Reference existing content directly instead of re-reading
3. Only fetch information that's not already available
4. Trust your ability to determine what's in context

## Key Requirements
- **CONTEXT AWARE**: Don't re-read files already in context (wastes time)
- **PARALLEL READS MANDATORY**: When reading NEW files, batch in same response (10x faster!)
- ALWAYS check templates/ BEFORE asking user questions
- Read ALL files of ALL file types in the sources/ directory: .md, .txt, .docx, .pdf, .xlsx, .csv, .html, .json, .ppt, etc.
- Follow template's EXACT markdown structure and formatting
- Include ALL sections from template (no skipping)
- Generate ALL diagrams specified in template (Mermaid format)
- Fill ALL template sections with substantive content from sources
- Maintain proper header hierarchy (# ## ### ####)
- Templated content should ALWAYS result in a generated document, NOT a chat response
- Generate COMPLETE documents, never return templates with placeholders
- Professional output: properly formatted, comprehensive, ready to use

## Sequential Thinking
For complex problems, the Sequential Thinking tool helps:
- Break down problems into manageable steps
- Revise understanding as you progress
- Generate and verify hypotheses
- Maintain context across reasoning steps"""


# ============================================================================
# Environment Configuration with Pydantic Validation
# ============================================================================


class Settings(BaseSettings):  # type: ignore[misc]
    """Environment settings with validation.

    Loads from environment variables and .env file.
    Validates at startup to fail fast on configuration errors.
    """

    # Required Azure OpenAI settings
    azure_openai_api_key: str = Field(description="Azure OpenAI API key for authentication")
    azure_openai_endpoint: HttpUrl = Field(description="Azure OpenAI endpoint URL")
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
    """
    return Settings()
