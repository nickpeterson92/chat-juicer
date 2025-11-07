"""Application state management for Chat Juicer.

This module provides the central AppState container that serves as the single
source of truth for application-wide state. State is passed explicitly to
functions rather than using module-level globals.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from agents import Agent

from core.full_history import FullHistoryStore
from core.session import TokenAwareSQLiteSession
from core.session_manager import SessionManager


@dataclass
class AppState:
    """Application state container - single source of truth for app-wide state.

    Replaces module-level globals with explicit state management. All runtime
    operations receive AppState as a parameter to avoid hidden global state.

    Attributes:
        session_manager: Manages session metadata and lifecycle
        current_session: Active token-aware SQLite session (None = lazy init)
        agent: Initial agent with all MCP servers for global context
        deployment: Model deployment name (e.g., "gpt-4o", "gpt-5-mini")
        full_history_store: Layered history persistence (Layer 2)
        mcp_servers: Global pool of initialized MCP servers by name
    """

    session_manager: SessionManager | None = None
    current_session: TokenAwareSQLiteSession | None = None
    agent: Agent | None = None
    deployment: str = ""
    full_history_store: FullHistoryStore | None = None
    mcp_servers: dict[str, Any] = field(default_factory=dict)
