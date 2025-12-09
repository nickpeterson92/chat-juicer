"""Application state management for Chat Juicer.

This module provides the central AppState container that serves as the single
source of truth for application-wide state. State is passed explicitly to
functions rather than using module-level globals.

Phase 2: Concurrent Session Processing
---------------------------------------
Modified to support multiple concurrent sessions with isolated streaming state.
See /Users/nick.peterson/.claude/plans/melodic-brewing-sparrow.md for full plan.
"""

from __future__ import annotations

import asyncio

from dataclasses import dataclass, field
from typing import Any

from agents import Agent

from core.full_history import FullHistoryStore
from core.session import TokenAwareSQLiteSession
from core.session_manager import SessionManager


@dataclass
class SessionContext:
    """State for a single active session.

    Attributes:
        session: Token-aware SQLite session for this session
        agent: Agent instance for this session (with session-aware tools)
        stream_task: Currently running stream task for this session (None if not streaming)
        interrupt_requested: Interrupt flag for this session's stream
    """

    session: TokenAwareSQLiteSession
    agent: Agent
    stream_task: asyncio.Task[None] | None = None
    interrupt_requested: bool = False


@dataclass
class AppState:
    """Application state container - single source of truth for app-wide state.

    Replaces module-level globals with explicit state management. All runtime
    operations receive AppState as a parameter to avoid hidden global state.

    Phase 2 Changes:
        - Removed: current_session, agent, active_stream_task (now per-session)
        - Added: active_sessions dict[str, SessionContext] for multi-session support
        - Added: _current_session_id for backward compatibility
        - Added: Properties (current_session, agent, active_stream_task, interrupt_requested)
          that map to active_sessions for single-session code compatibility

    Attributes:
        session_manager: Manages session metadata and lifecycle
        active_sessions: Registry of active sessions by session_id
        deployment: Model deployment name (e.g., "gpt-4o", "gpt-5-mini")
        full_history_store: Layered history persistence (Layer 2)
        mcp_servers: Global pool of initialized MCP servers by name
        pending_read_task: Pending stdin read task to prevent orphaned readers

    Backward Compatibility (Phase 2 - Phase 3 Transition):
        The following properties maintain backward compatibility with single-session code:
        - current_session: Maps to active_sessions[_current_session_id].session
        - agent: Maps to active_sessions[_current_session_id].agent
        - active_stream_task: Maps to active_sessions[_current_session_id].stream_task
        - interrupt_requested: Maps to active_sessions[_current_session_id].interrupt_requested

        These properties will be removed in Phase 4 after all code is migrated to multi-session.
    """

    session_manager: SessionManager | None = None
    active_sessions: dict[str, SessionContext] = field(default_factory=dict)
    deployment: str = ""
    full_history_store: FullHistoryStore | None = None
    mcp_servers: dict[str, Any] = field(default_factory=dict)
    pending_read_task: asyncio.Task[dict[str, Any]] | None = None

    # Private field for backward compatibility - tracks "current" session ID for single-session code
    _current_session_id: str | None = None

    # ========== Backward Compatibility Properties (Phase 2 only) ==========
    # These properties bridge old single-session code to new multi-session architecture
    # Will be removed in Phase 4 after all code is migrated

    @property
    def current_session(self) -> TokenAwareSQLiteSession | None:
        """Get current session for backward compatibility with single-session code."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            return self.active_sessions[self._current_session_id].session
        return None

    @current_session.setter
    def current_session(self, session: TokenAwareSQLiteSession | None) -> None:
        """Set current session - creates or updates SessionContext in active_sessions.

        Note: When setting a new session, the agent must be set separately via
        the `agent` property setter. Typically both are set in sequence by
        switch_to_session or create_new_session.
        """
        if session is None:
            # Clear current session
            if self._current_session_id and self._current_session_id in self.active_sessions:
                del self.active_sessions[self._current_session_id]
            self._current_session_id = None
            return

        # Get session_id from the session object
        session_id = session.session_id

        # Create or update SessionContext
        if session_id in self.active_sessions:
            # Update existing context
            self.active_sessions[session_id].session = session
        else:
            # Create new context - agent will be set separately
            # We can't create a proper Agent here, but we need a valid Agent instance
            # The caller must set app_state.agent after setting app_state.current_session
            # This is always done in switch_to_session where both are set
            self.active_sessions[session_id] = SessionContext(
                session=session,
                agent=session.agent,  # Use the agent from the session (set by Builder)
                stream_task=None,
                interrupt_requested=False,
            )

        self._current_session_id = session_id

    @property
    def agent(self) -> Agent | None:
        """Get agent for current session."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            return self.active_sessions[self._current_session_id].agent
        return None

    @agent.setter
    def agent(self, agent: Agent | None) -> None:
        """Set agent for current session."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            if agent is not None:
                self.active_sessions[self._current_session_id].agent = agent
        elif agent is not None:
            # Can't set agent without a current session - this shouldn't happen in normal flow
            # but we log it for debugging
            from utils.logger import logger

            logger.warning("Attempted to set agent without a current session")

    @property
    def active_stream_task(self) -> asyncio.Task[None] | None:
        """Get stream task for current session."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            return self.active_sessions[self._current_session_id].stream_task
        return None

    @active_stream_task.setter
    def active_stream_task(self, task: asyncio.Task[None] | None) -> None:
        """Set stream task for current session."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            self.active_sessions[self._current_session_id].stream_task = task

    @property
    def interrupt_requested(self) -> bool:
        """Get interrupt flag for current session."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            return self.active_sessions[self._current_session_id].interrupt_requested
        return False

    @interrupt_requested.setter
    def interrupt_requested(self, value: bool) -> None:
        """Set interrupt flag for current session."""
        if self._current_session_id and self._current_session_id in self.active_sessions:
            self.active_sessions[self._current_session_id].interrupt_requested = value
