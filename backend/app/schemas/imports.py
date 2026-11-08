"""Jira import sessions, column mappings and previews (IMP-1 to IMP-12). camelCase on the wire.

Validator messages are plain sentences shown to the user as they are.
"""

import datetime as dt
from collections.abc import Sequence
from typing import Final, Literal, Self, get_args
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.documents.defaults import DEFAULT_STATUSES
from app.schemas.document_api import ApiModel
from app.schemas.documents import RoadmapDocument, TeamColor

RoadmapField = Literal[
    "key",
    "title",
    "type",
    "epic",
    "team",
    "status",
    "sprint",
    "release",
    "points",
    "start",
    "end",
    "tags",
    "ignore",
]
ImportFormat = Literal["csv", "json", "xml"]
TextEncoding = Literal["utf-8-sig", "cp1252"]
MatchConfidence = Literal["template", "exact", "alias", "sniffed"]

ROADMAP_FIELDS: Final[tuple[RoadmapField, ...]] = get_args(RoadmapField)

# The Map table's labels (IMP-4), also used in validation messages.
FIELD_LABELS: Final[dict[RoadmapField, str]] = {
    "key": "Key",
    "title": "Title",
    "type": "Type",
    "epic": "Epic",
    "team": "Swimlane / Team",
    "status": "Status",
    "sprint": "Sprint",
    "release": "Release",
    "points": "Points",
    "start": "Start",
    "end": "End",
    "tags": "Tags",
    "ignore": "Don't import",
}

# Parent and Epic Link both feed Epic (Parent wins per row); any number of columns may be ignored.
FIELDS_ALLOWED_TWICE: Final[frozenset[RoadmapField]] = frozenset({"epic", "ignore"})

DEFAULT_STATUS_IDS: Final[frozenset[str]] = frozenset(status.id for status in DEFAULT_STATUSES)


def check_roadmap_fields(column_map: object) -> object:
    """Reject any value that isn't a `RoadmapField`, with a sentence instead of Pydantic's list."""
    if not isinstance(column_map, dict):
        return column_map
    for column, field in column_map.items():
        if field not in ROADMAP_FIELDS:
            choices = ", ".join(ROADMAP_FIELDS)
            raise ValueError(
                f"“{column}” is mapped to “{field}”, which isn't a roadmap field. "
                f"Use one of: {choices}."
            )
    return column_map


class ImportColumn(ApiModel):
    """One row of the Map table; repeated columns are already merged."""

    id: str = Field(..., description="Stable within a session: the normalised name or field id")
    name: str = Field(..., description="Original header, e.g. Custom field (Story Points)")
    label: str = Field(..., description="Header without its Custom field (…) wrapper")
    field_id: str | None = Field(None, description="Jira field id, e.g. customfield_10016")
    samples: list[str] = Field(..., max_length=5, description="Up to 5 non-empty values")
    fill: float = Field(..., ge=0, le=1, description="Fraction of rows with a value")
    repeat_count: int = Field(1, ge=1, description="How many header cells were merged")
    suggested_field: RoadmapField | None = None
    confidence: MatchConfidence | None = None
    note: str | None = Field(None, description="e.g. Used when Parent is empty")


class StatusSuggestion(ApiModel):
    jira_status: str
    count: int = Field(..., ge=0, description="Rows with this Jira status")
    status_id: str = Field(..., description="Suggested roadmap status id")


class RollupRules(ApiModel):
    """The four roll-up switches (IMP-8)."""

    roll_up_stories: bool = True
    use_sprint_dates: bool = True
    unscheduled_tray: bool = True
    fix_versions_as_milestones: bool = False


