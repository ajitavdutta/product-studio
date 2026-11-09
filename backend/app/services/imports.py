"""Jira import sessions: upload, live preview and commit (IMP-1, IMP-9 to IMP-12, NF-3).

An upload is parsed once and kept for `IMPORT_SESSION_TTL`: only the Map table's columns
and their cells are stored, so a preview rebuilds from stored rows without re-parsing.
Every function takes the session first and has no user parameter (ADR-5).
"""

import datetime as dt
import json
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import Any, Final, Literal
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core import clock
from app.documents.errors import to_problem
from app.importers.jira.build import EPIC_TYPE, BuildResult, ImportData, build_roadmap
from app.importers.jira.columns import merge_repeated_columns, value_for
from app.importers.jira.csv_reader import read_csv
from app.importers.jira.detect import DETECT_HEAD_BYTES, decode, detect_format
from app.importers.jira.json_reader import read_json
from app.importers.jira.statuses import map_statuses
from app.importers.jira.suggest import classify, suggest_mapping
from app.importers.jira.types import ColumnGroup, ExportExtras, ParsedExport, Rows
from app.importers.jira.xml_reader import read_xml
from app.models import ImportSession, MappingTemplate
from app.models.import_session import IMPORT_SESSION_TTL
from app.repositories import imports as repository
from app.repositories import mapping_templates as template_repository
from app.schemas.document_api import RoadmapRead
from app.schemas.documents import RoadmapDocument, dump_document
from app.schemas.imports import (
    DEFAULT_STATUS_IDS,
    CustomStatus,
    ImportColumn,
    ImportCommit,
    ImportFormat,
    ImportMapping,
    ImportPreview,
    ImportSessionRead,
    MatchConfidence,
    PreviewEpic,
    RoadmapField,
    SampleExportInfo,
    StatusSuggestion,
    check_mapping_columns,
)
from app.schemas.mapping_templates import MappingTemplateRead
from app.schemas.settings import SettingsRead
from app.services import documents
from app.services.errors import InvalidInputError, NotFoundError
from app.services.mapping_templates import NOT_FOUND_MESSAGE as TEMPLATE_NOT_FOUND_MESSAGE
from app.services.settings import get_settings_read

EXPIRED_MESSAGE: Final = "That import has expired. Upload the file again."
MISSING_REQUIRED_MESSAGE: Final = "Map Key and Title before creating the roadmap"
RequiredField = Literal["key", "title"]
REQUIRED_FIELDS: Final[tuple[RequiredField, ...]] = ("key", "title")
FORMAT_LABELS: Final[dict[ImportFormat, str]] = {
    "csv": "Jira CSV",
    "json": "Jira JSON",
    "xml": "Jira XML",
}
FALLBACK_FILE_NAME: Final = "jira-export"
FILE_NAME_MAX_LENGTH: Final = 255
ROADMAP_NAME_MAX_LENGTH: Final = 200
TEMPLATE_NAME_MAX_LENGTH: Final = 120
TEMPLATE_NAME_SUFFIX: Final = " mapping"
PREVIEW_EPIC_COUNT: Final = 5
SAMPLE_PATH: Final = (
    Path(__file__).resolve().parents[1] / "importers/jira/sample/payments-export.csv"
)
# Re-sync has no Map screen, so only columns matched by name are trusted; sniffed ones are not.
RESYNC_CONFIDENCES: Final[frozenset[MatchConfidence]] = frozenset({"template", "exact", "alias"})
RESYNC_MISSING_COLUMNS_MESSAGE: Final = (
    "Couldn't find the Key and Summary columns in this file. "
    "Import it from the Import page instead."
)
# Stored beside each ImportColumn so the builder can find the column's cells in a stored row.
SOURCE_INDEXES_KEY: Final = "sourceIndexes"


# --- Upload --------------------------------------------------------------------------------


def _parse(file_name: str, data: bytes) -> ParsedExport:
    """Decode, detect and read an upload. Raises `InvalidInputError` with a plain reason."""
    text, encoding = decode(data)
    export_format = detect_format(file_name, data[:DETECT_HEAD_BYTES])
    if export_format == "json":
        return read_json(text, encoding)
    if export_format == "xml":
        return read_xml(text, encoding)
    return read_csv(text, encoding)


