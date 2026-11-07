"""App-wide settings (G-4), stored one key per row; missing keys fall back to defaults."""

from typing import Any

from sqlalchemy.orm import Session

from app.repositories import settings as repository
from app.repositories import watermark_presets as preset_repository
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services.errors import InvalidInputError
from app.services.watermark_presets import set_default_preset

UNKNOWN_PRESET_MESSAGE = "That watermark preset doesn't exist"


def get_settings_read(session: Session) -> SettingsRead:
    # Stored keys are the camelCase field aliases (docs/data-model.md).
    return SettingsRead.model_validate(repository.get_all(session))


def _stored_value(update: SettingsUpdate, field: str) -> Any:
    """The JSON value to store for `field`; `None` deletes the key (back to the default)."""
    value = getattr(update, field)
    if value is None:
        return None
    if field == "jira_base_url":
        return str(value)
    if field == "pi_cadence":
        return value.model_dump(by_alias=True)
    return value


def update_settings(session: Session, update: SettingsUpdate) -> SettingsRead:
    """Write only the fields that were sent. The default preset goes through
    `set_default_preset`, so the presets' `isDefault` flags follow it."""
    fields_sent = update.model_fields_set
    if "default_preset_id" in fields_sent:
        preset_id = update.default_preset_id
        if preset_id is not None and not preset_repository.exists(session, preset_id):
            raise InvalidInputError(UNKNOWN_PRESET_MESSAGE)
        set_default_preset(session, preset_id)
    for field in fields_sent - {"default_preset_id"}:
        key = SettingsUpdate.model_fields[field].alias
        assert key is not None  # every ApiModel field has a camelCase alias
        repository.put(session, key, _stored_value(update, field))
    session.commit()
    return get_settings_read(session)
