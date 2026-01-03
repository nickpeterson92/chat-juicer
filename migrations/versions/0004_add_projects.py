from __future__ import annotations

"""add projects table and project_id to sessions/files

Revision ID: 0004_add_projects
Revises: 0003_add_sessions_turn_count
Create Date: 2026-01-01

Adds projects table for organizing sessions, files, and context.
Adds project_id foreign key to sessions and files tables.
Projects are optional (nullable FK) for backward compatibility.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0004_add_projects"
down_revision = "0003_add_sessions_turn_count"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create projects table
    op.create_table(
        "projects",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Index for user's projects
    op.create_index("idx_projects_user_id", "projects", ["user_id"])

    # Add project_id to sessions (nullable for backward compatibility)
    op.add_column(
        "sessions",
        sa.Column("project_id", UUID(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_sessions_project_id", "sessions", ["project_id"])

    # Add project_id to files (nullable for backward compatibility)
    op.add_column(
        "files",
        sa.Column("project_id", UUID(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_files_project_id", "files", ["project_id"])


def downgrade() -> None:
    # Remove project_id from files
    op.drop_index("idx_files_project_id")
    op.drop_column("files", "project_id")

    # Remove project_id from sessions
    op.drop_index("idx_sessions_project_id")
    op.drop_column("sessions", "project_id")

    # Drop projects table
    op.drop_index("idx_projects_user_id")
    op.drop_table("projects")