def _safe_file_name(raw: str | None) -> str:
    """The upload's base name only (no client path), trimmed to fit the column."""
    name = PurePosixPath((raw or "").replace("\\", "/")).name.strip()
    return (name or FALLBACK_FILE_NAME)[:FILE_NAME_MAX_LENGTH]


def _suggested_name(file_name: str) -> str:
    # The stem keeps Save JSON's file name equal to the upload's (payments-export.json).
    return (Path(file_name).stem.strip() or FALLBACK_FILE_NAME)[:ROADMAP_NAME_MAX_LENGTH]


def _template(session: Session, template_id: str | None) -> MappingTemplateRead | None:
    """The template the user picked; a missing or malformed id is a plain 422."""
    if template_id is None:
        return None
    try:
        UUID(template_id)
    except ValueError as exc:
        raise InvalidInputError(TEMPLATE_NOT_FOUND_MESSAGE) from exc
    row = template_repository.get(session, template_id)
    if row is None:
        raise InvalidInputError(TEMPLATE_NOT_FOUND_MESSAGE)
    try:
        return MappingTemplateRead.model_validate(row)
    except ValidationError as exc:
        # A template saved before columnMap values were checked (the plan's M1 deferral).
        raise to_problem(exc) from exc


def load_template(session: Session, template_id: str | None) -> MappingTemplateRead | None:
    """The template with this id, or None for no id; an unknown id is a plain 422."""
    return _template(session, template_id)


def _status_suggestions(
    parsed: ParsedExport,
    groups: list[ColumnGroup],
    columns: list[ImportColumn],
    template: MappingTemplateRead | None,
) -> list[StatusSuggestion]:
    status_ids = {column.id for column in columns if column.suggested_field == "status"}
    status_group = next((group for group in groups if group.id in status_ids), None)
    if status_group is None:
        return []
    row_statuses = (value_for(status_group, row) or "" for row in parsed.rows)
    return map_statuses(row_statuses, template.status_map if template is not None else None)


def _kept_cells(
    parsed: ParsedExport, groups: list[ColumnGroup], listed_ids: set[str]
) -> tuple[dict[str, list[int]], Rows]:
    """Keep only the listed columns' cells; returns each group's new source indexes and rows."""
    kept_raw: list[int] = []
    new_indexes: dict[str, list[int]] = {}
    for group in groups:
        if group.id not in listed_ids:
            continue
        new_indexes[group.id] = list(
            range(len(kept_raw), len(kept_raw) + len(group.source_indexes))
        )
        kept_raw.extend(group.source_indexes)
    rows = [[row[index] for index in kept_raw] for row in parsed.rows]
    return new_indexes, rows


def _extras_json(
    extras: ExportExtras, ignored: list[str], statuses: list[StatusSuggestion]
) -> dict[str, Any]:
    # ASSUMPTION: the ignored names and status suggestions ride in `extras`, so the 0003
    # table needs no extra columns; they are only ever read back with the session.
    return {
        "sprintWindows": {
            name: [start.isoformat(), end.isoformat()]
            for name, (start, end) in extras.sprint_windows.items()
        },
        "releaseDates": {name: day.isoformat() for name, day in extras.release_dates.items()},
        "ignoredColumns": ignored,
        "statuses": [status.model_dump(mode="json", by_alias=True) for status in statuses],
    }


def create_session(
    session: Session, file_name: str | None, data: bytes, template_id: str | None
) -> ImportSessionRead:
    """Parse an upload, suggest its mapping and keep it for an hour (IMP-1, IMP-4 to IMP-9).

    Expired sessions are purged first. Raises `InvalidInputError` for empty, unreadable or
    non-Jira files and for an unknown template.
    """
    repository.purge_older_than(session, clock.now() - IMPORT_SESSION_TTL)
    template = _template(session, template_id)
    safe_name = _safe_file_name(file_name)
    parsed = _parse(safe_name, data)
    groups = merge_repeated_columns(parsed)
    suggestions = suggest_mapping(groups, template.column_map if template is not None else None)
    listed, ignored = classify(suggestions)
    statuses = _status_suggestions(parsed, groups, listed, template)
    new_indexes, rows = _kept_cells(parsed, groups, {column.id for column in listed})
    row = ImportSession(
        id=str(uuid4()),
        file_name=safe_name,
        format=parsed.format,
        encoding=parsed.encoding,
        size=len(data),
        row_count=len(parsed.rows),
        columns=[
            {
                **column.model_dump(mode="json", by_alias=True),
                SOURCE_INDEXES_KEY: new_indexes[column.id],
            }
            for column in listed
        ],
        rows=rows,
        extras=_extras_json(parsed.extras, ignored, statuses),
        template_id=template.id if template is not None else None,
    )
    repository.add(session, row)
    session.commit()
    return _to_read(row)


