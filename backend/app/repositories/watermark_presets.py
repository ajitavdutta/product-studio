"""Rows of the `watermark_presets` table."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WatermarkPreset


def get(session: Session, preset_id: str) -> WatermarkPreset | None:
    return session.get(WatermarkPreset, preset_id)


def exists(session: Session, preset_id: str) -> bool:
    return get(session, preset_id) is not None


def list_all(session: Session) -> list[WatermarkPreset]:
    """Alphabetical, for the preset picker; id breaks ties."""
    return list(
        session.scalars(select(WatermarkPreset).order_by(WatermarkPreset.name, WatermarkPreset.id))
    )


def add(session: Session, row: WatermarkPreset) -> None:
    session.add(row)


def delete(session: Session, row: WatermarkPreset) -> None:
    session.delete(row)


def mark_only_default(session: Session, preset_id: str | None) -> None:
    """Set `is_default` on `preset_id` and clear it everywhere else (`None` clears all).

    Assigns through the ORM (presets are few) so rows already loaded stay current.
    """
    for row in list_all(session):
        row.is_default = row.id == preset_id
