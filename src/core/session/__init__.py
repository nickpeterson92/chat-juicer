"""Public API for session module with backward compatibility.

All existing imports continue to work:
    from core.session import TokenAwareSQLiteSession, SessionBuilder
"""

from .base import TokenAwareSQLiteSession
from .builders import SessionBuilder

__all__ = [
    "TokenAwareSQLiteSession",
    "SessionBuilder",
]
