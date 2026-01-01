from __future__ import annotations

"""add context_chunks table with pgvector

Revision ID: 0005_add_context_chunks
Revises: 0004_add_projects
Create Date: 2026-01-01

Adds context_chunks table for semantic search over project content.
Uses pgvector for 1536-dimensional embeddings (text-embedding-3-small).
Includes HNSW index for fast approximate nearest neighbor search.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision = "0005_add_context_chunks"
down_revision = "0004_add_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Note: pgvector extension must be enabled by superuser first:
    # CREATE EXTENSION IF NOT EXISTS vector;

    # Create context_chunks table
    op.execute("""
        CREATE TABLE context_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_type TEXT NOT NULL,
            source_id UUID NOT NULL,
            chunk_index INT NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            embedding vector(1536),
            token_count INT,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # HNSW index for fast approximate nearest neighbor search
    op.execute("""
        CREATE INDEX idx_context_chunks_embedding ON context_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    # Index for project lookup
    op.execute("CREATE INDEX idx_context_chunks_project ON context_chunks(project_id)")

    # Index for source lookup
    op.execute("CREATE INDEX idx_context_chunks_source ON context_chunks(source_type, source_id)")

    # Deduplication: same content in same project = skip
    op.execute("""
        CREATE UNIQUE INDEX idx_context_chunks_dedupe
        ON context_chunks (project_id, source_type, content_hash)
    """)

    # Session summary upsert support (one summary per session per project)
    op.execute("""
        CREATE UNIQUE INDEX idx_context_chunks_session_summary
        ON context_chunks (project_id, source_type, source_id)
        WHERE source_type = 'session_summary'
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_context_chunks_session_summary")
    op.execute("DROP INDEX IF EXISTS idx_context_chunks_dedupe")
    op.execute("DROP INDEX IF EXISTS idx_context_chunks_source")
    op.execute("DROP INDEX IF EXISTS idx_context_chunks_project")
    op.execute("DROP INDEX IF EXISTS idx_context_chunks_embedding")
    op.execute("DROP TABLE IF EXISTS context_chunks")
