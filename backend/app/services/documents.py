"""Roadmap and diagram documents: create, read, autosave, import, download and delete.

Every function takes the session first and has no user parameter (ADR-5).
"""

import json
from datetime import UTC, datetime
from typing import Any, Literal, overload
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.documents.defaults import BLANK_LANE_NAMES
from app.documents.errors import to_problem
from app.documents.geometry import LANE_MIN_HEIGHT, MIN_WIDTH
from app.documents.migrations import load_document
from app.documents.ops import OpError, apply_ops
from app.documents.slugs import slugify
from app.models import Document
from app.repositories import documents as repository
from app.schemas.document_api import (
    DeleteImpact,
    DiagramCreate,
    DiagramRead,
    DocumentPatch,
    DocumentSummary,
    LinkedDocument,
    PatchResult,
    RoadmapRead,
)
from app.schemas.documents import (
    CURRENT_SCHEMA_VERSION,
    DiagramDocument,
    DiagramLane,
    DiagramShape,
    DocumentKind,
    RoadmapDocument,
    dump_document,
)
from app.schemas.errors import ErrorItem
from app.services.errors import ConflictError, InvalidInputError, NotFoundError

FILE_NAME_MAX_LENGTH = 80
FILE_NAME_FALLBACK = "untitled"
FILE_EXTENSIONS: dict[DocumentKind, str] = {"roadmap": ".json", "diagram": ".swimlane.json"}
KIND_NOUNS: dict[DocumentKind, str] = {"roadmap": "roadmap", "diagram": "diagram"}
POSITION_STEP = 1000
# The prototype's `createDg` start shape: a Start circle centred in the first lane.
START_SHAPE_ID = "start"
START_SHAPE_X = 128
START_SHAPE_Y = 46

AnyDocument = RoadmapDocument | DiagramDocument
AnyRead = RoadmapRead | DiagramRead


def file_name_for(kind: DocumentKind, name: str) -> str:
    """Safe download file name derived from the document name (NF-3)."""
    slug = slugify(name)[:FILE_NAME_MAX_LENGTH].strip("-") or FILE_NAME_FALLBACK
    return slug + FILE_EXTENSIONS[kind]


def _not_found(kind: DocumentKind) -> NotFoundError:
    return NotFoundError(f"We couldn't find that {KIND_NOUNS[kind]}. It may have been deleted.")


def _conflict(kind: DocumentKind) -> ConflictError:
    return ConflictError(
        f"This {KIND_NOUNS[kind]} changed somewhere else. Reload to see the latest version."
    )


def _as_utc(moment: datetime) -> datetime:
    # SQLite drops the offset; every stored time is UTC (see app/core/clock.py).
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def _require_row(session: Session, kind: DocumentKind, document_id: UUID) -> Document:
    row = repository.get(session, kind, str(document_id))
    if row is None:
        raise _not_found(kind)
    return row


@overload
def _to_read(row: Document, document: RoadmapDocument) -> RoadmapRead: ...
@overload
def _to_read(row: Document, document: DiagramDocument) -> DiagramRead: ...
@overload
def _to_read(row: Document, document: AnyDocument) -> AnyRead: ...
def _to_read(row: Document, document: AnyDocument) -> AnyRead:
    fields: dict[str, Any] = {
        "id": UUID(row.id),
        "name": row.name,
        "file_name": file_name_for(document.kind, row.name),
        "revision": row.revision,
        "created_at": _as_utc(row.created_at),
        "updated_at": _as_utc(row.updated_at),
    }
    if isinstance(document, RoadmapDocument):
        return RoadmapRead(**fields, document=document)
    return DiagramRead(**fields, document=document)


def list_documents(session: Session, kind: DocumentKind) -> list[DocumentSummary]:
    return [
        DocumentSummary(
            id=UUID(row.id),
            kind=kind,
            name=row.name,
            file_name=file_name_for(kind, row.name),
            schema_version=row.schema_version,
            revision=row.revision,
            updated_at=_as_utc(row.updated_at),
        )
        for row in repository.list_by_kind(session, kind)
    ]


def get_roadmap(session: Session, roadmap_id: UUID) -> RoadmapRead:
    row = _require_row(session, "roadmap", roadmap_id)
    # Stored bodies go through load_document so a future schemaVersion migrates on read.
    return _to_read(row, load_document(row.body, "roadmap"))


def get_diagram(session: Session, diagram_id: UUID) -> DiagramRead:
    row = _require_row(session, "diagram", diagram_id)
    return _to_read(row, load_document(row.body, "diagram"))