@dataclass(frozen=True, slots=True)
class UploadBuild:
    result: BuildResult
    # Jira statuses `status_map` doesn't cover → rows with that status, in file order.
    unmapped_statuses: dict[str, int]


def _unmapped_statuses(
    parsed: ParsedExport, groups: list[ColumnGroup], status_id: str | None, mapped: set[str]
) -> dict[str, int]:
    group = next((group for group in groups if group.id == status_id), None)
    if group is None:
        return {}
    counts: dict[str, int] = {}
    for row in parsed.rows:
        value = value_for(group, row)
        if value is not None and value not in mapped:
            counts[value] = counts.get(value, 0) + 1
    return counts


def build_from_upload(
    file_name: str | None,
    data: bytes,
    column_map: dict[str, RoadmapField] | None,
    status_map: dict[str, str],
    custom_statuses: list[CustomStatus],
    settings: SettingsRead,
    now: dt.datetime,
) -> UploadBuild:
    """Build a roadmap straight from an upload, with no Map screen (RM-15 re-sync).

    Columns are mapped by `column_map` (a template) and by name only. Raises
    `InvalidInputError` for an unreadable file or when Key or Title can't be found.
    """
    safe_name = _safe_file_name(file_name)
    parsed = _parse(safe_name, data)
    groups = merge_repeated_columns(parsed)
    suggestions = suggest_mapping(groups, column_map)
    columns = {
        column.id: column.suggested_field
        for column in suggestions
        if column.suggested_field is not None and column.confidence in RESYNC_CONFIDENCES
    }
    if not set(REQUIRED_FIELDS) <= set(columns.values()):
        raise InvalidInputError(RESYNC_MISSING_COLUMNS_MESSAGE)
    mapping = ImportMapping(
        columns=columns,
        status_map=status_map,
        custom_statuses=custom_statuses,
        name=_suggested_name(safe_name),
    )
    import_data = ImportData(
        session_id=uuid4(),
        file_name=safe_name,
        format=parsed.format,
        template_id=None,
        columns=suggestions,
        groups=groups,
        rows=parsed.rows,
        extras=parsed.extras,
    )
    status_column = next((key for key, field in columns.items() if field == "status"), None)
    return UploadBuild(
        result=build_roadmap(import_data, mapping, settings, now),
        unmapped_statuses=_unmapped_statuses(parsed, groups, status_column, set(status_map)),
    )


def _sample_bytes() -> bytes:
    return SAMPLE_PATH.read_bytes()


def create_sample_session(session: Session, template_id: str | None) -> ImportSessionRead:
    """Start an import from the bundled payments sample (the "Use the sample export" button)."""
    return create_session(session, SAMPLE_PATH.name, _sample_bytes(), template_id)


def sample_info() -> SampleExportInfo:
    """The sample's file name and issue count, for the button label."""
    parsed = _parse(SAMPLE_PATH.name, _sample_bytes())
    return SampleExportInfo(file_name=SAMPLE_PATH.name, row_count=len(parsed.rows))


# --- Reading a session ---------------------------------------------------------------------


def parse_session_id(raw: str) -> UUID:
    """The path id as a UUID; anything else is treated as an expired import (404)."""
    try:
        return UUID(raw)
    except ValueError as exc:
        raise NotFoundError(EXPIRED_MESSAGE) from exc


def _as_utc(moment: dt.datetime) -> dt.datetime:
    # SQLite drops the offset; every stored time is UTC (see app/core/clock.py).
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=dt.UTC)


def _require_live(session: Session, raw_id: str) -> ImportSession:
    row = repository.get(session, str(parse_session_id(raw_id)))
    if row is None or _as_utc(row.created_at) <= clock.now() - IMPORT_SESSION_TTL:
        raise NotFoundError(EXPIRED_MESSAGE)
    return row


