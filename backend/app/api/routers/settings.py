from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.db import get_session
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services import settings as service

router = APIRouter(prefix="/settings", tags=["settings"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=SettingsRead)
def get_settings(session: SessionDep) -> SettingsRead:
    """Every setting, with defaults for the ones never saved (G-4)."""
    return service.get_settings_read(session)


@router.put("", response_model=SettingsRead, responses=problem_responses(422))
def update_settings(update: SettingsUpdate, session: SessionDep) -> SettingsRead:
    """Change only the fields sent; `null` resets a field to its default."""
    return service.update_settings(session, update)
