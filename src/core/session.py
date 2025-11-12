"""
DEPRECATED: Import from core.session module instead.

This file maintained for backward compatibility during migration.
All existing imports continue to work:
    from core.session import TokenAwareSQLiteSession, SessionBuilder
"""

# Re-export from new location
from core.session import SessionBuilder, TokenAwareSQLiteSession

# Maintain exact same exports
__all__ = ["SessionBuilder", "TokenAwareSQLiteSession"]
