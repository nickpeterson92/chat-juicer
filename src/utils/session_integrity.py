"""Session integrity validation and repair utilities.

Provides tools to detect and fix orphaned sessions where Layer 1 and Layer 2 are out of sync.
"""

from __future__ import annotations

import sqlite3

from pathlib import Path
from typing import Any

from core.constants import CHAT_HISTORY_DB_PATH, FULL_HISTORY_TABLE_PREFIX, SESSION_TABLE_PREFIX
from utils.logger import logger
from utils.validation import sanitize_session_id


def get_all_session_ids_from_layer1(db_path: str | Path = CHAT_HISTORY_DB_PATH) -> set[str]:
    """Get all session IDs that have Layer 1 tables.

    Args:
        db_path: Path to SQLite database

    Returns:
        Set of session IDs with Layer 1 tables
    """
    session_ids = set()
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name LIKE ?
                """,
                (f"{SESSION_TABLE_PREFIX}%",),
            )
            for (table_name,) in cursor.fetchall():
                # Extract session_id from table name (remove prefix)
                session_id = table_name[len(SESSION_TABLE_PREFIX) :]
                session_ids.add(session_id)

    except Exception as e:
        logger.error(f"Failed to get Layer 1 session IDs: {e}", exc_info=True)

    return session_ids


def get_all_session_ids_from_layer2(db_path: str | Path = CHAT_HISTORY_DB_PATH) -> set[str]:
    """Get all session IDs that have Layer 2 tables.

    Args:
        db_path: Path to SQLite database

    Returns:
        Set of session IDs with Layer 2 tables
    """
    session_ids = set()
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name LIKE ?
                """,
                (f"{FULL_HISTORY_TABLE_PREFIX}%",),
            )
            for (table_name,) in cursor.fetchall():
                # Extract session_id from table name (remove prefix)
                session_id = table_name[len(FULL_HISTORY_TABLE_PREFIX) :]
                session_ids.add(session_id)

    except Exception as e:
        logger.error(f"Failed to get Layer 2 session IDs: {e}", exc_info=True)

    return session_ids


def detect_orphaned_sessions(db_path: str | Path = CHAT_HISTORY_DB_PATH) -> dict[str, Any]:
    """Detect sessions where Layer 1 and Layer 2 are out of sync.

    Args:
        db_path: Path to SQLite database

    Returns:
        Dictionary with orphaned session information:
        {
            "layer1_only": [...],  # Sessions with Layer 1 but no Layer 2
            "layer2_only": [...],  # Sessions with Layer 2 but no Layer 1
            "both": [...],         # Sessions with both layers (healthy)
        }
    """
    layer1_sessions = get_all_session_ids_from_layer1(db_path)
    layer2_sessions = get_all_session_ids_from_layer2(db_path)

    result = {
        "layer1_only": sorted(layer1_sessions - layer2_sessions),
        "layer2_only": sorted(layer2_sessions - layer1_sessions),
        "both": sorted(layer1_sessions & layer2_sessions),
    }

    # Log orphaned sessions
    if result["layer1_only"]:
        logger.warning(f"Found {len(result['layer1_only'])} orphaned sessions (Layer 1 only): {result['layer1_only']}")
    if result["layer2_only"]:
        logger.warning(f"Found {len(result['layer2_only'])} orphaned sessions (Layer 2 only): {result['layer2_only']}")

    logger.info(
        f"Session integrity check: {len(result['both'])} healthy, {len(result['layer1_only']) + len(result['layer2_only'])} orphaned"
    )

    return result


