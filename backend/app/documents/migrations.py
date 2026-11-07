"""schemaVersion migrations (ADR-4). The only place documents change shape between versions.

`MIGRATIONS[N]` takes a raw version-N document and returns version N+1. Steps are pure: they
deep-copy their input and never mutate it. `load_document` runs them on read and on import.
"""

import copy
from collections.abc import Callable
from typing import Any, Literal, overload
from uuid import NAMESPACE_URL, uuid5

from pydantic import ValidationError

from app.documents.defaults import DEFAULT_STATUSES, TEAM_COLOR_ORDER
from app.documents.errors import to_problem
from app.documents.slugs import slugify
from app.schemas.documents import (
    CURRENT_SCHEMA_VERSION,
    DiagramDocument,
    DocumentKind,
    RoadmapDocument,
    dump_document,
)
from app.services.errors import InvalidInputError

NOT_A_DOCUMENT = "This file isn't a Product Studio document"
NEWER_VERSION = "This file was made by a newer version of Product Studio"
OLD_FORMAT = "This file uses an old format Product Studio can't read"
KIND_LABELS: dict[DocumentKind, str] = {"roadmap": "a roadmap", "diagram": "a swimlane diagram"}

V0_ID_PREFIX = "product-studio:v0:"
POSITION_STEP = 1000
FALLBACK_STATUS_ID = "not-started"

RawDocument = dict[str, Any]


def migrate_roadmap_v0_to_v1(raw: RawDocument) -> RawDocument:
    """Convert the prototype's pre-contract roadmap (string lanes, no ids) to schema version 1."""
    old = copy.deepcopy(raw)
    source = {key: value for key, value in old["source"].items() if key != "mappingTemplate"}
    status_ids_by_name = {status.name.lower(): status.id for status in DEFAULT_STATUSES}
    return {
        "schemaVersion": 1,
        "kind": "roadmap",
        "id": str(uuid5(NAMESPACE_URL, f"{V0_ID_PREFIX}{old['name']}:{old['source']['file']}")),
        "name": old["name"],
        "source": source,
        "timeline": {
            **old["timeline"],
            "pis": [
                {"id": f"pi-{index + 1}", **pi} for index, pi in enumerate(old["timeline"]["pis"])
            ],
        },
        "lanes": [
            {
                "id": slugify(name),
                "name": name,
                "color": TEAM_COLOR_ORDER[index % len(TEAM_COLOR_ORDER)],
                "position": (index + 1) * POSITION_STEP,
            }
            for index, name in enumerate(old["lanes"])
        ],
        "statuses": [dump_document(status) for status in DEFAULT_STATUSES],
        "items": [
            _migrate_v0_item(item, index, status_ids_by_name)
            for index, item in enumerate(old["items"])
        ],
        "milestones": [
            {
                **milestone,
                "id": f"ms-{slugify(milestone['name'])}",
                "kind": milestone.get("kind", "milestone"),
            }
            for milestone in old.get("milestones", [])
        ],
        # v0 linked diagrams by file name, which can't be resolved to ids.
        "linkedDiagrams": [],
    }


def _migrate_v0_item(
    item: RawDocument, index: int, status_ids_by_name: dict[str, str]
) -> RawDocument:
    total = int(item["issues"])
    progress = int(item["progress"])
    # v0 kept only a count; derive `done` so the derived progress matches the stored one.
    # Integer form of floor(total * progress / 100 + 0.5), free of float rounding.
    done = (total * progress * 2 + 100) // 200
    migrated: RawDocument = {
        "id": f"it-{slugify(item['key'])}",
        "key": item["key"],
        "title": item["title"],
        "type": "Epic",
        "laneId": slugify(item["lane"]),
        "statusId": status_ids_by_name.get(str(item.get("status", "")).lower(), FALLBACK_STATUS_ID),
        "progress": progress,
        "issues": {"total": total, "done": done, "inProgress": 0},
        "position": (index + 1) * POSITION_STEP,
    }
    for date_field in ("start", "end"):
        if date_field in item:
            migrated[date_field] = item[date_field]
    return migrated


MIGRATIONS: dict[int, Callable[[RawDocument], RawDocument]] = {0: migrate_roadmap_v0_to_v1}


def _is_v0_shape(raw: RawDocument) -> bool:
    lanes = raw.get("lanes")
    return (
        "kind" not in raw
        and isinstance(lanes, list)
        and any(isinstance(lane, str) for lane in lanes)
    )


def detect_version(raw: RawDocument) -> int:
    """The document's schema version.

    `docs/examples/roadmap.v0.json` says `"schemaVersion": 1` but has the prototype's
    pre-contract shape, so a document with no `kind` and string lanes is v0 whatever it says.
    """
    if _is_v0_shape(raw):
        return 0
    version = raw.get("schemaVersion")
    # bool is an int subclass; `true` is not a version.
    if not isinstance(version, int) or isinstance(version, bool) or version < 0:
        raise InvalidInputError(NOT_A_DOCUMENT)
    return version


def _detect_kind(raw: RawDocument, version: int) -> DocumentKind:
    if version == 0:
        # Version 0 only ever existed for roadmaps, in the prototype.
        if raw.get("kind", "roadmap") != "roadmap":
            raise InvalidInputError(OLD_FORMAT)
        return "roadmap"
    kind = raw.get("kind")
    if kind == "roadmap":
        return "roadmap"
    if kind == "diagram":
        return "diagram"
    raise InvalidInputError(NOT_A_DOCUMENT)


def _migrate(raw: RawDocument, version: int) -> RawDocument:
    migrated = raw
    for step_version in range(version, CURRENT_SCHEMA_VERSION):
        step = MIGRATIONS.get(step_version)
        if step is None:
            raise InvalidInputError(OLD_FORMAT)
        try:
            migrated = step(migrated)
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            # Old files are untrusted input; a malformed one must fail with a plain message.
            raise InvalidInputError(OLD_FORMAT) from exc
    return migrated


@overload
def load_document(raw: object, expected_kind: Literal["roadmap"]) -> RoadmapDocument: ...
@overload
def load_document(raw: object, expected_kind: Literal["diagram"]) -> DiagramDocument: ...
@overload
def load_document(
    raw: object, expected_kind: DocumentKind
) -> RoadmapDocument | DiagramDocument: ...
def load_document(raw: object, expected_kind: DocumentKind) -> RoadmapDocument | DiagramDocument:
    """Migrate a parsed JSON document to the current version and validate it.

    Raises `InvalidInputError` with a plain-language `detail` for anything it can't load.
    """
    if not isinstance(raw, dict):
        raise InvalidInputError(NOT_A_DOCUMENT)
    version = detect_version(raw)
    if version > CURRENT_SCHEMA_VERSION:
        raise InvalidInputError(NEWER_VERSION)
    kind = _detect_kind(raw, version)
    if kind != expected_kind:
        raise InvalidInputError(
            f"This file is {KIND_LABELS[kind]}, not {KIND_LABELS[expected_kind]}"
        )
    migrated = _migrate(raw, version)
    model = RoadmapDocument if kind == "roadmap" else DiagramDocument
    try:
        return model.model_validate(migrated)
    except ValidationError as exc:
        raise to_problem(exc) from exc
