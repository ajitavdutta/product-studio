from datetime import date
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from app.core import clock
from app.schemas.document_api import DiagramCreate, DocumentOp, DocumentPatch
from app.schemas.documents import DiagramDocument, RoadmapDocument
from app.services import documents as service
from app.services.errors import ConflictError, InvalidInputError, NotFoundError

ROADMAP_ID = UUID("0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31")
DIAGRAM_ID = UUID("5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50")


@pytest.fixture
def roadmap(roadmap_example: dict[str, Any]) -> RoadmapDocument:
    return RoadmapDocument.model_validate(roadmap_example)


@pytest.fixture
def diagram(diagram_example: dict[str, Any]) -> DiagramDocument:
    return DiagramDocument.model_validate(diagram_example)


def rename(revision: int, name: str) -> DocumentPatch:
    return DocumentPatch(
        base_version=revision, ops=[DocumentOp(op="set", path="/name", value=name)]
    )


def test_G_2_patch_increments_revision(db_session: Session, roadmap: RoadmapDocument) -> None:
    service.create_document(db_session, roadmap)

    result = service.patch_document(db_session, "roadmap", ROADMAP_ID, rename(0, "Renamed"))

    assert (result.revision, service.get_roadmap(db_session, ROADMAP_ID).revision) == (1, 1)


def test_G_2_stale_base_version_conflicts(db_session: Session, roadmap: RoadmapDocument) -> None:
    service.create_document(db_session, roadmap)
    service.patch_document(db_session, "roadmap", ROADMAP_ID, rename(0, "First"))

    with pytest.raises(ConflictError, match="changed somewhere else"):
        service.patch_document(db_session, "roadmap", ROADMAP_ID, rename(0, "Second"))


def test_G_2_invalid_op_rolls_back_and_keeps_revision(
    db_session: Session, roadmap: RoadmapDocument
) -> None:
    service.create_document(db_session, roadmap)
    patch = DocumentPatch(
        base_version=0,
        ops=[
            DocumentOp(op="set", path="/name", value="Renamed"),
            DocumentOp(op="set", path="/items/it-pay-142/end", value="2026-01-01"),
        ],
    )

    with pytest.raises(InvalidInputError, match="end date before its start date"):
        service.patch_document(db_session, "roadmap", ROADMAP_ID, patch)

    saved = service.get_roadmap(db_session, ROADMAP_ID)
    assert (saved.revision, saved.name) == (0, "Payments Platform H1 2027")


def test_G_2_missing_op_target_lists_its_path(
    db_session: Session, roadmap: RoadmapDocument
) -> None:
    service.create_document(db_session, roadmap)
    patch = DocumentPatch(base_version=0, ops=[DocumentOp(op="remove", path="/items/it-nope")])

    with pytest.raises(InvalidInputError) as caught:
        service.patch_document(db_session, "roadmap", ROADMAP_ID, patch)

    assert caught.value.errors is not None and caught.value.errors[0].path == "/items/it-nope"


def test_G_2_rename_updates_name_column_and_file_name(
    db_session: Session, roadmap: RoadmapDocument
) -> None:
    service.create_document(db_session, roadmap)

    result = service.patch_document(db_session, "roadmap", ROADMAP_ID, rename(0, "Q3 Plan"))

    summary = service.list_documents(db_session, "roadmap")[0]
    assert (result.file_name, summary.name, summary.file_name) == (
        "q3-plan.json",
        "Q3 Plan",
        "q3-plan.json",
    )


def test_G_2_patch_moves_updated_at(db_session: Session, roadmap: RoadmapDocument) -> None:
    service.create_document(db_session, roadmap)
    clock.freeze(date(2026, 11, 9))

    service.patch_document(db_session, "roadmap", ROADMAP_ID, rename(0, "Later"))

    assert service.get_roadmap(db_session, ROADMAP_ID).updated_at.date() == date(2026, 11, 9)


def test_G_2_missing_document_is_not_found(db_session: Session) -> None:
    with pytest.raises(NotFoundError, match="We couldn't find that roadmap"):
        service.patch_document(db_session, "roadmap", ROADMAP_ID, rename(0, "x"))


def test_SW_21_blank_diagram_has_three_lanes_and_start(db_session: Session) -> None:
    created = service.create_diagram(db_session, DiagramCreate())

    document = created.document
    assert (
        document.name,
        [(lane.id, lane.name, lane.height) for lane in document.lanes],
        [(shape.id, shape.type, shape.lane_id, shape.x, shape.y) for shape in document.shapes],
        document.width,
    ) == (
        "Untitled workflow",
        [("lane-1", "Lane 1", 132), ("lane-2", "Lane 2", 132), ("lane-3", "Lane 3", 132)],
        [("start", "start", "lane-1", 128, 46)],
        1016,
    )