@overload
def _insert(session: Session, document: RoadmapDocument) -> tuple[Document, RoadmapDocument]: ...
@overload
def _insert(session: Session, document: DiagramDocument) -> tuple[Document, DiagramDocument]: ...
@overload
def _insert(session: Session, document: AnyDocument) -> tuple[Document, AnyDocument]: ...
def _insert(session: Session, document: AnyDocument) -> tuple[Document, AnyDocument]:
    """Add a row for `document` without committing; a taken id is replaced by a new uuid4.

    Returns the row and the document as saved (with its final id).
    """
    if repository.exists(session, str(document.id)):
        document = document.model_copy(update={"id": uuid4()})
    row = Document(
        id=str(document.id),
        kind=document.kind,
        name=document.name,
        schema_version=document.schema_version,
        revision=0,
        body=dump_document(document),
    )
    repository.add(session, row)
    return row, document


@overload
def create_document(session: Session, document: RoadmapDocument) -> RoadmapRead: ...
@overload
def create_document(session: Session, document: DiagramDocument) -> DiagramRead: ...
@overload
def create_document(session: Session, document: AnyDocument) -> AnyRead: ...
def create_document(session: Session, document: AnyDocument) -> AnyRead:
    """Save a new document. Keeps its id unless that id is taken, then assigns a new one."""
    row, saved = _insert(session, document)
    session.commit()
    return _to_read(row, saved)


def _blank_lanes() -> list[DiagramLane]:
    return [
        DiagramLane(
            id=f"lane-{index + 1}",
            name=name,
            position=(index + 1) * POSITION_STEP,
            height=LANE_MIN_HEIGHT,
        )
        for index, name in enumerate(BLANK_LANE_NAMES)
    ]


def _lanes_from_roadmap(roadmap: RoadmapDocument) -> list[DiagramLane]:
    teams = sorted(roadmap.lanes, key=lambda lane: lane.position)
    return [
        DiagramLane(
            id=team.id, name=team.name, position=(index + 1) * POSITION_STEP, height=LANE_MIN_HEIGHT
        )
        for index, team in enumerate(teams)
    ]


def create_diagram(session: Session, request: DiagramCreate) -> DiagramRead:
    """Start a diagram from three blank lanes or from a roadmap's teams (SW-21).

    A diagram made from a roadmap is linked both ways, which bumps the roadmap's revision.
    """
    roadmap_row: Document | None = None
    roadmap: RoadmapDocument | None = None
    lanes = _blank_lanes()
    if request.lanes_from == "roadmap" and request.roadmap_id is not None:
        roadmap_row = _require_row(session, "roadmap", request.roadmap_id)
        roadmap = load_document(roadmap_row.body, "roadmap")
        # A roadmap without teams still gets a usable diagram.
        lanes = _lanes_from_roadmap(roadmap) or lanes
    diagram = DiagramDocument(
        schema_version=CURRENT_SCHEMA_VERSION,
        kind="diagram",
        id=uuid4(),
        name=request.name,
        version=1,
        linked_roadmap_id=roadmap.id if roadmap is not None else None,
        orientation="horizontal",
        width=MIN_WIDTH,
        lanes=lanes,
        shapes=[
            DiagramShape(
                id=START_SHAPE_ID,
                type="start",
                lane_id=lanes[0].id,
                x=START_SHAPE_X,
                y=START_SHAPE_Y,
            )
        ],
        connectors=[],
    )
    row, saved = _insert(session, diagram)
    if roadmap_row is not None and roadmap is not None:
        linked = roadmap.model_copy(
            update={"linked_diagrams": [*roadmap.linked_diagrams, saved.id]}
        )
        _save_or_conflict(session, "roadmap", roadmap_row, dump_document(linked))
    session.commit()
    return _to_read(row, saved)


def _parse_json(raw: bytes) -> object:
    try:
        return json.loads(raw)
    except (ValueError, RecursionError) as exc:
        # ValueError covers JSONDecodeError and undecodable bytes; deep nesting recurses.
        raise InvalidInputError("This file isn't valid JSON") from exc


@overload
def import_json(session: Session, kind: Literal["roadmap"], raw: bytes) -> RoadmapRead: ...
@overload
def import_json(session: Session, kind: Literal["diagram"], raw: bytes) -> DiagramRead: ...
def import_json(session: Session, kind: DocumentKind, raw: bytes) -> AnyRead:
    """Parse, migrate, validate and save an uploaded `.json` document (RM-16).

    The content is only parsed as JSON, never evaluated (NF-3).
    """
    document = load_document(_parse_json(raw), kind)
    return create_document(session, document)


