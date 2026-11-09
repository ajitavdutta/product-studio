"""RM-15: the pure re-sync diff and apply, on docs/examples/roadmap.example.json."""

import copy
import datetime as dt
from typing import Any

from app.schemas.documents import RoadmapDocument
from app.services.resync_diff import StoredChange, apply_changes, diff_roadmaps, unchanged_count

NOW = dt.datetime(2026, 11, 6, 9, 0, tzinfo=dt.UTC)
FILE_NAME = "jira-export-payments-2026-11-20.csv"


def item(document: dict[str, Any], key: str) -> dict[str, Any]:
    return next(entry for entry in document["items"] if entry["key"] == key)


def new_item(key: str, lane_id: str) -> dict[str, Any]:
    return {
        "id": "it-" + key.lower(),
        "key": key,
        "title": "Refund webhooks",
        "type": "Epic",
        "laneId": lane_id,
        "statusId": "not-started",
        "start": "2027-01-04",
        "end": "2027-02-12",
        "progress": 0,
        "issues": {"total": 0, "done": 0, "inProgress": 0},
        "position": 1000,
    }


def diff(current: dict[str, Any], incoming: dict[str, Any]) -> list[StoredChange]:
    return diff_roadmaps(
        RoadmapDocument.model_validate(current), RoadmapDocument.model_validate(incoming)
    )


def by_id(changes: list[StoredChange], change_id: str) -> StoredChange:
    return next(change for change in changes if change.id == change_id)


def applied(
    current: dict[str, Any], changes: list[StoredChange], selected: set[str]
) -> RoadmapDocument:
    body = apply_changes(RoadmapDocument.model_validate(current), changes, selected, FILE_NAME, NOW)
    return RoadmapDocument.model_validate(body)


def test_RM_15_identical_documents_have_no_changes(roadmap_example: dict[str, Any]) -> None:
    changes = diff(roadmap_example, copy.deepcopy(roadmap_example))

    assert (changes, unchanged_count(RoadmapDocument.model_validate(roadmap_example), changes)) == (
        [],
        15,
    )


def test_RM_15_new_item_added_to_matching_lane(roadmap_example: dict[str, Any]) -> None:
    incoming = copy.deepcopy(roadmap_example)
    # Incoming lane ids come from a fresh build; the lane is matched by name, any case.
    incoming["lanes"].append(
        {"id": "checkout-2", "name": "CHECKOUT", "color": "teal", "position": 9000}
    )
    incoming["items"].append(new_item("PAY-180", "checkout-2"))
    changes = diff(roadmap_example, incoming)

    result = applied(roadmap_example, changes, {"new:PAY-180"})

    added = next(entry for entry in result.items if entry.key == "PAY-180")
    assert (
        [change.id for change in changes],
        added.lane_id,
        added.position,
        len(result.lanes),
    ) == (["new:PAY-180"], "checkout", 16000, 4)


def test_RM_15_new_team_gets_new_lane(roadmap_example: dict[str, Any]) -> None:
    incoming = copy.deepcopy(roadmap_example)
    incoming["lanes"].append({"id": "payouts", "name": "Payouts", "color": "blue", "position": 1})
    incoming["items"].append(new_item("PAY-181", "payouts"))

    result = applied(roadmap_example, diff(roadmap_example, incoming), {"new:PAY-181"})

    lane = result.lanes[-1]
    assert (lane.id, lane.name, lane.color, lane.position) == ("payouts", "Payouts", "teal", 5000)


def test_RM_15_new_item_id_is_unique(roadmap_example: dict[str, Any]) -> None:
    incoming = copy.deepcopy(roadmap_example)
    # A fresh build can reuse an id the current roadmap already gives another item.
    item(incoming, "PAY-142")["id"] = "it-rebuilt-142"
    clash = new_item("PAY-182", "checkout")
    clash["id"] = "it-pay-142"
    incoming["items"].append(clash)

    result = applied(roadmap_example, diff(roadmap_example, incoming), {"new:PAY-182"})

    assert result.items[-1].id == "it-pay-142-2"


def test_RM_15_removed_item_with_notes_is_conflict(roadmap_example: dict[str, Any]) -> None:
    incoming = copy.deepcopy(roadmap_example)
    incoming["items"] = [
        entry for entry in incoming["items"] if entry["key"] not in {"PAY-142", "PAY-161"}
    ]

    changes = diff(roadmap_example, incoming)

    assert [(change.id, change.conflict, change.conflict_reason) for change in changes] == [
        ("removed:PAY-142", True, "You added notes to this item"),
        ("removed:PAY-161", False, None),
    ]


