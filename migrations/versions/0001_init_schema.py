from __future__ import annotations

"""init schema"""

from alembic import op
import sqlalchemy as sa


revision = "0001_init_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    op.create_table(
        "users",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("settings", sa.JSON, server_default=sa.text("'{}'::jsonb")),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=500)),
        sa.Column("model", sa.String(length=50), server_default="gpt-5.1"),
        sa.Column("reasoning_effort", sa.String(length=20), server_default="medium"),
        sa.Column("mcp_config", sa.JSON, server_default=sa.text("'[\"sequential-thinking\", \"fetch\"]'::jsonb")),
        sa.Column("pinned", sa.Boolean, server_default=sa.text("FALSE")),
        sa.Column("is_named", sa.Boolean, server_default=sa.text("FALSE")),
        sa.Column("message_count", sa.Integer, server_default=sa.text("0")),
        sa.Column("total_tokens", sa.Integer, server_default=sa.text("0")),
        sa.Column("accumulated_tool_tokens", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "session_id", name="uq_sessions_user_session"),
    )
    op.create_index("idx_sessions_user_id", "sessions", ["user_id"])
    op.create_index("idx_sessions_last_used", "sessions", ["user_id", "last_used_at"])

    op.create_table(
        "messages",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text),
        sa.Column("metadata", sa.JSON, server_default=sa.text("'{}'::jsonb")),
        sa.Column("tool_call_id", sa.String(length=50)),
        sa.Column("tool_name", sa.String(length=100)),
        sa.Column("tool_arguments", sa.JSON),
        sa.Column("tool_result", sa.Text),
        sa.Column("tool_success", sa.Boolean),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_messages_session_id", "messages", ["session_id"])
    op.create_index("idx_messages_created_at", "messages", ["session_id", "created_at"])

    op.create_table(
        "llm_context",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text),
        sa.Column("metadata", sa.JSON, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_llm_context_session_id", "llm_context", ["session_id"])

    op.create_table(
        "files",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("session_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("content_type", sa.String(length=100)),
        sa.Column("size_bytes", sa.BigInteger),
        sa.Column("folder", sa.String(length=20), server_default="sources"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_files_session_id", "files", ["session_id"])

    # Seed default user (password hash for "localdev")
    op.execute(
        """
        INSERT INTO users (email, password_hash, display_name)
        VALUES ('local@chatjuicer.dev', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VttYS/Vj/3l6Ym', 'Local User')
        ON CONFLICT (email) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_index("idx_files_session_id", table_name="files")
    op.drop_table("files")

    op.drop_index("idx_llm_context_session_id", table_name="llm_context")
    op.drop_table("llm_context")

    op.drop_index("idx_messages_created_at", table_name="messages")
    op.drop_index("idx_messages_session_id", table_name="messages")
    op.drop_table("messages")

    op.drop_index("idx_sessions_last_used", table_name="sessions")
    op.drop_index("idx_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")

    op.drop_table("users")
