"""Re-sync a roadmap from a newer Jira export: upload → diff → apply (RM-15).

A diff is kept for `ROADMAP_RESYNC_TTL` with the roadmap revision it was made against, so
apply can refuse to write over edits made in between. No user parameter (ADR-5).
"""

import datetime as dt
from collections.abc import Collection
from typing import Final, Literal
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core import clock
from app.documents.defaults import DEFAULT_STATUSES
from app.documents.errors import to_problem
from app.documents.migrations import load_document
from app.importers.jira.build import FALLBACK_STATUS_ID
from app.models import RoadmapResync
from app.models.roadmap_resync import ROADMAP_RESYNC_TTL
from app.repositories import documents as document_repository
from app.repositories import mapping_templates as template_repository
from app.repositories import resyncs as repository
from app.schemas.document_api import RoadmapRead
from app.schemas.documents import RoadmapDocument, RoadmapStatus, dump_document
from app.schemas.imports import CustomStatus
from app.schemas.mapping_templates import MappingTemplateRead
from app.schemas.resync import ResyncApply, ResyncChange, RoadmapResyncRead
from app.services import documents
from app.services.errors import ConflictError, InvalidInputError, NotFoundError
from app.services.imports import build_from_upload, load_template
from app.services.resync_diff import StoredChange, apply_changes, diff_roadmaps, unchanged_count
from app.services.settings import get_settings_read

EXPIRED_MESSAGE: Final = "This re-sync has expired. Upload the export again."
STALE_MESSAGE: Final = "The roadmap changed after you uploaded this export. Upload it again."
UNKNOWN_CHANGE_MESSAGE: Final = "This re-sync has no change “{change_id}”. Upload the export again."
AUTO_WITH_TEMPLATE_MESSAGE: Final = "Choose either a mapping template or Automatic, not both."
# More keys than this are summarised as "and N more" in the PI warning.
PI_WARNING_NAMED_KEYS: Final = 3
PI_WARNING_SUFFIX: Final = "after the last PI — add one in Manage PIs"
# "template" (the default): `templateId`, else the roadmap's own template.
# "auto": no template at all; columns are matched by name only.
ResyncMapping = Literal["template", "auto"]
DEFAULT_STATUS_IDS: Final = frozenset(status.id for status in DEFAULT_STATUSES)


def _as_utc(moment: dt.datetime) -> dt.datetime:
    # SQLite drops the offset; every stored time is UTC (see app/core/clock.py).
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=dt.UTC)


def _current_document(session: Session, roadmap_id: UUID) -> tuple[int, RoadmapDocument]:
    """The roadmap's revision and document; 404 when it doesn't exist."""
    read = documents.get_roadmap(session, roadmap_id)
    return read.revision, read.document


def _saved_template(
    session: Session, mapping: ResyncMapping, template_id: str | None, document: RoadmapDocument
) -> MappingTemplateRead | None:
    """None for Automatic; else the picked template, else the roadmap's own if it still exists."""
    if mapping == "auto":
        if template_id is not None:
            raise InvalidInputError(AUTO_WITH_TEMPLATE_MESSAGE)
        return None
    if template_id is not None:
        return load_template(session, template_id)
    own_id = document.source.mapping_template_id
    if own_id is None or template_repository.get(session, own_id) is None:
        return None
    try:
        return load_template(session, own_id)
    except InvalidInputError:
        # A template saved before its values were checked: re-sync without it.
        return None


def _custom_statuses(document: RoadmapDocument) -> list[CustomStatus]:
    """The roadmap's own statuses the importer can build; ASSUMPTION: others are skipped."""
    custom: list[CustomStatus] = []
    for status in document.statuses:
        if status.id in DEFAULT_STATUS_IDS:
            continue
        try:
            custom.append(CustomStatus(id=status.id, name=status.name, color=status.color))
        except ValidationError:
            continue
    return custom


def _status_map(
    statuses: list[RoadmapStatus],
    known_ids: Collection[str],
    template: MappingTemplateRead | None,
) -> dict[str, str]:
    """The roadmap's `jiraStatuses`, with the template's entries as a fallback."""
    mapped = {
        jira: status.id
        for status in statuses
        if status.id in known_ids
        for jira in status.jira_statuses
    }
    fallback = template.status_map if template is not None else {}
    return {
        **{jira: status_id for jira, status_id in fallback.items() if status_id in known_ids},
        **mapped,
    }


def _status_warning(unmapped: dict[str, int], document: RoadmapDocument) -> list[str]:
    if not unmapped:
        return []
    count = sum(unmapped.values())
    fallback = next(
        (status.name for status in document.statuses if status.id == FALLBACK_STATUS_ID),
        "Not started",
    )
    issues = "1 issue has" if count == 1 else f"{count} issues have"
    names = ", ".join(unmapped)
    pronoun = "it shows" if count == 1 else "they show"
    return [f"{issues} a Jira status this roadmap doesn't map ({names}) — {pronoun} as {fallback}"]


