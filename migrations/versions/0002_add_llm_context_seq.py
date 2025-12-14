from __future__ import annotations

"""add llm_context seq column for ordering

Revision ID: 0002_add_llm_context_seq
Revises: 0001_init_schema
Create Date: 2024-12-13

Adds a SERIAL seq column to llm_context table to preserve insertion order.
Critical for reasoning models where reasoning items must precede their
associated function_call/message items.
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_llm_context_seq"
down_revision = "0001_init_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add seq column with SERIAL (auto-incrementing) for insertion order
    op.add_column(
        "llm_context",
        sa.Column("seq", sa.Integer, autoincrement=True, nullable=False, server_default=sa.text("nextval('llm_context_seq_seq'::regclass)")),
    )

    # Create sequence if it doesn't exist (PostgreSQL handles this for SERIAL)
    op.execute("CREATE SEQUENCE IF NOT EXISTS llm_context_seq_seq;")
    op.execute("ALTER TABLE llm_context ALTER COLUMN seq SET DEFAULT nextval('llm_context_seq_seq'::regclass);")

    # Create index for efficient ordering queries
    op.create_index("idx_llm_context_seq", "llm_context", ["session_id", "seq"])


def downgrade() -> None:
    op.drop_index("idx_llm_context_seq", table_name="llm_context")
    op.drop_column("llm_context", "seq")
    op.execute("DROP SEQUENCE IF EXISTS llm_context_seq_seq;")
