"""Session management for persistent conversations.

Manages session metadata and lifecycle for multi-conversation support.
"""

from __future__ import annotations

import json
import uuid

from datetime import datetime
from pathlib import Path

from core.constants import SESSION_ID_LENGTH
from models.session_models import SessionMetadata
from utils.logger import logger


class SessionManager:
    """Manages session metadata and lifecycle."""

    def __init__(self, metadata_path: str | Path = "data/sessions.json"):
        """Initialize session manager.

        Args:
            metadata_path: Path to sessions metadata file
        """
        self.metadata_path = Path(metadata_path)
        self.sessions: dict[str, SessionMetadata] = {}
        self.current_session_id: str | None = None
        self._load_metadata()

    def _load_metadata(self) -> None:
        """Load session metadata from disk."""
        if not self.metadata_path.exists():
            logger.info(f"No existing session metadata at {self.metadata_path}")
            self.sessions = {}
            self.current_session_id = None
            return

        try:
            with open(self.metadata_path) as f:
                data = json.load(f)

            self.current_session_id = data.get("current_session_id")
            sessions_data = data.get("sessions", {})

            self.sessions = {
                session_id: SessionMetadata.model_validate(session_data)
                for session_id, session_data in sessions_data.items()
            }

            logger.info(f"Loaded {len(self.sessions)} sessions from {self.metadata_path}")

        except Exception as e:
            logger.error(f"Failed to load session metadata: {e}", exc_info=True)
            self.sessions = {}
            self.current_session_id = None

    def _save_metadata(self) -> None:
        """Save session metadata to disk."""
        try:
            # Ensure logs directory exists
            self.metadata_path.parent.mkdir(parents=True, exist_ok=True)

            data = {
                "current_session_id": self.current_session_id,
                "sessions": {session_id: session.model_dump() for session_id, session in self.sessions.items()},
            }

            with open(self.metadata_path, "w") as f:
                json.dump(data, f, indent=2)

            logger.info(f"Saved {len(self.sessions)} sessions to {self.metadata_path}")

        except Exception as e:
            logger.error(f"Failed to save session metadata: {e}", exc_info=True)

    def create_session(self, title: str | None = None) -> SessionMetadata:
        """Create a new session.

        Args:
            title: Initial title for the session (defaults to datetime format)

        Returns:
            Newly created session metadata
        """
        # Generate datetime title if none provided
        if title is None:
            title = f"Conversation {datetime.now().strftime('%Y-%m-%d %I:%M %p')}"

        session_id = f"chat_{uuid.uuid4().hex[:SESSION_ID_LENGTH]}"
        session = SessionMetadata(session_id=session_id, title=title)

        self.sessions[session_id] = session
        self.current_session_id = session_id
        self._save_metadata()

        logger.info(f"Created new session: {session_id}")
        return session

    def get_session(self, session_id: str) -> SessionMetadata | None:
        """Get session by ID.

        Args:
            session_id: Session identifier

        Returns:
            Session metadata or None if not found
        """
        return self.sessions.get(session_id)

    def list_sessions(self) -> list[SessionMetadata]:
        """Get all sessions sorted by last_used (most recent first).

        Returns:
            List of session metadata
        """
        return sorted(self.sessions.values(), key=lambda s: s.last_used, reverse=True)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session.

        Args:
            session_id: Session to delete

        Returns:
            True if deleted, False if not found
        """
        if session_id not in self.sessions:
            logger.warning(f"Attempted to delete non-existent session: {session_id}")
            return False

        del self.sessions[session_id]

        # If deleting current session, clear it
        if self.current_session_id == session_id:
            self.current_session_id = None

        self._save_metadata()
        logger.info(f"Deleted session: {session_id}")
        return True

    def update_session(
        self,
        session_id: str,
        title: str | None = None,
        last_used: str | None = None,
        message_count: int | None = None,
    ) -> bool:
        """Update session metadata.

        Args:
            session_id: Session to update
            title: New title (optional)
            last_used: New last_used timestamp (optional)
            message_count: New message count (optional)

        Returns:
            True if updated, False if not found
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.warning(f"Attempted to update non-existent session: {session_id}")
            return False

        if title is not None:
            session.title = title
        if last_used is not None:
            session.last_used = last_used
        if message_count is not None:
            session.message_count = message_count

        self._save_metadata()
        return True

    def set_current_session(self, session_id: str) -> bool:
        """Set the current active session.

        Args:
            session_id: Session to make current

        Returns:
            True if set, False if not found
        """
        if session_id not in self.sessions:
            logger.warning(f"Attempted to set non-existent session as current: {session_id}")
            return False

        self.current_session_id = session_id
        self._save_metadata()
        return True

    def get_current_session(self) -> SessionMetadata | None:
        """Get the current active session.

        Returns:
            Current session metadata or None
        """
        if self.current_session_id:
            return self.sessions.get(self.current_session_id)
        return None