def pi_overflow_warnings(keys: list[str]) -> list[str]:
    """One warning naming the items that end after the last PI, or none for no items.

    "A ends …", "A and B end …", "A, B and C end …", then "A, B and N more end …".
    """
    if not keys:
        return []
    if len(keys) == 1:
        return [f"{keys[0]} ends {PI_WARNING_SUFFIX}"]
    if len(keys) <= PI_WARNING_NAMED_KEYS:
        named = f"{', '.join(keys[:-1])} and {keys[-1]}"
    else:
        shown = PI_WARNING_NAMED_KEYS - 1
        named = f"{', '.join(keys[:shown])} and {len(keys) - shown} more"
    return [f"{named} end {PI_WARNING_SUFFIX}"]


def _pi_warnings(current: RoadmapDocument, incoming: RoadmapDocument) -> list[str]:
    """Items of the export that end after the roadmap's last PI (PIs are never extended)."""
    timeline = current.timeline
    if not timeline.pis:
        return []
    last_end = max(
        pi.start + dt.timedelta(days=pi.sprints * timeline.sprint_length_days)
        for pi in timeline.pis
    )
    return pi_overflow_warnings(
        [item.key for item in incoming.items if item.end is not None and item.end >= last_end]
    )


def create_resync(
    session: Session,
    roadmap_id: UUID,
    file_name: str | None,
    data: bytes,
    template_id: str | None,
    mapping: ResyncMapping = "template",
) -> RoadmapResyncRead:
    """Read the export with the roadmap's mapping, diff it and keep the diff for an hour.

    Raises `NotFoundError` for a missing roadmap and `InvalidInputError` for an unreadable
    file, an unknown template or a file without Key and Summary columns.
    """
    repository.purge_older_than(session, clock.now() - ROADMAP_RESYNC_TTL)
    revision, current = _current_document(session, roadmap_id)
    template = _saved_template(session, mapping, template_id, current)
    custom = _custom_statuses(current)
    known_ids = DEFAULT_STATUS_IDS | {status.id for status in custom}
    settings = get_settings_read(session)
    build = build_from_upload(
        file_name,
        data,
        template.column_map if template is not None else None,
        _status_map(current.statuses, known_ids, template),
        custom,
        settings,
        clock.now(),
    )
    incoming = build.result.document
    changes = diff_roadmaps(current, incoming)
    warnings = _status_warning(build.unmapped_statuses, current) + _pi_warnings(current, incoming)
    row = RoadmapResync(
        id=str(uuid4()),
        roadmap_id=str(roadmap_id),
        base_revision=revision,
        file_name=incoming.source.file,
        template_id=template.id if template is not None else None,
        changes=[change.model_dump(mode="json", by_alias=True) for change in changes],
        warnings=warnings,
    )
    repository.add(session, row)
    session.commit()
    return RoadmapResyncRead(
        id=UUID(row.id),
        roadmap_id=roadmap_id,
        base_revision=revision,
        file_name=row.file_name,
        template_name=template.name if template is not None else None,
        changes=[ResyncChange.model_validate(change.model_dump()) for change in changes],
        unchanged=unchanged_count(current, changes),
        warnings=warnings,
    )


def parse_resync_id(raw: str) -> UUID:
    """The path id as a UUID; anything else is treated as an expired re-sync (404)."""
    try:
        return UUID(raw)
    except ValueError as exc:
        raise NotFoundError(EXPIRED_MESSAGE) from exc


def _require_live(session: Session, roadmap_id: UUID, resync_id: UUID) -> RoadmapResync:
    row = repository.get(session, str(resync_id))
    if (
        row is None
        or row.roadmap_id != str(roadmap_id)
        or _as_utc(row.created_at) <= clock.now() - ROADMAP_RESYNC_TTL
    ):
        raise NotFoundError(EXPIRED_MESSAGE)
    return row


def apply_resync(
    session: Session, roadmap_id: UUID, resync_id: UUID, request: ResyncApply
) -> RoadmapRead:
    """Write exactly the chosen changes if the roadmap hasn't changed since the upload.

    404 for an expired or unknown re-sync, 409 for a stale revision, 422 for an unknown
    change id or a result that isn't a valid roadmap.
    """
    row = _require_live(session, roadmap_id, resync_id)
    document_row = document_repository.get(session, "roadmap", str(roadmap_id))
    if document_row is None:
        raise NotFoundError(EXPIRED_MESSAGE)
    if not row.base_revision == document_row.revision == request.base_version:
        raise ConflictError(STALE_MESSAGE)
    changes = [StoredChange.model_validate(stored) for stored in row.changes]
    known_ids = {change.id for change in changes}
    unknown = next(
        (change_id for change_id in request.change_ids if change_id not in known_ids), None
    )
    if unknown is not None:
        raise InvalidInputError(UNKNOWN_CHANGE_MESSAGE.format(change_id=unknown))
    current = load_document(document_row.body, "roadmap")
    body = apply_changes(current, changes, set(request.change_ids), row.file_name, clock.now())
    try:
        updated = RoadmapDocument.model_validate(body)
    except ValidationError as exc:
        raise to_problem(exc) from exc
    saved = document_repository.update_if_revision(
        session, document_row.id, request.base_version, dump_document(updated), updated.name
    )
    if not saved:
        session.rollback()
        raise ConflictError(STALE_MESSAGE)
    repository.delete(session, row)
    session.commit()
    return documents.get_roadmap(session, roadmap_id)
