"""Create the mapping_templates, watermark_presets, assets and settings tables.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-07

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # assets first: watermark_presets.image_asset_id refers to it.
    op.create_table(
        "assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("mime", sa.String(length=32), nullable=False),
        sa.Column("bytes", sa.LargeBinary(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assets_sha256", "assets", ["sha256"], unique=True)

    op.create_table(
        "mapping_templates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("jira_site", sa.String(length=255), nullable=True),
        sa.Column("column_map", sa.JSON(), nullable=False),
        sa.Column("status_map", sa.JSON(), nullable=False),
        # func.now() renders CURRENT_TIMESTAMP on SQLite and now() on Postgres.
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mapping_templates_name", "mapping_templates", ["name"], unique=False)
    op.create_index(
        "ix_mapping_templates_updated_at", "mapping_templates", ["updated_at"], unique=False
    )

    op.create_table(
        "settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "watermark_presets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("type", sa.String(length=8), nullable=False),
        sa.Column("text", sa.String(length=200), nullable=True),
        sa.Column("image_asset_id", sa.String(length=36), nullable=True),
        sa.Column("position", sa.String(length=10), nullable=False),
        sa.Column("opacity", sa.Float(), nullable=False),
        sa.Column("color", sa.String(length=8), nullable=False),
        # sa.false() renders 0 on SQLite and false on Postgres.
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.CheckConstraint("type in ('text','image')", name="ck_watermark_presets_type"),
        sa.CheckConstraint(
            "position in ('diagonal','tiled','corner')", name="ck_watermark_presets_position"
        ),
        sa.CheckConstraint(
            "color in ('red','grey','blue','black')", name="ck_watermark_presets_color"
        ),
        sa.ForeignKeyConstraint(["image_asset_id"], ["assets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_watermark_presets_is_default", "watermark_presets", ["is_default"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_watermark_presets_is_default", table_name="watermark_presets")
    op.drop_table("watermark_presets")
    op.drop_table("settings")
    op.drop_index("ix_mapping_templates_updated_at", table_name="mapping_templates")
    op.drop_index("ix_mapping_templates_name", table_name="mapping_templates")
    op.drop_table("mapping_templates")
    op.drop_index("ix_assets_sha256", table_name="assets")
    op.drop_table("assets")
