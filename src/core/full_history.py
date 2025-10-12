"""Full conversation history storage for UI display.

Maintains complete conversation history separate from token-optimized LLM context.
This ensures users never lose conversation history when summarization occurs.
"""

from __future__ import annotations

import contextlib
import json
import sqlite3

from pathlib import Path
from typing import Any

from core.constants import CHAT_HISTORY_DB_PATH, FULL_HISTORY_TABLE_PREFIX
from utils.logger import logger
from utils.validation import sanitize_session_id


class FullHistoryStore:
    """Manages complete conversation history for UI display.

    Separate from TokenAwareSQLiteSession to avoid token optimization
    affecting user-visible history. Uses append-only storage with no trimming.
    """

    #: Table prefix for full history storage (SQL-safe constant)
    TABLE_PREFIX = FULL_HISTORY_TABLE_PREFIX

    def __init__(self, db_path: str | Path = CHAT_HISTORY_DB_PATH):
        """Initialize full history store.

        Args:
            db_path: Path to SQLite database file (default from constants)
        """
        self.db_path = Path(db_path)
        self._ensure_db_directory()
        logger.info(f"FullHistoryStore initialized with db_path: {self.db_path}")

    def _ensure_db_directory(self) -> None:
        """Ensure database directory exists."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_table_name(self, session_id: str) -> str:
        """Get table name for a session's full history with validation.

        Args:
            session_id: Session identifier (will be validated for SQL safety)

        Returns:
            SQL-safe table name for this session's full history

        Raises:
            ValueError: If session_id contains invalid characters
        """
        safe_id = sanitize_session_id(session_id)
        return f"{self.TABLE_PREFIX}{safe_id}"

    def _ensure_table_exists(self, session_id: str) -> None:
        """Ensure full history table exists for the session.

        Args:
            session_id: Session identifier (validated internally)
        """
        table_name = self._get_table_name(session_id)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {table_name} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()

    def save_message(self, session_id: str, message: dict[str, Any]) -> bool:
        """Append message to full history (never trimmed).

        Args:
            session_id: Session identifier
            message: Message dict with 'role' and 'content' keys

        Returns:
            True if message saved successfully, False otherwise
        """
        try:
            self._ensure_table_exists(session_id)
            table_name = self._get_table_name(session_id)

            role = message.get("role", "")
            content = message.get("content", "")

            # Skip invalid messages (SDK internal items filtered at add_items level)
            if not role or not content:
                # This should rarely happen now that we filter at add_items()
                # Log at debug level since it's expected for SDK internal structures
                item_type = message.get("type", "unknown")
                logger.debug(
                    f"Skipping non-chat message for session {session_id}: "
                    f"role={role}, has_content={bool(content)}, type={item_type}"
                )
                return False

            # Handle complex content structures (arrays, dicts)
            if not isinstance(content, str):
                content = json.dumps(content, default=str)

            # Store other fields as metadata JSON
            metadata = {k: v for k, v in message.items() if k not in ["role", "content"]}
            metadata_json = json.dumps(metadata, default=str) if metadata else None

            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    f"""
                    INSERT INTO {table_name} (role, content, metadata)
                    VALUES (?, ?, ?)
                    """,
                    (role, content, metadata_json),
                )
                conn.commit()

            logger.debug(f"Saved message to full_history for session {session_id}: role={role}")
            return True

        except Exception as e:
            logger.error(f"Failed to save message to full_history for session {session_id}: {e}", exc_info=True)
            # Don't raise - Layer 2 is best-effort for UX
            return False

    def get_messages(self, session_id: str, limit: int | None = None, offset: int = 0) -> list[dict[str, Any]]:
        """Retrieve all messages for a session (with optional pagination).

        Args:
            session_id: Session identifier
            limit: Maximum number of messages to return (None for all)
            offset: Number of messages to skip (for pagination)

        Returns:
            List of message dicts with 'role' and 'content' keys
        """
        try:
            table_name = self._get_table_name(session_id)

            # Check if table exists
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute(
                    """
                    SELECT name FROM sqlite_master
                    WHERE type='table' AND name=?
                    """,
                    (table_name,),
                )
                if not cursor.fetchone():
                    logger.info(f"No full_history table for session {session_id}")
                    return []

                # Build query with optional pagination
                query = f"SELECT role, content, metadata FROM {table_name} ORDER BY id ASC"
                params: tuple[Any, ...] = ()

                if limit is not None:
                    query += " LIMIT ? OFFSET ?"
                    params = (limit, offset)

                cursor = conn.execute(query, params)
                rows = cursor.fetchall()

                messages = []
                for row in rows:
                    role, content, metadata_json = row

                    # Parse content if it's JSON
                    with contextlib.suppress(json.JSONDecodeError, TypeError):
                        content = json.loads(content)

                    # Build message dict
                    message: dict[str, Any] = {"role": role, "content": content}

                    # Add metadata fields if present
                    if metadata_json:
                        try:
                            metadata = json.loads(metadata_json)
                            message.update(metadata)
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse metadata JSON for session {session_id}")

                    messages.append(message)

                logger.info(f"Retrieved {len(messages)} messages from full_history for session {session_id}")
                return messages

        except Exception as e:
            logger.error(f"Failed to get messages from full_history for session {session_id}: {e}", exc_info=True)
            return []

    def get_message_count(self, session_id: str) -> int:
        """Get total message count for a session.

        Args:
            session_id: Session identifier

        Returns:
            Number of messages in full history
        """
        try:
            table_name = self._get_table_name(session_id)

            with sqlite3.connect(self.db_path) as conn:
                # Check if table exists
                cursor = conn.execute(
                    """
                    SELECT name FROM sqlite_master
                    WHERE type='table' AND name=?
                    """,
                    (table_name,),
                )
                if not cursor.fetchone():
                    return 0

                cursor = conn.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cursor.fetchone()[0]
                return int(count)

        except Exception as e:
            logger.error(f"Failed to get message count from full_history for session {session_id}: {e}", exc_info=True)
            return 0

    def clear_session(self, session_id: str) -> bool:
        """Delete all messages for a session (for session deletion only).

        Args:
            session_id: Session identifier

        Returns:
            True if successful, False otherwise
        """
        try:
            table_name = self._get_table_name(session_id)

            with sqlite3.connect(self.db_path) as conn:
                # Check if table exists before trying to drop
                cursor = conn.execute(
                    """
                    SELECT name FROM sqlite_master
                    WHERE type='table' AND name=?
                    """,
                    (table_name,),
                )
                if not cursor.fetchone():
                    logger.info(f"No full_history table to clear for session {session_id}")
                    return True

                conn.execute(f"DROP TABLE IF EXISTS {table_name}")
                conn.commit()

            logger.info(f"Cleared full_history for session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to clear full_history for session {session_id}: {e}", exc_info=True)
            return False
