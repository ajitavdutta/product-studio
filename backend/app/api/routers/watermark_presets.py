from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.db import get_session
from app.schemas.watermark_presets import (
    WatermarkPresetCreate,
    WatermarkPresetRead,
    WatermarkPresetUpdate,
)
from app.services import watermark_presets as service

router = APIRouter(prefix="/watermark-presets", tags=["watermark-presets"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[WatermarkPresetRead])
def list_watermark_presets(session: SessionDep) -> list[WatermarkPresetRead]:
    """Every watermark preset, by name."""
    return service.list_presets(session)


@router.post(
    "",
    response_model=WatermarkPresetRead,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422),
)
def create_watermark_preset(
    request: WatermarkPresetCreate, session: SessionDep
) -> WatermarkPresetRead:
    """Save a preset; `isDefault: true` makes it the only default (G-4)."""
    return service.create_preset(session, request)


@router.get("/{preset_id}", response_model=WatermarkPresetRead, responses=problem_responses(404))
def get_watermark_preset(preset_id: UUID, session: SessionDep) -> WatermarkPresetRead:
    return service.get_preset(session, preset_id)


@router.patch(
    "/{preset_id}", response_model=WatermarkPresetRead, responses=problem_responses(404, 422)
)
def update_watermark_preset(
    preset_id: UUID, update: WatermarkPresetUpdate, session: SessionDep
) -> WatermarkPresetRead:
    """Change only the fields sent."""
    return service.update_preset(session, preset_id, update)


@router.delete("/{preset_id}", response_model=WatermarkPresetRead, responses=problem_responses(404))
def delete_watermark_preset(preset_id: UUID, session: SessionDep) -> WatermarkPresetRead:
    """Delete the preset and return what was deleted; deleting the default leaves none."""
    return service.delete_preset(session, preset_id)
