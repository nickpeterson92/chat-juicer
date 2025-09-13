"""
Constants and configuration for Chat Juicer.
Centralizes all magic numbers and configuration values.
"""

# File size limits
DEFAULT_MAX_FILE_SIZE = 1572864  # 1.5MB
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

# MCP Server Configuration
# Tool call delays to mitigate RS_/FC_ race conditions in Agent/Runner streaming
MCP_TOOL_DELAY = 0.2  # Delay in seconds after MCP server tool calls
NATIVE_TOOL_DELAY = 0.2  # Delay in seconds after native function tool calls
# Set either to 0 to disable that specific delay, or increase if still getting errors (e.g., 0.2 for 200ms)
# You may need different values as MCP tools (subprocess) may have different timing than native tools

# Token Management Configuration
TOKEN_SUMMARIZATION_THRESHOLD = 0.8  # Trigger summarization at 80% of model's token limit
KEEP_LAST_N_MESSAGES = 2  # Keep last N messages when summarizing (1 user-assistant pair)

# Model Token Limits (conservative to account for system messages)
# Using INPUT limits since that's what we're tracking for summarization
MODEL_TOKEN_LIMITS = {
    # GPT-5 models (272k input limit, being conservative)
    "gpt-5": 250000,
    "gpt-5-mini": 250000,
    "gpt-5-nano": 250000,
    # GPT-4 models (120k practical limit)
    "gpt-4o": 120000,
    "gpt-4o-mini": 120000,
    "gpt-4": 120000,
    "gpt-4-turbo": 120000,
    # GPT-3.5 models
    "gpt-3.5-turbo": 15000,
    "gpt-35-turbo": 15000,  # Azure naming
}

# System Instructions for the Agent
SYSTEM_INSTRUCTIONS = """You are a technical documentation automation assistant.

Core Capabilities:
- File system access for reading and writing documents
- Document generation with template support
- Token-aware content optimization
- Sequential Thinking for complex problem-solving and structured reasoning

The Sequential Thinking tool helps you:
- Break down complex problems into manageable steps
- Revise thoughts as understanding deepens
- Branch into alternative reasoning paths
- Generate and verify solution hypotheses
- Maintain context across multiple reasoning steps

When asked to create documentation:
1. First use list_directory to explore available files
2. Then use read_file to examine source files from the sources/ directory
3. After all sources are read, use read_file to load the most relevant template from the templates/ directory
4. Generate comprehensive document content based on the template and source files
5. Use generate_document to save the completed document(s) to the output/ directory
6. If multiple documents are to be generated ensure ALL generated documents follow the template and are complete

Key points:
- Read ALL files of ALL extensions in the sources/ directory:
- .md, .txt, .docx, .doc, .pptx, .ppt, .xlsx, .xls, .pdf, .csv, .html, .htm, .xml, .json, .ipynb, etc.
- If reading multiple files from the sources/ directory, then you MUST use read_file in parallel!
- Templates are markdown files in templates/ directory - use read_file to access them
- Load the most relevant template for the documentation type requested ONLY!
- If you load irrelevant templates the user will be VERY UPSET!
- The generate_document function takes the complete document content and saves it
- Ensure that all sections of the template are filled with content relevant to the source files
- Ensure the content of the document is accurate and complete
- Ensure all requested Mermaid diagrams are generated accurately and with the correct syntax
- Ensure generated documents are produced with proper markdown formatting
- Always provide the full document content to generate_document, not a template with placeholders"""
