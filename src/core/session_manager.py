"""Session management for persistent conversations.

Manages session metadata and lifecycle for multi-conversation support.
"""

from __future__ import annotations

import json
import uuid

from datetime import datetime
from pathlib import Path
from typing import cast

from agents import Agent, Runner, TResponseInputItem

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
        """Create a new session with secure directory structure.

        Creates session workspace with:
        - sources/ subdirectory for uploaded files
        - templates/ symlink to global templates (read-only)

        Args:
            title: Initial title for the session (defaults to datetime format)

        Returns:
            Newly created session metadata
        """
        import platform
        import shutil

        # Generate datetime title if none provided
        if title is None:
            title = f"Conversation {datetime.now().strftime('%Y-%m-%d %I:%M %p')}"

        session_id = f"chat_{uuid.uuid4().hex[:SESSION_ID_LENGTH]}"
        session = SessionMetadata(session_id=session_id, title=title)

        # Create secure session directory structure
        session_dir = Path(f"data/files/{session_id}")
        session_dir.mkdir(parents=True, exist_ok=True)

        # Create sources/ subdirectory for uploaded files
        sources_dir = session_dir / "sources"
        sources_dir.mkdir(exist_ok=True)
        logger.info(f"Created sources directory: {sources_dir}")

        # Create output/ subdirectory for generated documents
        output_dir = session_dir / "output"
        output_dir.mkdir(exist_ok=True)
        logger.info(f"Created output directory: {output_dir}")

        # Create templates/ symlink to global templates
        templates_link = session_dir / "templates"
        templates_target = Path("templates").resolve()

        try:
            if not templates_link.exists():
                # Check platform for symlink support
                if platform.system() == "Windows":
                    # Windows fallback: copy templates instead of symlink
                    # (requires admin privileges or Developer Mode for symlinks)
                    shutil.copytree(templates_target, templates_link, dirs_exist_ok=True)
                    logger.info(f"Created templates copy (Windows): {templates_link}")
                else:
                    # Unix-like systems: use symlink
                    templates_link.symlink_to(templates_target, target_is_directory=True)
                    logger.info(f"Created templates symlink: {templates_link} -> {templates_target}")
        except Exception as e:
            logger.warning(f"Failed to create templates link/copy: {e}")
            # Non-fatal: session can still function without templates

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
        """Delete a session and its associated files.

        Args:
            session_id: Session to delete

        Returns:
            True if deleted, False if not found
        """
        if session_id not in self.sessions:
            logger.warning(f"Attempted to delete non-existent session: {session_id}")
            return False

        # Delete session metadata
        del self.sessions[session_id]

        # If deleting current session, clear it
        if self.current_session_id == session_id:
            self.current_session_id = None

        # Delete session files directory
        import shutil

        from pathlib import Path

        session_files_dir = Path(f"data/files/{session_id}")
        if session_files_dir.exists():
            try:
                shutil.rmtree(session_files_dir)
                logger.info(f"Deleted session files directory: {session_files_dir}")
            except Exception as e:
                logger.error(f"Failed to delete session files directory {session_files_dir}: {e}", exc_info=True)
                # Continue with session deletion even if file cleanup fails

        self._save_metadata()
        logger.info(f"Deleted session: {session_id}")
        return True

    def cleanup_empty_sessions(self, max_age_hours: int = 24) -> int:
        """Delete sessions with no messages older than max_age_hours.

        This prevents orphaned sessions from accumulating when users upload files
        but never send a message.

        Args:
            max_age_hours: Maximum age in hours for empty sessions (default: 24)

        Returns:
            Number of sessions deleted
        """
        import shutil

        from datetime import datetime
        from pathlib import Path

        cutoff_time = datetime.now().timestamp() - (max_age_hours * 3600)
        deleted_count = 0

        # Iterate over copy of sessions dict since we're modifying it
        for session_id, session in list(self.sessions.items()):
            # Skip sessions with messages
            if session.message_count > 0:
                continue

            # Check if session is older than cutoff
            # Parse ISO format timestamp to datetime for comparison
            session_created = datetime.fromisoformat(session.created_at).timestamp()
            if session_created < cutoff_time:
                # Delete session files directory
                session_files_dir = Path(f"data/files/{session_id}")
                if session_files_dir.exists():
                    try:
                        shutil.rmtree(session_files_dir)
                        logger.info(f"Cleaned up empty session files: {session_files_dir}")
                    except Exception as e:
                        logger.error(f"Failed to cleanup session files {session_files_dir}: {e}", exc_info=True)

                # Delete session metadata (reuse delete_session method)
                if self.delete_session(session_id):
                    deleted_count += 1
                    logger.info(f"Cleaned up empty session: {session_id}")

        if deleted_count > 0:
            logger.info(f"Cleanup complete: removed {deleted_count} empty sessions older than {max_age_hours}h")

        return deleted_count

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
        self, session_id: str, recent_messages: list[TResponseInputItem]
    ) -> bool:
        """Generate and update session title using Agent/Runner pattern.

        Uses Responses API for consistency with rest of application.
        Appends a title generation request to conversation for clear meta-task context.

        Non-blocking operation that runs in background after trigger condition is met.
        Falls back to keeping existing title if generation fails.

        Args:
            session_id: Session to name
            recent_messages: All conversation items (SDK filters and handles tool calls/results)

        Returns:
            True if title generated and updated successfully, False otherwise
        """
        try:
            from core.constants import get_settings
            from core.prompts import SESSION_TITLE_GENERATION_PROMPT

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

            # Get settings and deployment
            settings = get_settings()
            deployment = settings.azure_openai_deployment

            # Create a one-off title generation agent
            title_agent = Agent(
                name="TitleGenerator",
                model=deployment,
                instructions=SESSION_TITLE_GENERATION_PROMPT,
            )

            # Append title generation request as final user message
            title_request = {
                "role": "user",
                "content": (
                    "Generate a concise 3-5 word title for the conversation above. "
                    "Use title case, be specific about the main topic, no articles unless necessary, "
                    "no punctuation at the end. Output ONLY the title with no explanation or quotes."
                ),
            }
            # Cast to TResponseInputItem for type safety (runtime-compatible dict)
            messages_with_request = [*recent_messages, cast(TResponseInputItem, title_request)]

            # Pass messages with title request to Runner
            result = await Runner.run(
                title_agent,
                input=messages_with_request,
                session=None,  # No session for title generation (one-shot operation)
            )

            generated_title = result.final_output or ""
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

                # Send IPC notification to update frontend in real-time
                # Use session_updated type (not filtered by main process)
                from utils.ipc import IPCManager

                response = {
                    "success": True,
                    "message": "Session titled",
                    "session_id": session.session_id,
                    "session": session.model_dump(),
                }

                # Send directly (session_updated is not filtered like session_response)
                logger.info(f"Sending session_updated IPC for title update: {session.title}")
                IPCManager.send_session_updated(response)
                logger.info("✓ Sent session update notification")

                logger.info(f"Successfully updated session {session_id} with generated title")
                return True
            else:
                logger.error(f"Failed to update session {session_id} with generated title")
                return False

        except Exception as e:
            logger.error(f"Error generating session title for {session_id}: {e}", exc_info=True)
            return False
