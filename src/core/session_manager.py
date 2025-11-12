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
from models.session_models import SessionMetadata, SessionMetadataParams, SessionUpdate
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

    def create_session(
        self,
        title: str | None = None,
        mcp_config: list[str] | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
    ) -> SessionMetadata:
        """Create a new session with secure directory structure.

        Creates session workspace with:
        - sources/ subdirectory for uploaded files
        - templates/ symlink to global templates (read-only)

        Args:
            title: Initial title for the session (defaults to datetime format)
            mcp_config: List of enabled MCP server names (None = use defaults)
            model: Model deployment name (None = use default from settings)
            reasoning_effort: Reasoning effort level (None = use default from settings)

        Returns:
            Newly created session metadata
        """
        import platform
        import shutil

        # Generate datetime title if none provided
        if title is None:
            title = f"Conversation {datetime.now().strftime('%Y-%m-%d %I:%M %p')}"

        session_id = f"chat_{uuid.uuid4().hex[:SESSION_ID_LENGTH]}"

        # Create session metadata with all parameters (defaults handled by SessionMetadata)
        session_params: SessionMetadataParams = {
            "session_id": session_id,
            "title": title,
        }
        if mcp_config is not None:
            session_params["mcp_config"] = mcp_config
        if model is not None:
            session_params["model"] = model
        if reasoning_effort is not None:
            session_params["reasoning_effort"] = reasoning_effort

        session = SessionMetadata(**session_params)

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

        # Delete session files directory with handle cleanup
        import gc
        import shutil
        import time

        from pathlib import Path

        session_files_dir = Path(f"data/files/{session_id}")
        if session_files_dir.exists():
            try:
                # Force garbage collection to close unreferenced file handles
                # This is critical for preventing "Too many open files" errors
                gc.collect()

                # Small delay to allow OS to release file handles
                time.sleep(0.05)

                shutil.rmtree(session_files_dir)
                logger.info(f"Deleted session files directory: {session_files_dir}")
            except OSError as e:
                if e.errno == 24:  # EMFILE: Too many open files
                    logger.error(
                        f"File handle exhaustion deleting {session_files_dir}. "
                        f"Consider increasing ulimit -n or closing file handles before deletion.",
                        exc_info=True,
                    )
                else:
                    logger.error(f"Failed to delete session files directory {session_files_dir}: {e}", exc_info=True)
                # Continue with metadata save even if file cleanup fails
            except Exception as e:
                logger.error(f"Failed to delete session files directory {session_files_dir}: {e}", exc_info=True)
                # Continue with metadata save even if file cleanup fails

        self._save_metadata()
        logger.info(f"Deleted session: {session_id}")
        return True

    def sync_metadata_with_database(self) -> int:
        """Sync session metadata with database to fix any desync issues.

        This should be called on startup BEFORE cleanup_empty_sessions() to ensure
        metadata is accurate before any deletion logic runs.

        Returns:
            Number of sessions updated
        """
        from core.constants import CHAT_HISTORY_DB_PATH
        from core.full_history import FullHistoryStore
        from models.session_models import SessionUpdate

        full_history = FullHistoryStore(db_path=CHAT_HISTORY_DB_PATH)
        updated_count = 0

        logger.info("Syncing session metadata with database...")

        # Helper to sync single session (avoids try-except in loop for performance)
        def sync_session(sid: str, sess: SessionMetadata) -> bool:
            try:
                actual_messages = full_history.get_messages(sid)
                actual_count = len(actual_messages)

                if sess.message_count != actual_count:
                    logger.warning(
                        f"Syncing session {sid}: metadata says {sess.message_count}, " f"DB has {actual_count} messages"
                    )
                    self.update_session(sid, SessionUpdate(message_count=actual_count))
                    return True
                return False
            except Exception as e:
                logger.error(f"Failed to sync session {sid} with database: {e}")
                return False

        for session_id, session in self.sessions.items():
            if sync_session(session_id, session):
                updated_count += 1

        if updated_count > 0:
            logger.info(f"Metadata sync complete: updated {updated_count} sessions")
        else:
            logger.info("Metadata sync complete: all sessions in sync")

        return updated_count

    def cleanup_empty_sessions(self, max_age_hours: int = 24) -> int:
        """Delete sessions with no messages older than max_age_hours.

        This prevents orphaned sessions from accumulating when users upload files
        but never send a message.

        CRITICAL SAFEGUARD: Always validates against database before deletion to prevent
        the desync bug where metadata is stale but messages exist in the database.

        Args:
            max_age_hours: Maximum age in hours for empty sessions (default: 24)

        Returns:
            Number of sessions deleted
        """
        import shutil

        from datetime import datetime
        from pathlib import Path

        from core.constants import CHAT_HISTORY_DB_PATH
        from core.full_history import FullHistoryStore

        cutoff_time = datetime.now().timestamp() - (max_age_hours * 3600)
        deleted_count = 0
        skipped_count = 0

        # Initialize FullHistoryStore for database validation
        full_history = FullHistoryStore(db_path=CHAT_HISTORY_DB_PATH)

        # Helper to validate and cleanup single session (avoids try-except in loop)
        def should_cleanup_session(sid: str, sess: SessionMetadata) -> tuple[bool, bool]:
            """Returns (should_delete, should_skip)"""
            try:
                actual_messages = full_history.get_messages(sid)
                actual_count = len(actual_messages)

                # If database has messages, update metadata and SKIP deletion
                if actual_count > 0:
                    if sess.message_count != actual_count:
                        logger.warning(
                            f"Session {sid} metadata desync: "
                            f"metadata says {sess.message_count}, DB has {actual_count} messages. "
                            f"Skipping deletion and updating metadata."
                        )
                        from models.session_models import SessionUpdate

                        self.update_session(sid, SessionUpdate(message_count=actual_count))
                    return (False, True)

                # CRITICAL: If metadata says messages exist but DB is empty, SKIP deletion
                # This prevents data loss from desync - better to keep than delete
                if sess.message_count > 0:
                    logger.warning(
                        f"Session {sid} CRITICAL DESYNC: "
                        f"metadata says {sess.message_count} messages, but DB is empty. "
                        f"SKIPPING DELETION to prevent data loss."
                    )
                    return (False, True)

                # Check if session has uploaded files before deletion
                sources_dir = Path(f"data/files/{sid}/sources")
                if sources_dir.exists():
                    files = list(sources_dir.iterdir())
                    if files:
                        logger.info(f"Session {sid} has {len(files)} uploaded files, skipping cleanup")
                        return (False, True)

                # Check age - only delete if old AND no messages AND no files
                session_created = datetime.fromisoformat(sess.created_at).timestamp()
                if session_created < cutoff_time:
                    return (True, False)
                return (False, False)

            except Exception as e:
                logger.error(f"Failed to validate session {sid} against database: {e}")
                logger.warning(f"Skipping session {sid} cleanup due to validation error")
                return (False, True)

        # Helper to delete session files (avoids nested try-except)
        def delete_session_files(sid: str) -> None:
            session_files_dir = Path(f"data/files/{sid}")
            if session_files_dir.exists():
                try:
                    shutil.rmtree(session_files_dir)
                    logger.info(f"Cleaned up empty session files: {session_files_dir}")
                except Exception as e:
                    logger.error(f"Failed to cleanup session files {session_files_dir}: {e}", exc_info=True)

        # Iterate over copy of sessions dict since we're modifying it
        for session_id, session in list(self.sessions.items()):
            should_delete, should_skip = should_cleanup_session(session_id, session)

            if should_skip:
                skipped_count += 1
                continue

            if should_delete:
                delete_session_files(session_id)
                if self.delete_session(session_id):
                    deleted_count += 1
                    logger.info(f"Cleaned up empty session: {session_id}")

        if deleted_count > 0:
            logger.info(
                f"Cleanup complete: removed {deleted_count} empty sessions older than {max_age_hours}h "
                f"(skipped {skipped_count} sessions with messages)"
            )

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
        if updates.model is not None:
            session.model = updates.model
            logger.info(f"Updated model for session {session_id}: {updates.model}")
        if updates.mcp_config is not None:
            session.mcp_config = updates.mcp_config
            logger.info(f"Updated MCP config for session {session_id}: {updates.mcp_config}")
        if updates.reasoning_effort is not None:
            session.reasoning_effort = updates.reasoning_effort
            logger.info(f"Updated reasoning effort for session {session_id}: {updates.reasoning_effort}")

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
            from core.constants import DEFAULT_MODEL
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
            deployment = DEFAULT_MODEL

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