def _stored_format(raw: str) -> ImportFormat:
    # The table's check constraint allows only these three values.
    return next(export_format for export_format in FORMAT_LABELS if export_format == raw)


def _stored_column(stored: dict[str, Any]) -> ImportColumn:
    return ImportColumn.model_validate(
        {key: value for key, value in stored.items() if key != SOURCE_INDEXES_KEY}
    )


def _to_read(row: ImportSession) -> ImportSessionRead:
    export_format = _stored_format(row.format)
    return ImportSessionRead.model_validate(
        {
            "id": UUID(row.id),
            "file_name": row.file_name,
            "size": row.size,
            "format": export_format,
            "format_label": FORMAT_LABELS[export_format],
            "encoding": row.encoding,
            "row_count": row.row_count,
            "columns": [_stored_column(stored) for stored in row.columns],
            "ignored_columns": row.extras.get("ignoredColumns", []),
            "statuses": row.extras.get("statuses", []),
            "template_id": row.template_id,
            "suggested_name": _suggested_name(row.file_name),
            "created_at": row.created_at,
        }
    )


def get_session(session: Session, raw_id: str) -> ImportSessionRead:
    """The session as uploaded, so a reload of the Map page works. 404 once expired."""
    return _to_read(_require_live(session, raw_id))


def _stored_extras(extras: dict[str, Any]) -> ExportExtras:
    return ExportExtras(
        sprint_windows={
            name: (dt.date.fromisoformat(start), dt.date.fromisoformat(end))
            for name, (start, end) in extras.get("sprintWindows", {}).items()
        },
        release_dates={
            name: dt.date.fromisoformat(day) for name, day in extras.get("releaseDates", {}).items()
        },
    )


def _import_data(row: ImportSession) -> ImportData:
    columns = [_stored_column(stored) for stored in row.columns]
    groups = [
        ColumnGroup(
            id=column.id,
            name=column.name,
            label=column.label,
            field_id=column.field_id,
            source_indexes=tuple(stored[SOURCE_INDEXES_KEY]),
            samples=column.samples,
            fill=column.fill,
        )
        for column, stored in zip(columns, row.columns, strict=True)
    ]
    return ImportData(
        session_id=UUID(row.id),
        file_name=row.file_name,
        format=_stored_format(row.format),
        template_id=row.template_id,
        columns=columns,
        groups=groups,
        rows=row.rows,
        extras=_stored_extras(row.extras),
    )


def _checked(mapping: ImportMapping, columns: list[ImportColumn]) -> None:
    try:
        check_mapping_columns(mapping, columns)
    except ValueError as exc:
        raise InvalidInputError(str(exc)) from exc


def _missing_required(mapping: ImportMapping) -> list[RequiredField]:
    mapped = set(mapping.columns.values())
    return [field for field in REQUIRED_FIELDS if field not in mapped]


# --- Preview -------------------------------------------------------------------------------


def _size_estimate(document: RoadmapDocument) -> int:
    # Serialised as the download route sends it (Starlette's compact JSONResponse).
    body = json.dumps(dump_document(document), ensure_ascii=False, separators=(",", ":"))
    return len(body.encode("utf-8"))


def preview(session: Session, raw_id: str, mapping: ImportMapping) -> ImportPreview:
    """Build the document commit would save, with counts and warnings. Writes nothing."""
    row = _require_live(session, raw_id)
    data = _import_data(row)
    _checked(mapping, list(data.columns))
    settings = get_settings_read(session)
    # The build reads only stored rows; end the read transaction before it runs.
    session.close()
    result = build_roadmap(data, mapping, settings, clock.now())
    document = result.document
    epics = [item for item in document.items if item.type.casefold() == EPIC_TYPE.casefold()]
    first_epics = [
        PreviewEpic(key=item.key or item.id, title=item.title, start=item.start, end=item.end)
        for item in epics[:PREVIEW_EPIC_COUNT]
    ]
    return ImportPreview(
        epics=result.epics,
        issues=result.issues,
        teams=result.teams,
        milestones=len(document.milestones),
        warnings=result.warnings,
        first_epics=first_epics,
        more_epics=max(0, result.epics - len(first_epics)),
        unmapped_columns=result.unmapped,
        missing_required=_missing_required(mapping),
        file_name=documents.file_name_for("roadmap", mapping.name),
        size_estimate_bytes=_size_estimate(document),
        document=document,
    )


