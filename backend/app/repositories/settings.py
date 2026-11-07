"""Rows of the `settings` key/value table."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Setting

# Keys as listed in docs/data-model.md.
DISPLAY_NAME_KEY = "displayName"
JIRA_BASE_URL_KEY = "jiraBaseUrl"
DEFAULT_PRESET_ID_KEY = "defaultPresetId"
PI_CADENCE_KEY = "piCadence"


def get_all(session: Session) -> dict[str, Any]:
    return {row.key: row.value for row in session.scalars(select(Setting))}


def get_value(session: Session, key: str) -> Any:
    """The stored value, or `None` when the key is unset."""
    row = session.get(Setting, key)
    return row.value if row is not None else None


def put(session: Session, key: str, value: Any) -> None:
    """Store `value` under `key`; `None` removes the key so the default applies again."""
    row = session.get(Setting, key)
    if value is None:
        if row is not None:
            session.delete(row)
        return
    if row is None:
        session.add(Setting(key=key, value=value))
        return
    row.value = value
