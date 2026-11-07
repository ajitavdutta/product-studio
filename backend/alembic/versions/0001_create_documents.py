"""Create the documents table.

Revision ID: 0001
Revises:
Create Date: 2026-11-07

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXED_COLUMNS = ("kind", "name", "schema_version", "revision", "updated_at")


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("body", sa.JSON(), nullable=False),
        # func.now() renders CURRENT_TIMESTAMP on SQLite and now() on Postgres.
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind in ('roadmap','diagram')", name="ck_documents_kind"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("documents") as batch_op:
        for column in INDEXED_COLUMNS:
            batch_op.create_index(f"ix_documents_{column}", [column], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        for column in reversed(INDEXED_COLUMNS):
            batch_op.drop_index(f"ix_documents_{column}")
    op.drop_table("documents")
