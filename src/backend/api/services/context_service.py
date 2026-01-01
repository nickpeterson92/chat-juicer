"""
Context service for managing context_chunks table.

Provides CRUD operations for embeddings and vector similarity search.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg


def _embedding_to_pgvector(embedding: list[float]) -> str:
    """Convert embedding list to pgvector string format."""
    return "[" + ",".join(str(x) for x in embedding) + "]"


@dataclass
class ChunkResult:
    """Result from vector similarity search."""

    chunk_id: UUID
    source_type: str
    source_id: UUID
    chunk_index: int
    content: str
    score: float
    metadata: dict[str, Any] | None
    created_at: datetime


class ContextService:
    """Context chunks CRUD and vector similarity search.

    Handles:
    - Session summary upsert (one per session, updated in-place)
    - Message/file chunk insertion with deduplication
    - Vector similarity search with score threshold
    - Chunk deletion when sources are removed
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        """Initialize with database connection pool."""
        self.pool = pool

    async def upsert_session_summary(
        self,
        project_id: UUID,
        session_id: UUID,
        content: str,
        content_hash: str,
        embedding: list[float],
        token_count: int,
        metadata: dict[str, Any] | None = None,
    ) -> UUID | None:
        """Upsert session summary chunk.

        Uses ON CONFLICT to update existing summary for the session.

        Args:
            project_id: Project to associate with
            session_id: Source session ID
            content: Summary text
            content_hash: SHA-256 hash for deduplication
            embedding: 1536-dimensional vector
            token_count: Token count of content
            metadata: Optional metadata (session title, etc.)

        Returns:
            Chunk ID if inserted/updated, None if conflict skipped
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO context_chunks (
                    project_id, source_type, source_id, chunk_index,
                    content, content_hash, embedding, token_count, metadata
                )
                VALUES ($1, 'session_summary', $2, 0, $3, $4, $5, $6, $7)
                ON CONFLICT (project_id, source_type, source_id)
                WHERE source_type = 'session_summary'
                DO UPDATE SET
                    content = EXCLUDED.content,
                    content_hash = EXCLUDED.content_hash,
                    embedding = EXCLUDED.embedding,
                    token_count = EXCLUDED.token_count,
                    metadata = EXCLUDED.metadata,
                    created_at = now()
                RETURNING id
                """,
                project_id,
                session_id,
                content,
                content_hash,
                _embedding_to_pgvector(embedding),
                token_count,
                metadata,
            )
            return row["id"] if row else None

    async def insert_chunk(
        self,
        project_id: UUID,
        source_type: str,
        source_id: UUID,
        chunk_index: int,
        content: str,
        content_hash: str,
        embedding: list[float],
        token_count: int,
        metadata: dict[str, Any] | None = None,
    ) -> UUID | None:
        """Insert a context chunk with deduplication.

        Uses ON CONFLICT DO NOTHING for content hash deduplication.

        Args:
            project_id: Project to associate with
            source_type: 'message' | 'file'
            source_id: Source ID (message_id or file_id)
            chunk_index: Index for multi-chunk sources
            content: Chunk text
            content_hash: SHA-256 hash for deduplication
            embedding: 1536-dimensional vector
            token_count: Token count of content
            metadata: Optional metadata

        Returns:
            Chunk ID if inserted, None if duplicate skipped
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO context_chunks (
                    project_id, source_type, source_id, chunk_index,
                    content, content_hash, embedding, token_count, metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (project_id, source_type, content_hash) DO NOTHING
                RETURNING id
                """,
                project_id,
                source_type,
                source_id,
                chunk_index,
                content,
                content_hash,
                _embedding_to_pgvector(embedding),
                token_count,
                metadata,
            )
            return row["id"] if row else None

    async def search_chunks(
        self,
        project_id: UUID,
        query_embedding: list[float],
        top_k: int = 5,
        score_threshold: float = 0.5,
    ) -> list[ChunkResult]:
        """Search for similar chunks using cosine similarity.

        Args:
            project_id: Project to search within
            query_embedding: Query vector (1536 dimensions)
            top_k: Maximum results to return
            score_threshold: Minimum similarity score (0-1)

        Returns:
            List of matching chunks ordered by similarity
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    id,
                    source_type,
                    source_id,
                    chunk_index,
                    content,
                    1 - (embedding <=> $2) as score,
                    metadata,
                    created_at
                FROM context_chunks
                WHERE project_id = $1
                  AND 1 - (embedding <=> $2) >= $3
                ORDER BY embedding <=> $2
                LIMIT $4
                """,
                project_id,
                _embedding_to_pgvector(query_embedding),
                score_threshold,
                top_k,
            )

        return [
            ChunkResult(
                chunk_id=row["id"],
                source_type=row["source_type"],
                source_id=row["source_id"],
                chunk_index=row["chunk_index"],
                content=row["content"],
                score=float(row["score"]),
                metadata=row["metadata"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    async def delete_chunks_for_source(self, source_type: str, source_id: UUID) -> int:
        """Delete all chunks for a source (e.g., when session/file deleted).

        Args:
            source_type: 'session_summary' | 'message' | 'file'
            source_id: Source ID

        Returns:
            Number of chunks deleted
        """
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM context_chunks
                WHERE source_type = $1 AND source_id = $2
                """,
                source_type,
                source_id,
            )
            # Result format: "DELETE N"
            return int(result.split()[-1])

    async def get_chunk_count_for_project(self, project_id: UUID) -> int:
        """Get total chunk count for a project.

        Args:
            project_id: Project ID

        Returns:
            Number of chunks in project
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) as count FROM context_chunks WHERE project_id = $1",
                project_id,
            )
            return row["count"] if row else 0

    async def has_session_summary(self, project_id: UUID, session_id: UUID) -> bool:
        """Check if session already has a summary chunk.

        Args:
            project_id: Project ID
            session_id: Session ID

        Returns:
            True if summary exists
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT 1 FROM context_chunks
                WHERE project_id = $1
                  AND source_type = 'session_summary'
                  AND source_id = $2
                """,
                project_id,
                session_id,
            )
            return row is not None
