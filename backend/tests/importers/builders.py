"""Build REST JSON and RSS XML versions of the payments CSV fixture, for reader tests.

The fixture is read with the standard `csv` module so these helpers don't depend on the CSV
reader under test. Sprints become objects with dates (PAY Sprint 25 starts 2026-11-16 and
each sprint lasts 14 days), Story Points becomes `customfield_10016` and Team becomes
`customfield_10001`.
"""

import csv
import datetime as dt
import json
from email.utils import format_datetime
from typing import Final
from xml.sax.saxutils import escape, quoteattr

from tests.conftest import REPO_ROOT

PAYMENTS_CSV: Final = REPO_ROOT / "docs" / "fixtures" / "jira" / "payments-export.csv"

# Each fixture row: original header → its non-empty values, in header order.
FixtureRow = dict[str, list[str]]

SPRINT_FIELD_ID: Final = "customfield_10020"
EPIC_LINK_FIELD_ID: Final = "customfield_10014"
START_DATE_FIELD_ID: Final = "customfield_10015"
STORY_POINTS_FIELD_ID: Final = "customfield_10016"
TEAM_FIELD_ID: Final = "customfield_10001"

REST_NAMES: Final[dict[str, str]] = {
    "summary": "Summary",
    "issuetype": "Issue Type",
    "status": "Status",
    "priority": "Priority",
    "assignee": "Assignee",
    "created": "Created",
    "fixVersions": "Fix versions",
    "labels": "Labels",
    "components": "Components",
    "duedate": "Due date",
    "parent": "Parent",
    "description": "Description",
    SPRINT_FIELD_ID: "Sprint",
    EPIC_LINK_FIELD_ID: "Epic Link",
    START_DATE_FIELD_ID: "Start date",
    STORY_POINTS_FIELD_ID: "Story Points",
    TEAM_FIELD_ID: "Team",
}

_FIRST_SPRINT_NUMBER: Final = 25
_FIRST_SPRINT_START: Final = dt.date(2026, 11, 16)
_SPRINT_LENGTH: Final = dt.timedelta(days=14)
_CSV_DATE_FORMAT: Final = "%d/%b/%y %I:%M %p"


def load_fixture_rows() -> list[FixtureRow]:
    with PAYMENTS_CSV.open(encoding="utf-8-sig", newline="") as fixture:
        header, *records = list(csv.reader(fixture))
    rows: list[FixtureRow] = []
    for record in records:
        row: FixtureRow = {name: [] for name in header}
        for name, value in zip(header, record, strict=True):
            if value:
                row[name].append(value)
        rows.append(row)
    return rows


def sprint_window(name: str) -> tuple[dt.date, dt.date]:
    """The dates the builders give `PAY Sprint N`."""
    number = int(name.rsplit(" ", 1)[1])
    start = _FIRST_SPRINT_START + (number - _FIRST_SPRINT_NUMBER) * _SPRINT_LENGTH
    return start, start + _SPRINT_LENGTH - dt.timedelta(days=1)


def _csv_date(value: str) -> dt.date:
    return dt.datetime.strptime(value, _CSV_DATE_FORMAT).date()


def _first(row: FixtureRow, name: str) -> str | None:
    values = row[name]
    return values[0] if values else None


def _rest_date(row: FixtureRow, name: str) -> str | None:
    value = _first(row, name)
    return _csv_date(value).isoformat() if value else None


def _rest_sprint(name: str) -> dict[str, object]:
    start, end = sprint_window(name)
    return {
        "id": int(name.rsplit(" ", 1)[1]),
        "name": name,
        "state": "closed",
        "startDate": f"{start.isoformat()}T09:00:00.000Z",
        "endDate": f"{end.isoformat()}T17:00:00.000Z",
    }