def get_session_message_counts(session_id: str, db_path: str | Path = CHAT_HISTORY_DB_PATH) -> dict[str, int]:
    """Get message counts for both layers of a session.

    Args:
        session_id: Session identifier
        db_path: Path to SQLite database

    Returns:
        Dictionary with counts: {"layer1": int, "layer2": int}
    """
    safe_id = sanitize_session_id(session_id)
    layer1_table = f"{SESSION_TABLE_PREFIX}{safe_id}"
    layer2_table = f"{FULL_HISTORY_TABLE_PREFIX}{safe_id}"

    counts = {"layer1": 0, "layer2": 0}

    try:
        with sqlite3.connect(db_path) as conn:
            # Check Layer 1
            cursor = conn.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name=?
                """,
                (layer1_table,),
            )
            if cursor.fetchone():
                cursor = conn.execute(f"SELECT COUNT(*) FROM {layer1_table}")
                counts["layer1"] = cursor.fetchone()[0]

            # Check Layer 2
            cursor = conn.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name=?
                """,
                (layer2_table,),
            )
            if cursor.fetchone():
                cursor = conn.execute(f"SELECT COUNT(*) FROM {layer2_table}")
                counts["layer2"] = cursor.fetchone()[0]

    except Exception as e:
        logger.error(f"Failed to get message counts for session {session_id}: {e}", exc_info=True)

    return counts


def repair_orphaned_session_from_layer1(
    session_id: str,
    full_history_store: Any,  # FullHistoryStore instance
    db_path: str | Path = CHAT_HISTORY_DB_PATH,
) -> bool:
    """Repair an orphaned session by recreating Layer 2 from Layer 1.

    Args:
        session_id: Session identifier
        full_history_store: FullHistoryStore instance for Layer 2 writes
        db_path: Path to SQLite database

    Returns:
        True if repair succeeded, False otherwise
    """
    try:
        safe_id = sanitize_session_id(session_id)
        layer1_table = f"{SESSION_TABLE_PREFIX}{safe_id}"

        # Read all messages from Layer 1
        with sqlite3.connect(db_path) as conn:
            cursor = conn.execute(
                f"""
                SELECT message_data FROM {layer1_table}
                ORDER BY rowid ASC
                """
            )

            import json

            messages_saved = 0
            messages_skipped = 0

            # Parse all messages first to avoid try-except in loop
            rows = cursor.fetchall()

            for (message_data,) in rows:
                # Parse JSON message
                try:
                    item = json.loads(message_data)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON in Layer 1 for session {session_id}, skipping message")
                    messages_skipped += 1
                    continue

                # Only save messages with role (skip SDK internals)
                if item.get("role") in ["user", "assistant", "system", "tool"]:
                    success = full_history_store.save_message(session_id, item)
                    if success:
                        messages_saved += 1
                    else:
                        messages_skipped += 1
                else:
                    messages_skipped += 1

        logger.info(
            f"Repaired orphaned session {session_id}: "
            f"{messages_saved} messages saved to Layer 2, {messages_skipped} skipped"
        )
        return True

    except Exception as e:
        logger.error(f"Failed to repair orphaned session {session_id}: {e}", exc_info=True)
        return False


def validate_and_repair_all_sessions(
    full_history_store: Any, db_path: str | Path = CHAT_HISTORY_DB_PATH, auto_repair: bool = False
) -> dict[str, Any]:
    """Validate all sessions and optionally repair orphaned ones.

    Args:
        full_history_store: FullHistoryStore instance for repairs
        db_path: Path to SQLite database
        auto_repair: If True, automatically repair orphaned sessions

    Returns:
        Dictionary with validation and repair results
    """
    logger.info("Starting session integrity validation...")

    orphaned = detect_orphaned_sessions(db_path)

    results: dict[str, Any] = {
        "healthy_count": len(orphaned["both"]),
        "orphaned_count": len(orphaned["layer1_only"]) + len(orphaned["layer2_only"]),
        "repaired_count": 0,
        "repair_failed_count": 0,
        "orphaned_sessions": orphaned,
    }

    # Auto-repair Layer 1 orphans if requested
    if auto_repair and orphaned["layer1_only"]:
        logger.info(f"Auto-repairing {len(orphaned['layer1_only'])} orphaned sessions...")

        for session_id in orphaned["layer1_only"]:
            success = repair_orphaned_session_from_layer1(session_id, full_history_store, db_path)
            if success:
                results["repaired_count"] += 1
            else:
                results["repair_failed_count"] += 1

        logger.info(f"Repair complete: {results['repaired_count']} succeeded, {results['repair_failed_count']} failed")

    return results
