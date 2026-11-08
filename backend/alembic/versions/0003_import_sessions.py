"""Create the import_sessions table for Jira imports.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("format", sa.String(length=8), nullable=False),
        sa.Column("encoding", sa.String(length=16), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("columns", sa.JSON(), nullable=False),
        sa.Column("rows", sa.JSON(), nullable=False),
        sa.Column("extras", sa.JSON(), nullable=False),
        # No foreign key: deleting a template must not break an import already under way.
        sa.Column("template_id", sa.String(length=36), nullable=True),
        # func.now() renders CURRENT_TIMESTAMP on SQLite and now() on Postgres.
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("format in ('csv','json','xml')", name="ck_import_sessions_format"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_import_sessions_created_at", "import_sessions", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_import_sessions_created_at", table_name="import_sessions")
    op.drop_table("import_sessions")
