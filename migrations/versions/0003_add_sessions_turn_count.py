from __future__ import annotations

"""add sessions turn_count column for turn-based titling

Revision ID: 0003_add_sessions_turn_count
Revises: 0002_add_llm_context_seq
Create Date: 2024-12-13

Adds turn_count column to sessions table. Unlike message_count which increments
for every message (including tool calls), turn_count only increments when a user
message is added. This enables more accurate title generation triggering after
the first complete conversation turn (turn_count >= 1) rather than after
message_count >= 2 which could be satisfied by tool calls alone.
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_add_sessions_turn_count"
down_revision = "0002_add_llm_context_seq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add turn_count column with default 0
    op.add_column(
        "sessions",
        sa.Column("turn_count", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("sessions", "turn_count")
