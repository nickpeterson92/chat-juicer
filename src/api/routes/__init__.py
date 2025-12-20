"""Route modules for the Chat Juicer API.

API v1 routes are in the v1/ subdirectory.
WebSocket routes (chat) remain at the top level.
"""

from __future__ import annotations

from api.routes import chat

__all__ = ["chat"]
