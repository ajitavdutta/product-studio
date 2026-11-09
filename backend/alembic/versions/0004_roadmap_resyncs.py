"""Create the roadmap_resyncs table for re-syncing a roadmap from Jira.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "roadmap_resyncs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("roadmap_id", sa.String(length=36), nullable=False),
        sa.Column("base_revision", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        # No foreign key: deleting a template must not break a re-sync already under way.
        sa.Column("template_id", sa.String(length=36), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        # func.now() renders CURRENT_TIMESTAMP on SQLite and now() on Postgres.
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["roadmap_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_roadmap_resyncs_created_at", "roadmap_resyncs", ["created_at"], unique=False
    )
    op.create_index(
        "ix_roadmap_resyncs_roadmap_id", "roadmap_resyncs", ["roadmap_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_roadmap_resyncs_roadmap_id", table_name="roadmap_resyncs")
    op.drop_index("ix_roadmap_resyncs_created_at", table_name="roadmap_resyncs")
    op.drop_table("roadmap_resyncs")
