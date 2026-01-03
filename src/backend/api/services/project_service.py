from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg


class ProjectService:
    """Project business logic backed by PostgreSQL."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def create_project(
        self,
        user_id: UUID,
        name: str,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Create a new project."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO projects (user_id, name, description)
                VALUES ($1, $2, $3)
                RETURNING *
                """,
                user_id,
                name,
                description,
            )
        return self._row_to_project(row)

    async def get_project(self, user_id: UUID, project_id: UUID) -> dict[str, Any] | None:
        """Get project by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT p.*, COUNT(s.id) as session_count
                FROM projects p
                LEFT JOIN sessions s ON s.project_id = p.id
                WHERE p.id = $1 AND p.user_id = $2
                GROUP BY p.id
                """,
                project_id,
                user_id,
            )
        if not row:
            return None
        return self._row_to_project(row)

    async def list_projects(
        self,
        user_id: UUID,
        offset: int = 0,
        limit: int = 50,
    ) -> dict[str, Any]:
        """List all projects for user."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.*, COUNT(s.id) as session_count
                FROM projects p
                LEFT JOIN sessions s ON s.project_id = p.id
                WHERE p.user_id = $1
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT $2 OFFSET $3
                """,
                user_id,
                limit,
                offset,
            )

            total = await conn.fetchval(
                "SELECT COUNT(*) FROM projects WHERE user_id = $1",
                user_id,
            )

        projects = [self._row_to_project(r) for r in rows]

        return {
            "projects": projects,
            "total_count": total,
            "has_more": offset + len(projects) < total,
        }

    async def update_project(
        self,
        user_id: UUID,
        project_id: UUID,
        name: str | None = None,
        description: str | None = None,
    ) -> dict[str, Any] | None:
        """Update project fields."""
        set_clauses = ["updated_at = $3"]
        values: list[Any] = [project_id, user_id, datetime.now(timezone.utc)]
        idx = 4

        if name is not None:
            set_clauses.append(f"name = ${idx}")
            values.append(name)
            idx += 1

        if description is not None:
            set_clauses.append(f"description = ${idx}")
            values.append(description)
            idx += 1

        query = f"""
            UPDATE projects
            SET {', '.join(set_clauses)}
            WHERE id = $1 AND user_id = $2
            RETURNING *
        """

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, *values)

        if not row:
            return None

        return await self.get_project(user_id, project_id)

    async def delete_project(self, user_id: UUID, project_id: UUID) -> bool:
        """Delete project.

        Sessions and files will have project_id set to NULL (ON DELETE SET NULL).
        Context chunks will be deleted (ON DELETE CASCADE from project).
        """
        async with self.pool.acquire() as conn:
            result: str = await conn.execute(
                """
                DELETE FROM projects
                WHERE id = $1 AND user_id = $2
                """,
                project_id,
                user_id,
            )
        return result == "DELETE 1"

    def _row_to_project(self, row: asyncpg.Record) -> dict[str, Any]:
        """Convert database row to project dict."""
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "description": row["description"],
            "session_count": row.get("session_count", 0),
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