def _save_or_conflict(
    session: Session, kind: DocumentKind, row: Document, body: dict[str, Any]
) -> None:
    saved = repository.update_if_revision(session, row.id, row.revision, body, str(body["name"]))
    if not saved:
        session.rollback()
        raise _conflict(kind)


def _validate(kind: DocumentKind, body: dict[str, Any]) -> AnyDocument:
    model = RoadmapDocument if kind == "roadmap" else DiagramDocument
    try:
        return model.model_validate(body)
    except ValidationError as exc:
        raise to_problem(exc) from exc


def patch_document(
    session: Session, kind: DocumentKind, document_id: UUID, patch: DocumentPatch
) -> PatchResult:
    """Apply autosave ops if `patch.base_version` is current (G-2). All or nothing."""
    row = _require_row(session, kind, document_id)
    if row.revision != patch.base_version:
        raise _conflict(kind)
    current = dump_document(load_document(row.body, kind))
    try:
        patched = apply_ops(current, patch.ops)
    except OpError as exc:
        raise InvalidInputError(
            exc.message, [ErrorItem(path=exc.path, message=exc.message)]
        ) from exc
    document = _validate(kind, patched)
    _save_or_conflict(session, kind, row, dump_document(document))
    session.commit()
    return PatchResult(
        revision=patch.base_version + 1, file_name=file_name_for(kind, document.name)
    )


def _linked_rows(session: Session, kind: DocumentKind, document_id: str) -> list[Document]:
    """Documents of the other kind that link to this one.

    Scans bodies in Python: fine at v1 sizes and keeps the SQL portable.
    """
    if kind == "roadmap":
        return [
            row
            for row in repository.list_by_kind(session, "diagram")
            if row.body.get("linkedRoadmapId") == document_id
        ]
    return [
        row
        for row in repository.list_by_kind(session, "roadmap")
        if document_id in row.body.get("linkedDiagrams", [])
    ]


def _impact_message(name: str, linked: list[LinkedDocument]) -> str:
    if not linked:
        return f"Deleting “{name}” can't be undone."
    other_kind = KIND_NOUNS[linked[0].kind]
    names = ", ".join(document.name for document in linked)
    if len(linked) == 1:
        return (
            f"Deleting “{name}” also unlinks 1 {other_kind}: {names}. "
            f"The {other_kind} itself is kept."
        )
    return (
        f"Deleting “{name}” also unlinks {len(linked)} {other_kind}s: {names}. "
        f"The {other_kind}s themselves are kept."
    )


def _other_kind(kind: DocumentKind) -> DocumentKind:
    return "diagram" if kind == "roadmap" else "roadmap"


def _impact(
    session: Session, row: Document, kind: DocumentKind
) -> tuple[DeleteImpact, list[Document]]:
    linked_rows = _linked_rows(session, kind, row.id)
    linked = [
        LinkedDocument(id=UUID(linked_row.id), kind=_other_kind(kind), name=linked_row.name)
        for linked_row in linked_rows
    ]
    impact = DeleteImpact(
        id=UUID(row.id),
        kind=kind,
        name=row.name,
        unlinks=linked,
        message=_impact_message(row.name, linked),
    )
    return impact, linked_rows


def delete_impact(session: Session, kind: DocumentKind, document_id: UUID) -> DeleteImpact:
    """What deleting this document would unlink, for the confirmation dialog."""
    impact, _ = _impact(session, _require_row(session, kind, document_id), kind)
    return impact


def _unlinked_body(body: dict[str, Any], kind: DocumentKind, deleted_id: str) -> dict[str, Any]:
    """`body` without its link to the deleted document. Always a new dict (JSON column)."""
    if kind == "roadmap":
        return {
            **body,
            "linkedDiagrams": [id_ for id_ in body["linkedDiagrams"] if id_ != deleted_id],
        }
    return {key: value for key, value in body.items() if key != "linkedRoadmapId"}


def delete_document(session: Session, kind: DocumentKind, document_id: UUID) -> DeleteImpact:
    """Delete the document and unlink (never delete) the documents that pointed to it."""
    row = _require_row(session, kind, document_id)
    impact, linked_rows = _impact(session, row, kind)
    linked_kind = _other_kind(kind)
    for linked_row in linked_rows:
        _save_or_conflict(
            session, linked_kind, linked_row, _unlinked_body(linked_row.body, linked_kind, row.id)
        )
    repository.delete(session, row)
    session.commit()
    return impact


def download(session: Session, kind: DocumentKind, document_id: UUID) -> tuple[dict[str, Any], str]:
    """The exact document JSON and the file name to save it as."""
    row = _require_row(session, kind, document_id)
    document = load_document(row.body, kind)
    return dump_document(document), file_name_for(kind, document.name)