def _rest_fields(row: FixtureRow) -> dict[str, object]:
    points = _first(row, "Custom field (Story Points)")
    parent = _first(row, "Parent")
    team = _first(row, "Custom field (Team)")
    created = _first(row, "Created")
    return {
        "summary": _first(row, "Summary"),
        "issuetype": {"name": _first(row, "Issue Type")},
        "status": {"name": _first(row, "Status")},
        "priority": {"name": _first(row, "Priority")},
        "assignee": {"displayName": _first(row, "Assignee")},
        "created": f"{_csv_date(created).isoformat()}T00:00:00.000+0000" if created else None,
        "fixVersions": [{"name": name} for name in row["Fix versions"]],
        "labels": row["Labels"],
        "components": [{"name": name} for name in row["Components"]],
        "duedate": _rest_date(row, "Due date"),
        "parent": {"key": parent} if parent else None,
        "description": _first(row, "Description"),
        SPRINT_FIELD_ID: [_rest_sprint(name) for name in row["Sprint"]],
        EPIC_LINK_FIELD_ID: _first(row, "Epic Link"),
        START_DATE_FIELD_ID: _rest_date(row, "Custom field (Start date)"),
        STORY_POINTS_FIELD_ID: float(points) if points else None,
        TEAM_FIELD_ID: {"id": f"team-{team}", "name": team} if team else None,
    }


def build_rest_json(rows: list[FixtureRow], with_names: bool) -> bytes:
    """A REST search response for the rows; `with_names` adds the `expand=names` map."""
    payload: dict[str, object] = {
        "startAt": 0,
        "maxResults": len(rows),
        "total": len(rows),
        "issues": [
            {
                "id": _first(row, "Issue id"),
                "key": _first(row, "Issue key"),
                "fields": _rest_fields(row),
            }
            for row in rows
        ],
    }
    if with_names:
        payload["names"] = REST_NAMES
    return json.dumps(payload).encode("utf-8")


def _rss_date(value: str) -> str:
    moment = dt.datetime.combine(_csv_date(value), dt.time(), tzinfo=dt.UTC)
    return format_datetime(moment)


def _element(tag: str, value: str, attributes: str = "") -> str:
    return f"<{tag}{attributes}>{escape(value)}</{tag}>"


def _rss_custom_field(field_id: str, name: str, values: list[str]) -> str:
    if not values:
        return ""
    cells = "".join(_element("customfieldvalue", value) for value in values)
    return (
        f"<customfield id={quoteattr(field_id)}>"
        f"{_element('customfieldname', name)}"
        f"<customfieldvalues>{cells}</customfieldvalues></customfield>"
    )


def _rss_item(row: FixtureRow) -> str:
    key = _first(row, "Issue key") or ""
    summary = _first(row, "Summary") or ""
    parts = [
        _element("title", f"[{key}] {summary}"),
        _element("link", f"https://example.atlassian.net/browse/{key}"),
        _element("key", key, f" id={quoteattr(_first(row, 'Issue id') or '')}"),
        _element("summary", summary),
        _element("type", _first(row, "Issue Type") or ""),
        _element("status", _first(row, "Status") or ""),
        _element("priority", _first(row, "Priority") or ""),
        _element("assignee", _first(row, "Assignee") or ""),
    ]
    for tag, column in (("parent", "Parent"), ("description", "Description")):
        parts += [_element(tag, value) for value in row[column]]
    parts.append("<labels>" + "".join(_element("label", v) for v in row["Labels"]) + "</labels>")
    for tag, column in (("created", "Created"), ("due", "Due date")):
        parts += [_element(tag, _rss_date(value)) for value in row[column]]
    parts += [_element("fixVersion", value) for value in row["Fix versions"]]
    parts += [_element("component", value) for value in row["Components"]]
    start_dates = [_rss_date(value) for value in row["Custom field (Start date)"]]
    custom_fields = [
        _rss_custom_field(SPRINT_FIELD_ID, "Sprint", row["Sprint"]),
        _rss_custom_field(EPIC_LINK_FIELD_ID, "Epic Link", row["Epic Link"]),
        _rss_custom_field(START_DATE_FIELD_ID, "Start date", start_dates),
        _rss_custom_field(
            STORY_POINTS_FIELD_ID, "Story Points", row["Custom field (Story Points)"]
        ),
        _rss_custom_field(TEAM_FIELD_ID, "Team", row["Custom field (Team)"]),
    ]
    parts.append("<customfields>" + "".join(custom_fields) + "</customfields>")
    return "<item>" + "".join(parts) + "</item>"


def build_rss_xml(rows: list[FixtureRow]) -> bytes:
    """A Jira "XML" issue-search export for the rows."""
    items = "".join(_rss_item(row) for row in rows)
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="0.92"><channel><title>Jira</title>'
        f'<issue start="0" end="{len(rows)}" total="{len(rows)}"/>{items}'
        "</channel></rss>"
    )
    return document.encode("utf-8")
