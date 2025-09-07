"""
Constants and configuration for Chat Juicer.
Centralizes all magic numbers and configuration values.
"""

# Rate limiting
RATE_LIMIT_RETRY_MAX = 5
RATE_LIMIT_BASE_DELAY = 1  # seconds
RATE_LIMIT_MAX_WAIT = 10  # seconds

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

# Retry configuration
MAX_RETRIES = 2  # Maximum number of retries for transient errors
RETRY_BACKOFF_BASE = 0.5  # Base wait time for exponential backoff (seconds)
RETRYABLE_ERROR_PATTERNS = [
    # Note: RS_ errors are NOT retried - they're internal streaming state issues that we handle by continuing
    "rate_limit",  # Rate limiting errors
    "429",  # Rate limit HTTP status
    "timeout",  # Request timeouts
    "connection",  # Connection errors
    "503",  # Service unavailable
    "502",  # Bad gateway
    "504",  # Gateway timeout
]

# HTTP status codes that should trigger retries
RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504]
