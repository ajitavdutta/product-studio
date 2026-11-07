from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class WatermarkPreset(Base):
    """A reusable export watermark (EX-3). `is_default` mirrors `settings.defaultPresetId`."""

    __tablename__ = "watermark_presets"
    __table_args__ = (
        CheckConstraint("type in ('text','image')", name="ck_watermark_presets_type"),
        CheckConstraint(
            "position in ('diagonal','tiled','corner')", name="ck_watermark_presets_position"
        ),
        CheckConstraint(
            "color in ('red','grey','blue','black')", name="ck_watermark_presets_color"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(8))
    text: Mapped[str | None] = mapped_column(String(200))
    image_asset_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("assets.id", ondelete="SET NULL")
    )
    position: Mapped[str] = mapped_column(String(10))
    opacity: Mapped[float] = mapped_column(Float)
    color: Mapped[str] = mapped_column(String(8))
    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), index=True
    )