# --- Commit --------------------------------------------------------------------------------


def _template_key(column: ImportColumn) -> str:
    return column.field_id or column.name


def _known_status_entries(status_map: dict[str, str]) -> dict[str, str]:
    # ASSUMPTION: custom statuses live in one roadmap, not in the template, so a template
    # only remembers Jira statuses mapped to a default status.
    return {
        jira: status_id for jira, status_id in status_map.items() if status_id in DEFAULT_STATUS_IDS
    }


def _changed_columns(
    mapping: ImportMapping, columns: list[ImportColumn]
) -> dict[str, RoadmapField]:
    changed: dict[str, RoadmapField] = {}
    for column in columns:
        field = mapping.columns.get(column.id)
        if field is not None and field != column.suggested_field:
            changed[_template_key(column)] = field
    return changed


def _changed_statuses(
    mapping: ImportMapping, suggestions: list[StatusSuggestion]
) -> dict[str, str]:
    suggested = {status.jira_status: status.status_id for status in suggestions}
    return {
        jira: status_id
        for jira, status_id in _known_status_entries(mapping.status_map).items()
        if suggested.get(jira) != status_id
    }


def _new_template(
    session: Session, mapping: ImportMapping, columns: list[ImportColumn], settings: SettingsRead
) -> MappingTemplate:
    """A template holding the whole mapping. ASSUMPTION: named "<roadmap name> mapping"."""
    base_name = mapping.name[: TEMPLATE_NAME_MAX_LENGTH - len(TEMPLATE_NAME_SUFFIX)]
    template = MappingTemplate(
        id=str(uuid4()),
        name=base_name + TEMPLATE_NAME_SUFFIX,
        jira_site=settings.jira_base_url.host if settings.jira_base_url else None,
        column_map={
            _template_key(column): mapping.columns[column.id]
            for column in columns
            if column.id in mapping.columns
        },
        status_map=_known_status_entries(mapping.status_map),
    )
    template_repository.add(session, template)
    return template


def _save_template(
    session: Session,
    row: ImportSession,
    mapping: ImportMapping,
    columns: list[ImportColumn],
    settings: SettingsRead,
) -> str:
    """Write the mapping to the session's template, or a new one; returns the template id.

    An existing template gets only the entries the user changed from the suggestions (IMP-9).
    """
    template = template_repository.get(session, row.template_id) if row.template_id else None
    if template is None:
        return _new_template(session, mapping, columns, settings).id
    suggestions = [StatusSuggestion.model_validate(item) for item in row.extras.get("statuses", [])]
    # New dicts: the JSON columns don't track in-place mutation.
    template.column_map = {**template.column_map, **_changed_columns(mapping, columns)}
    template.status_map = {**template.status_map, **_changed_statuses(mapping, suggestions)}
    return template.id


def _existing_template_id(session: Session, row: ImportSession) -> str | None:
    """The session's template id, or None when the template was deleted after the upload.

    There is no foreign key, so without this check a roadmap could link to a missing template.
    """
    if row.template_id is None:
        return None
    template = template_repository.get(session, row.template_id)
    return template.id if template else None


def commit(session: Session, raw_id: str, request: ImportCommit) -> RoadmapRead:
    """Save the roadmap, update or create the template and drop the session, in one transaction.

    Raises `InvalidInputError` until Key and Title are mapped (IMP-10).
    """
    row = _require_live(session, raw_id)
    data = _import_data(row)
    columns = list(data.columns)
    _checked(request, columns)
    if _missing_required(request):
        raise InvalidInputError(MISSING_REQUIRED_MESSAGE)
    settings = get_settings_read(session)
    if request.update_template:
        template_id: str | None = _save_template(session, row, request, columns, settings)
    else:
        template_id = _existing_template_id(session, row)
    result = build_roadmap(replace(data, template_id=template_id), request, settings, clock.now())
    repository.delete(session, row)
    # create_document commits, so the template, the deletion and the roadmap land together.
    return documents.create_document(session, result.document)
