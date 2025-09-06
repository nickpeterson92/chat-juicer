"""
Constants and configuration for Chat Juicer.
Centralizes all magic numbers and configuration values.
"""

# Rate limiting
RATE_LIMIT_RETRY_MAX = 5
RATE_LIMIT_BASE_DELAY = 1  # seconds
RATE_LIMIT_MAX_WAIT = 10  # seconds

# File size limits
DEFAULT_MAX_FILE_SIZE = 1048576  # 1MB
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
    ".xlsx",
    ".xls",  # Excel
    ".docx",
    ".doc",  # Word
    ".pptx",
    ".ppt",  # PowerPoint
    ".pdf",  # PDF
    ".csv",  # CSV
    ".html",
    ".htm",  # HTML
    ".xml",  # XML
    ".json",  # JSON
    ".ipynb",  # Jupyter notebooks
}

TEMPLATE_EXTENSIONS = [".md", ".txt", ".template", ""]

# System limits
SESSION_ID_LENGTH = 8
