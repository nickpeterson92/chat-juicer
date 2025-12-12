from __future__ import annotations

import json
import logging

from typing import Any
from uuid import UUID

import asyncpg

logger = logging.getLogger(__name__)

# Valid roles for OpenAI API input
VALID_ROLES = {"assistant", "system", "developer", "user", "tool"}


class PostgresSession:
    """PostgreSQL-backed session adapter for OpenAI Agents SDK."""

    def __init__(self, session_id: str, session_uuid: UUID, pool: asyncpg.Pool):
        self.session_id = session_id
        self.session_uuid = session_uuid
        self.pool = pool

    async def get_items(self, limit: int | None = None) -> list[dict[str, Any]]:
        """Retrieve LLM context items.

        Handles both simple message dicts and serialized SDK response objects.

        Args:
            limit: Maximum number of items to retrieve. If None, retrieves all items.
        """
        async with self.pool.acquire() as conn:
            if limit is not None:
                rows = await conn.fetch(
                    """
                    SELECT role, content, metadata
                    FROM llm_context
                    WHERE session_id = $1
                    ORDER BY created_at ASC
                    LIMIT $2
                    """,
                    self.session_uuid,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT role, content, metadata
                    FROM llm_context
                    WHERE session_id = $1
                    ORDER BY created_at ASC
                    """,
                    self.session_uuid,
                )

        items = []
        for row in rows:
            if row["role"] == "sdk_item":
                # Deserialize SDK item back to dict
                try:
                    item_data: dict[str, Any] = json.loads(row["content"])
                    # Validate the deserialized item has a valid role
                    item_role = item_data.get("role", "")
                    if item_role in VALID_ROLES:
                        items.append(item_data)
                    elif item_data.get("content"):
                        # Has content but invalid/empty role - treat as assistant message
                        logger.warning(f"SDK item has invalid role '{item_role}', treating as assistant")
                        items.append(
                            {
                                "role": "assistant",
                                "content": item_data.get("content"),
                            }
                        )
                    else:
                        # Skip items with no valid role and no content
                        logger.debug(f"Skipping SDK item with invalid role '{item_role}' and no content")
                except json.JSONDecodeError:
                    # Fallback to simple format
                    logger.warning("Failed to deserialize SDK item, using raw content")
                    items.append(
                        {
                            "role": "assistant",
                            "content": row["content"],
                        }
                    )
            else:
                # Simple message format - validate role
                role = row["role"]
                if role in VALID_ROLES:
                    items.append(
                        {
                            "role": role,
                            "content": row["content"],
                            **(json.loads(row["metadata"]) if row["metadata"] else {}),
                        }
                    )
                elif row["content"]:
                    # Has content but invalid role - log and skip
                    logger.warning(f"Skipping item with invalid role '{role}'")

        return items

    async def add_items(self, items: list[Any]) -> None:
        """Add items to LLM context.

        Handles both simple message dicts {"role": ..., "content": ...}
        and SDK response objects which need to be serialized as JSON.
        """
        async with self.pool.acquire() as conn, conn.transaction():
            for item in items:
                # Check if item is a simple dict with role/content
                if isinstance(item, dict) and "role" in item:
                    role = item.get("role")
                    content = item.get("content")

                    # Validate role before storing
                    if not role or role not in VALID_ROLES:
                        logger.warning(f"Skipping item with invalid role '{role}' in add_items")
                        continue

                    metadata = {k: v for k, v in item.items() if k not in ("role", "content")}
                    content_to_save = content if isinstance(content, str) else json.dumps(content)
                    metadata_to_save = json.dumps(metadata) if metadata else None
                else:
                    # SDK response object - serialize the whole thing
                    # These are internal SDK items (ResponseItem, etc.)
                    role = "sdk_item"
                    # Try to get a dict representation
                    if hasattr(item, "model_dump"):
                        item_data = item.model_dump()
                    elif hasattr(item, "__dict__"):
                        item_data = item.__dict__
                    else:
                        item_data = {"raw": str(item)}
                    content_to_save = json.dumps(item_data)
                    metadata_to_save = json.dumps({"type": type(item).__name__})

                await conn.execute(
                    """
                    INSERT INTO llm_context (session_id, role, content, metadata)
                    VALUES ($1, $2, $3, $4)
                    """,
                    self.session_uuid,
                    role,
                    content_to_save,
                    metadata_to_save,
                )

    async def pop_item(self) -> dict[str, Any] | None:
        """Remove and return the last item from LLM context.

        Required by SDK Session protocol for certain operations.
        """
        async with self.pool.acquire() as conn:
            # Get and delete the most recent item in one transaction
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    SELECT id, role, content, metadata
                    FROM llm_context
                    WHERE session_id = $1
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    self.session_uuid,
                )
                if not row:
                    return None

                await conn.execute(
                    "DELETE FROM llm_context WHERE id = $1",
                    row["id"],
                )

        # Deserialize based on role type
        if row["role"] == "sdk_item":
            try:
                item_data: dict[str, Any] = json.loads(row["content"])
                # Validate the deserialized item has a valid role
                item_role = item_data.get("role", "")
                if item_role in VALID_ROLES:
                    return item_data
                elif item_data.get("content"):
                    # Has content but invalid role - treat as assistant
                    return {"role": "assistant", "content": item_data.get("content")}
                else:
                    return {"role": "assistant", "content": row["content"]}
            except json.JSONDecodeError:
                return {"role": "assistant", "content": row["content"]}
        else:
            role = row["role"]
            if role in VALID_ROLES:
                return {
                    "role": role,
                    "content": row["content"],
                    **(json.loads(row["metadata"]) if row["metadata"] else {}),
                }
            else:
                # Invalid role - return as assistant
                return {"role": "assistant", "content": row["content"]}

    async def clear_session(self) -> None:
        """Clear all LLM context."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM llm_context WHERE session_id = $1",
                self.session_uuid,
            )
