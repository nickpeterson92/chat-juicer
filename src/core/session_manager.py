"""Session management for persistent conversations.

Manages session metadata and lifecycle for multi-conversation support.
"""

from __future__ import annotations

import json
import uuid

from datetime import datetime
from pathlib import Path
from typing import Any

from core.constants import DEFAULT_SESSION_METADATA_PATH, SESSION_ID_LENGTH
from models.session_models import SessionMetadata, SessionUpdate
from utils.logger import logger


class SessionManager:
    """Manages session metadata and lifecycle."""

    def __init__(self, metadata_path: str | Path = DEFAULT_SESSION_METADATA_PATH):
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

    def update_session(self, session_id: str, updates: SessionUpdate) -> bool:
        """Update session metadata using SessionUpdate dataclass.

        Args:
            session_id: Session to update
            updates: SessionUpdate instance with fields to update

        Returns:
            True if updated, False if not found or no updates provided
        """
        if not updates.has_updates():
            logger.debug(f"No updates provided for session: {session_id}")
            return False

        session = self.sessions.get(session_id)
        if not session:
            logger.warning(f"Attempted to update non-existent session: {session_id}")
            return False

        # Apply all non-None updates
        if updates.title is not None:
            session.title = updates.title
        if updates.last_used is not None:
            session.last_used = updates.last_used
        if updates.message_count is not None:
            session.message_count = updates.message_count
        if updates.accumulated_tool_tokens is not None:
            session.accumulated_tool_tokens = updates.accumulated_tool_tokens

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

    async def generate_session_title(  # noqa: PLR0911
        self, session_id: str, recent_messages: list[dict[str, Any]]
    ) -> bool:
        """Generate and update session title using LLM based on conversation context.

        Non-blocking operation that runs in background after trigger condition is met.
        Falls back to keeping existing title if generation fails.

        Args:
            session_id: Session to name
            recent_messages: Recent conversation messages for context (typically 3-6 messages)

        Returns:
            True if title generated and updated successfully, False otherwise
        """
        try:
            from core.constants import SESSION_TITLE_MAX_TOKENS, get_settings
            from core.prompts import SESSION_TITLE_GENERATION_PROMPT
            from utils.client_factory import create_openai_client

            session = self.sessions.get(session_id)
            if not session:
                logger.warning(f"Cannot generate title for non-existent session: {session_id}")
                return False

            # Skip if already named
            if session.is_named:
                logger.debug(f"Session {session_id} already named, skipping")
                return False

            # Need at least 2 messages for meaningful title
            if len(recent_messages) < 2:
                logger.debug(f"Not enough messages ({len(recent_messages)}) to generate title")
                return False

            logger.info(f"Generating title for session {session_id} from {len(recent_messages)} messages")

            # Get settings and create client
            settings = get_settings()
            api_key = settings.azure_openai_api_key
            endpoint = settings.azure_endpoint_str
            deployment = settings.azure_openai_deployment

            client = create_openai_client(api_key=api_key, base_url=endpoint)

            # Build messages for title generation
            messages = []

            for msg in recent_messages:
                role = msg.get("role", "")
                if role not in ["user", "assistant"]:
                    continue

                # Extract text content from message
                content = msg.get("content", "")

                # Handle list content (SDK format)
                if isinstance(content, list):
                    text_parts = []
                    for item in content:
                        if isinstance(item, dict) and "text" in item:
                            text_parts.append(str(item["text"]))
                        elif isinstance(item, str):
                            text_parts.append(item)
                    content = " ".join(text_parts)
                elif not isinstance(content, str):
                    content = str(content)

                if not content or not content.strip():
                    continue

                # Truncate very long messages to keep prompt concise
                if len(content) > 500:
                    content = content[:500] + "..."

                messages.append({"role": role, "content": content})

            # Add title generation request
            messages.append({"role": "user", "content": SESSION_TITLE_GENERATION_PROMPT})

            # Call LLM to generate title
            response = await client.chat.completions.create(
                model=deployment, messages=messages, max_completion_tokens=SESSION_TITLE_MAX_TOKENS, temperature=0.7
            )

            generated_title = response.choices[0].message.content
            if not generated_title:
                logger.warning("Title generation returned empty response")
                return False

            # Clean up the title (remove quotes, extra whitespace, trailing punctuation)
            generated_title = generated_title.strip().strip('"').strip("'").rstrip(".!?")

            # Validate title length (fallback if too long)
            if len(generated_title) > 200:
                generated_title = generated_title[:197] + "..."

            logger.info(f"Generated title for session {session_id}: {generated_title}")

            # Update session metadata
            from models.session_models import SessionUpdate

            update = SessionUpdate(title=generated_title)
            success = self.update_session(session_id, update)

            if success:
                # Mark as named
                session.is_named = True
                self._save_metadata()

                # Send IPC notification to update frontend
                from utils.ipc import IPCManager

                result = {
                    "success": True,
                    "message": "Session titled",
                    "session": session.model_dump(),
                    "sessions": [s.model_dump() for s in self.list_sessions()],
                }
                IPCManager.send_session_response(result)

                logger.info(f"Successfully updated session {session_id} with generated title")
                return True
            else:
                logger.error(f"Failed to update session {session_id} with generated title")
                return False

        except Exception as e:
            logger.error(f"Error generating session title for {session_id}: {e}", exc_info=True)
            return False