def test_SW_21_diagram_from_roadmap_uses_its_teams_and_links_both_ways(
    db_session: Session, roadmap: RoadmapDocument
) -> None:
    service.create_document(db_session, roadmap)

    created = service.create_diagram(
        db_session, DiagramCreate(name="Checkout flow", lanes_from="roadmap", roadmap_id=ROADMAP_ID)
    )

    linked_roadmap = service.get_roadmap(db_session, ROADMAP_ID)
    assert (
        [lane.name for lane in created.document.lanes],
        created.document.linked_roadmap_id,
        created.id in linked_roadmap.document.linked_diagrams,
        linked_roadmap.revision,
    ) == (
        ["Checkout", "Risk & Fraud", "Platform", "Merchant Experience"],
        ROADMAP_ID,
        True,
        1,
    )


def test_SW_21_diagram_from_missing_roadmap_is_not_found(db_session: Session) -> None:
    request = DiagramCreate(lanes_from="roadmap", roadmap_id=ROADMAP_ID)

    with pytest.raises(NotFoundError):
        service.create_diagram(db_session, request)


def test_delete_roadmap_unlinks_diagram_and_names_it(
    db_session: Session, roadmap: RoadmapDocument, diagram: DiagramDocument
) -> None:
    service.create_document(db_session, roadmap)
    service.create_document(db_session, diagram)

    impact = service.delete_document(db_session, "roadmap", ROADMAP_ID)

    unlinked = service.get_diagram(db_session, DIAGRAM_ID)
    assert (impact.message, unlinked.document.linked_roadmap_id, unlinked.revision) == (
        "Deleting “Payments Platform H1 2027” also unlinks 1 diagram: Customer refund flow. "
        "The diagram itself is kept.",
        None,
        1,
    )


def test_delete_diagram_removes_it_from_linked_diagrams(
    db_session: Session, roadmap: RoadmapDocument, diagram: DiagramDocument
) -> None:
    service.create_document(db_session, roadmap)
    service.create_document(db_session, diagram)

    service.delete_document(db_session, "diagram", DIAGRAM_ID)

    assert service.get_roadmap(db_session, ROADMAP_ID).document.linked_diagrams == []


def test_delete_removes_the_document(db_session: Session, roadmap: RoadmapDocument) -> None:
    service.create_document(db_session, roadmap)

    service.delete_document(db_session, "roadmap", ROADMAP_ID)

    with pytest.raises(NotFoundError):
        service.get_roadmap(db_session, ROADMAP_ID)


def test_delete_impact_without_links_says_it_cannot_be_undone(
    db_session: Session, roadmap: RoadmapDocument
) -> None:
    service.create_document(db_session, roadmap)

    impact = service.delete_impact(db_session, "roadmap", ROADMAP_ID)

    assert (impact.unlinks, impact.message) == (
        [],
        "Deleting “Payments Platform H1 2027” can't be undone.",
    )


def test_create_keeps_id_or_assigns_new_when_taken(
    db_session: Session, roadmap: RoadmapDocument
) -> None:
    first = service.create_document(db_session, roadmap)
    second = service.create_document(db_session, roadmap)

    assert (first.id, second.id != ROADMAP_ID, second.document.id == second.id) == (
        ROADMAP_ID,
        True,
        True,
    )


def test_list_orders_most_recent_first(db_session: Session, roadmap: RoadmapDocument) -> None:
    service.create_document(db_session, roadmap)
    clock.freeze(date(2026, 11, 8))
    newer = service.create_document(db_session, roadmap.model_copy(update={"name": "Newer"}))

    names = [summary.name for summary in service.list_documents(db_session, "roadmap")]

    assert (names, newer.id != ROADMAP_ID) == (["Newer", "Payments Platform H1 2027"], True)


def test_RM_16_import_json_rejects_invalid_json(db_session: Session) -> None:
    with pytest.raises(InvalidInputError, match="This file isn't valid JSON"):
        service.import_json(db_session, "roadmap", b"{not json")


def test_RM_16_import_json_rejects_undecodable_bytes(db_session: Session) -> None:
    with pytest.raises(InvalidInputError, match="This file isn't valid JSON"):
        service.import_json(db_session, "roadmap", b"\xff\xfe\xfa")


def test_download_returns_document_and_file_name(
    db_session: Session, roadmap: RoadmapDocument, roadmap_example: dict[str, Any]
) -> None:
    service.create_document(db_session, roadmap)

    assert service.download(db_session, "roadmap", ROADMAP_ID) == (
        roadmap_example,
        "payments-platform-h1-2027.json",
    )


@pytest.mark.parametrize(
    ("kind", "name", "expected"),
    [
        ("roadmap", "../Q3: Plan/??", "q3-plan.json"),
        ("roadmap", "", "untitled.json"),
        ("diagram", "???", "untitled.swimlane.json"),
        ("roadmap", "a" * 300, "a" * 80 + ".json"),
        ("diagram", "Customer refund flow", "customer-refund-flow.swimlane.json"),
    ],
    ids=["traversal", "empty", "only-symbols", "300-chars", "diagram"],
)
def test_NF_3_file_name_is_sanitised(kind: Any, name: str, expected: str) -> None:
    assert service.file_name_for(kind, name) == expected
