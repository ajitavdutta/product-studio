"""Read a Jira REST search response (`issues[]`) into raw columns and rows (IMP-1, IMP-6).

Top-level `key` becomes the `Issue key` column. Each `fields.*` entry becomes a column named
by the `names` expansion (`expand=names`) when it has one, otherwise by the field id; the id
is kept as `field_id` either way. Values are flattened to strings, and a list gives one cell
value per element. Nothing in the payload is evaluated.

ASSUMPTION: the whole payload is parsed with `json.loads`. Uploads are capped at 20 MB before
they get here, and a streaming JSON parser would be a new dependency.
"""

import datetime as dt
import json
from collections.abc import Mapping
from typing import Final

from app.importers.jira.dates import parse_jira_date
from app.importers.jira.detect import EMPTY_EXPORT_MESSAGE
from app.importers.jira.types import ExportExtras, ParsedExport, RawColumn, Rows
from app.schemas.imports import TextEncoding
from app.services.errors import InvalidInputError

UNREADABLE_JSON_MESSAGE: Final = (
    "This JSON file couldn't be read. Export it from Jira again and upload the new file."
)
NO_ISSUES_LIST_MESSAGE: Final = (
    "This JSON file has no Jira issues in it. "
    "Export it from Jira's issue search (REST API) and try again."
)
MALFORMED_ISSUE_MESSAGE: Final = "Issue {position} in this JSON file isn't a Jira issue"

ISSUE_KEY_COLUMN: Final = "Issue key"
# The REST field ids whose objects carry dates the importer keeps in `ExportExtras`.
FIX_VERSIONS_FIELD_ID: Final = "fixVersions"
# Tried in order when flattening an object: option, user, parent and team objects use these.
_DISPLAY_KEYS: Final = ("name", "value", "key", "displayName")
# REST date fields are ISO, so they never read day first.
_ISO_DAYFIRST: Final = False


def read_json(text: str, encoding: TextEncoding) -> ParsedExport:
    """Parse decoded REST JSON into a `ParsedExport` with format `json`.

    Columns appear in first-seen order across all issues. Sprint objects with `startDate` and
    `endDate` fill `extras.sprint_windows`; `fixVersions[].releaseDate` fills
    `extras.release_dates`. Raises `InvalidInputError` when the text isn't JSON, has no
    `issues` list, the list is empty, or an issue isn't an object.
    """
    issues, names = _load_issues(text)
    field_ids = _field_ids_in_order(issues)
    columns = [RawColumn(name=ISSUE_KEY_COLUMN)] + [
        RawColumn(name=_column_name(field_id, names), field_id=field_id) for field_id in field_ids
    ]
    rows: Rows = []
    for issue in issues:
        fields = _fields_of(issue)
        key_cell = _flatten(issue.get("key"))
        rows.append([key_cell] + [_flatten(fields.get(field_id)) for field_id in field_ids])
    return ParsedExport(
        format="json",
        encoding=encoding,
        columns=columns,
        rows=rows,
        extras=ExportExtras(
            sprint_windows=_sprint_windows(issues), release_dates=_release_dates(issues)
        ),
    )


def _load_issues(text: str) -> tuple[list[Mapping[str, object]], Mapping[str, object]]:
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, RecursionError) as error:
        raise InvalidInputError(UNREADABLE_JSON_MESSAGE) from error
    if not isinstance(payload, dict) or not isinstance(payload.get("issues"), list):
        raise InvalidInputError(NO_ISSUES_LIST_MESSAGE)
    raw_issues: list[object] = payload["issues"]
    if not raw_issues:
        raise InvalidInputError(EMPTY_EXPORT_MESSAGE)
    issues: list[Mapping[str, object]] = []
    for position, issue in enumerate(raw_issues, start=1):
        if not isinstance(issue, dict):
            raise InvalidInputError(MALFORMED_ISSUE_MESSAGE.format(position=position))
        issues.append(issue)
    names = payload.get("names")
    return issues, names if isinstance(names, dict) else {}


def _fields_of(issue: Mapping[str, object]) -> Mapping[str, object]:
    fields = issue.get("fields")
    return fields if isinstance(fields, dict) else {}


def _field_ids_in_order(issues: list[Mapping[str, object]]) -> list[str]:
    # A dict keeps first-seen order and drops repeats.
    seen: dict[str, None] = {}
    for issue in issues:
        for field_id in _fields_of(issue):
            seen.setdefault(field_id, None)
    return list(seen)


def _column_name(field_id: str, names: Mapping[str, object]) -> str:
    name = names.get(field_id)
    return name if isinstance(name, str) and name.strip() else field_id


def _flatten(value: object) -> list[str]:
    """The non-empty display strings in a REST field value, in order."""
    if value is None or isinstance(value, bool):
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, int):
        return [str(value)]
    if isinstance(value, float):
        # Jira sends story points as 8.0; show them as the CSV export does.
        return [str(int(value)) if value.is_integer() else str(value)]
    if isinstance(value, list):
        return [text for element in value for text in _flatten(element)]
    if isinstance(value, dict):
        return _flatten_object(value)
    return []


def _flatten_object(value: Mapping[str, object]) -> list[str]:
    for display_key in _DISPLAY_KEYS:
        display = value.get(display_key)
        if isinstance(display, str) and display.strip():
            return [display]
    # Rich text, progress and watcher objects have no single display value.
    return []


def _objects_in(value: object) -> list[Mapping[str, object]]:
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list):
        return [element for element in value if isinstance(element, dict)]
    return []


def _date_field(value: object) -> dt.date | None:
    return parse_jira_date(value, _ISO_DAYFIRST) if isinstance(value, str) else None


def _sprint_windows(issues: list[Mapping[str, object]]) -> dict[str, tuple[dt.date, dt.date]]:
    # The sprint field's id differs per site, so sprints are found by shape, not by id.
    windows: dict[str, tuple[dt.date, dt.date]] = {}
    for issue in issues:
        for value in _fields_of(issue).values():
            for candidate in _objects_in(value):
                name = candidate.get("name")
                start = _date_field(candidate.get("startDate"))
                end = _date_field(candidate.get("endDate"))
                if isinstance(name, str) and name.strip() and start and end:
                    windows.setdefault(name, (start, end))
    return windows


def _release_dates(issues: list[Mapping[str, object]]) -> dict[str, dt.date]:
    releases: dict[str, dt.date] = {}
    for issue in issues:
        for version in _objects_in(_fields_of(issue).get(FIX_VERSIONS_FIELD_ID)):
            name = version.get("name")
            release_date = _date_field(version.get("releaseDate"))
            if isinstance(name, str) and name.strip() and release_date:
                releases.setdefault(name, release_date)
    return releases
