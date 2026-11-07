"""Watermark presets (EX-3) and which one is the default (G-4).

`settings.defaultPresetId` is the source of truth for the default; the `is_default` column
mirrors it. Only `set_default_preset` writes either, so the two never disagree.
"""

from typing import Any
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.documents.errors import to_problem
from app.models import WatermarkPreset
from app.repositories import assets as asset_repository
from app.repositories import settings as settings_repository
from app.repositories import watermark_presets as repository
from app.schemas.watermark_presets import (
    WatermarkPresetCreate,
    WatermarkPresetRead,
    WatermarkPresetUpdate,
)
from app.services.errors import InvalidInputError, NotFoundError

NOT_FOUND_MESSAGE = "We couldn't find that watermark preset. It may have been deleted."
MISSING_LOGO_MESSAGE = "That logo no longer exists. Upload it again."


def _require_row(session: Session, preset_id: UUID) -> WatermarkPreset:
    row = repository.get(session, str(preset_id))
    if row is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return row


def _require_logo(session: Session, preset: WatermarkPresetCreate) -> None:
    if preset.type != "image" or preset.image_asset_id is None:
        return
    if not asset_repository.exists(session, preset.image_asset_id):
        raise InvalidInputError(MISSING_LOGO_MESSAGE)


def set_default_preset(session: Session, preset_id: str | None) -> None:
    """Make `preset_id` the default (`None`: no default). Does not commit."""
    repository.mark_only_default(session, preset_id)
    settings_repository.put(session, settings_repository.DEFAULT_PRESET_ID_KEY, preset_id)


def _is_current_default(session: Session, preset_id: str) -> bool:
    current = settings_repository.get_value(session, settings_repository.DEFAULT_PRESET_ID_KEY)
    return bool(current == preset_id)


def _columns(preset: WatermarkPresetCreate) -> dict[str, Any]:
    # is_default is written only through set_default_preset.
    return preset.model_dump(exclude={"is_default"})


def list_presets(session: Session) -> list[WatermarkPresetRead]:
    return [WatermarkPresetRead.model_validate(row) for row in repository.list_all(session)]


def get_preset(session: Session, preset_id: UUID) -> WatermarkPresetRead:
    return WatermarkPresetRead.model_validate(_require_row(session, preset_id))


def create_preset(session: Session, request: WatermarkPresetCreate) -> WatermarkPresetRead:
    _require_logo(session, request)
    row = WatermarkPreset(id=str(uuid4()), is_default=False, **_columns(request))
    repository.add(session, row)
    session.flush()
    if request.is_default:
        set_default_preset(session, row.id)
    session.commit()
    return WatermarkPresetRead.model_validate(row)


def update_preset(
    session: Session, preset_id: UUID, update: WatermarkPresetUpdate
) -> WatermarkPresetRead:
    """Change only the fields sent; the merged preset must still be valid."""
    row = _require_row(session, preset_id)
    current = WatermarkPresetRead.model_validate(row).model_dump(exclude={"id"})
    try:
        merged = WatermarkPresetCreate.model_validate(
            {**current, **update.model_dump(exclude_unset=True)}
        )
    except ValidationError as exc:
        raise to_problem(exc) from exc
    _require_logo(session, merged)
    for field, value in _columns(merged).items():
        setattr(row, field, value)
    if merged.is_default != row.is_default:
        set_default_preset(session, row.id if merged.is_default else None)
    session.commit()
    return WatermarkPresetRead.model_validate(row)


def delete_preset(session: Session, preset_id: UUID) -> WatermarkPresetRead:
    """Delete the preset; deleting the default leaves no default."""
    row = _require_row(session, preset_id)
    deleted = WatermarkPresetRead.model_validate(row)
    if _is_current_default(session, row.id):
        set_default_preset(session, None)
    repository.delete(session, row)
    session.commit()
    return deleted