class ImportSessionRead(ApiModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_name: str
    size: int = Field(..., ge=0, description="Bytes uploaded")
    format: ImportFormat
    format_label: str = Field(..., description="e.g. Jira CSV")
    encoding: TextEncoding = Field(..., description="Text encoding the file was read with")
    row_count: int = Field(..., ge=0)
    columns: list[ImportColumn] = Field(..., description="Columns listed in the Map table")
    ignored_columns: list[str] = Field(..., description="Original names, for +N other columns")
    statuses: list[StatusSuggestion]
    template_id: str | None = Field(None, description="Mapping template applied first")
    suggested_name: str = Field(..., description="Default roadmap name")
    created_at: dt.datetime

    @field_validator("created_at")
    @classmethod
    def _as_utc(cls, moment: dt.datetime) -> dt.datetime:
        # SQLite drops the offset; every stored time is UTC (see app/core/clock.py).
        return moment if moment.tzinfo is not None else moment.replace(tzinfo=dt.UTC)


class CustomStatus(ApiModel):
    id: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=40)
    color: TeamColor


class ImportMapping(ApiModel):
    """Body of preview and commit.

    Checks that need the session's columns (unknown ids, a field used twice) live in
    `check_mapping_columns`, which the import service calls with them.
    """

    columns: dict[str, RoadmapField] = Field(
        ..., description="Column id → roadmap field; missing ids count as unmapped"
    )
    status_map: dict[str, str] = Field(..., description="Jira status → roadmap status id")
    custom_statuses: list[CustomStatus] = Field(default_factory=list)
    rollup: RollupRules = Field(default_factory=RollupRules)
    name: str = Field(..., min_length=1, max_length=200)

    _fields = field_validator("columns", mode="before")(check_roadmap_fields)

    @model_validator(mode="after")
    def _statuses_known(self) -> Self:
        custom_ids = [status.id for status in self.custom_statuses]
        for custom_id in custom_ids:
            if custom_id in DEFAULT_STATUS_IDS:
                raise ValueError(f"A new status can't use the id “{custom_id}”; it's taken")
        if len(set(custom_ids)) != len(custom_ids):
            raise ValueError("Two new statuses share the same id")
        known_ids = DEFAULT_STATUS_IDS | set(custom_ids)
        for jira_status, status_id in self.status_map.items():
            if status_id not in known_ids:
                raise ValueError(f"“{jira_status}” is mapped to an unknown status “{status_id}”")
        return self


def check_mapping_columns(mapping: ImportMapping, columns: Sequence[ImportColumn]) -> None:
    """Raise `ValueError` if `mapping` names a column not in `columns` or uses a field twice."""
    labels_by_id = {column.id: column.label for column in columns}
    for column_id in mapping.columns:
        if column_id not in labels_by_id:
            raise ValueError(f"This import has no column “{column_id}”")
    labels_by_field: dict[RoadmapField, list[str]] = {}
    for column_id, field in mapping.columns.items():
        labels_by_field.setdefault(field, []).append(labels_by_id[column_id])
    for field, labels in labels_by_field.items():
        if field in FIELDS_ALLOWED_TWICE or len(labels) < 2:
            continue
        raise ValueError(
            f"Two columns are mapped to {FIELD_LABELS[field]}: “{labels[0]}” and “{labels[1]}”"
        )


class ImportCommit(ImportMapping):
    update_template: bool = Field(
        True, description="Save the changed entries to the mapping template"
    )


class PreviewEpic(ApiModel):
    key: str
    title: str
    start: dt.date | None = None
    end: dt.date | None = None


class ImportPreview(ApiModel):
    epics: int = Field(..., ge=0)
    issues: int = Field(..., ge=0)
    teams: int = Field(..., ge=0)
    milestones: int = Field(..., ge=0)
    warnings: list[str]
    first_epics: list[PreviewEpic] = Field(..., max_length=5)
    more_epics: int = Field(..., ge=0, description="Epics beyond the first five")
    unmapped_columns: list[str] = Field(..., description="Labels of listed columns with no field")
    missing_required: list[Literal["key", "title"]] = Field(
        ..., description="Required fields not mapped yet (IMP-10)"
    )
    file_name: str = Field(..., description="File name Save JSON will use")
    size_estimate_bytes: int = Field(..., ge=0)
    document: RoadmapDocument = Field(..., description="Exactly what commit will save")


class SampleExportInfo(ApiModel):
    file_name: str
    row_count: int = Field(..., ge=0)