def test_RM_15_edited_dates_are_conflict_and_kept_when_unselected(
    roadmap_example: dict[str, Any],
) -> None:
    item(roadmap_example, "PAY-155")["editedFields"] = ["start", "end"]
    incoming = copy.deepcopy(roadmap_example)
    del item(incoming, "PAY-155")["editedFields"]
    item(incoming, "PAY-155")["end"] = "2027-03-26"
    item(incoming, "PAY-161")["end"] = "2027-03-19"
    changes = diff(roadmap_example, incoming)

    result = applied(roadmap_example, changes, {"dates:PAY-161"})

    conflict = by_id(changes, "dates:PAY-155")
    kept = next(entry for entry in result.items if entry.key == "PAY-155")
    moved = next(entry for entry in result.items if entry.key == "PAY-161")
    assert (
        conflict.conflict,
        conflict.conflict_reason,
        conflict.before,
        conflict.after,
        kept.end,
        kept.edited_fields,
        moved.end,
    ) == (
        True,
        "You changed the dates by hand",
        "1 Dec 2026 – 12 Mar 2027",
        "1 Dec 2026 – 26 Mar 2027",
        dt.date(2027, 3, 12),
        ["start", "end"],
        dt.date(2027, 3, 19),
    )


def test_RM_15_applied_conflict_clears_edited_fields(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-155")["editedFields"] = ["title", "start", "end"]
    incoming = copy.deepcopy(roadmap_example)
    item(incoming, "PAY-155")["end"] = "2027-03-26"

    result = applied(roadmap_example, diff(roadmap_example, incoming), {"dates:PAY-155"})

    updated = next(entry for entry in result.items if entry.key == "PAY-155")
    assert (updated.end, updated.edited_fields) == (dt.date(2027, 3, 26), ["title"])


def test_RM_15_status_already_applied(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "RSK-031")["editedFields"] = ["statusId"]
    incoming = copy.deepcopy(roadmap_example)
    del item(incoming, "RSK-031")["editedFields"]

    changes = diff(roadmap_example, incoming)

    change = by_id(changes, "status:RSK-031")
    assert (
        change.already_applied,
        change.conflict,
        change.after,
        unchanged_count(RoadmapDocument.model_validate(roadmap_example), changes),
    ) == (True, False, "At risk", 15)


def test_RM_15_progress_and_stories_display(roadmap_example: dict[str, Any]) -> None:
    incoming = copy.deepcopy(roadmap_example)
    epic = item(incoming, "PAY-142")
    epic["stories"].append({"key": "PAY-1426", "title": "Receipts", "statusId": "not-started"})
    epic["issues"] = {"total": 5, "done": 3, "inProgress": 1}
    epic["progress"] = 70

    changes = diff(roadmap_example, incoming)

    progress = by_id(changes, "progress:PAY-142")
    stories = by_id(changes, "stories:PAY-142")
    assert (stories.before, stories.after, progress.after) == (
        "4 stories",
        "1 new story",
        "70% · 3 of 5 issues done",
    )


def test_RM_15_notes_and_milestones_never_change(roadmap_example: dict[str, Any]) -> None:
    incoming = copy.deepcopy(roadmap_example)
    del item(incoming, "PAY-142")["notes"]
    incoming["milestones"] = []
    incoming["timeline"]["pis"] = incoming["timeline"]["pis"][:1]
    item(incoming, "PAY-142")["statusId"] = "done"
    changes = diff(roadmap_example, incoming)

    result = applied(roadmap_example, changes, {change.id for change in changes})

    expected = RoadmapDocument.model_validate(roadmap_example)
    assert (
        [change.id for change in changes],
        next(entry for entry in result.items if entry.key == "PAY-142").notes,
        result.milestones,
        result.timeline,
        result.linked_diagrams,
    ) == (
        ["status:PAY-142"],
        expected.items[0].notes,
        expected.milestones,
        expected.timeline,
        expected.linked_diagrams,
    )


def test_RM_15_apply_sets_synced_at_and_file(roadmap_example: dict[str, Any]) -> None:
    result = applied(roadmap_example, [], set())

    assert (result.source.file, result.source.synced_at, result.source.imported_at) == (
        FILE_NAME,
        NOW,
        RoadmapDocument.model_validate(roadmap_example).source.imported_at,
    )
