"""Diff a roadmap against one rebuilt from a newer Jira export, and apply chosen changes (RM-15).

Pure: no database and no clock; the caller passes `now`. Items are matched by Jira `key`.
Re-sync never touches notes, milestones, the timeline, linked diagrams or unselected items,
and a field the PM edited by hand (`editedFields`) is a conflict, unchecked in the UI.
"""

import datetime as dt
from collections.abc import Collection, Iterable
from typing import Any, Final

from app.documents.defaults import TEAM_COLOR_ORDER
from app.documents.slugs import slugify
from app.schemas.documents import (
    EditableField,
    IssueCounts,
    RoadmapDocument,
    RoadmapItem,
    dump_document,
)
from app.schemas.resync import ResyncChange, ResyncChangeKind

POSITION_STEP: Final = 1000
UNSCHEDULED_LABEL: Final = "Unscheduled"
# The editable fields each change kind writes; applying one clears them from editedFields.
FIELDS_BY_KIND: Final[dict[ResyncChangeKind, tuple[EditableField, ...]]] = {
    "dates": ("start", "end"),
    "status": ("statusId",),
}
CONFLICT_REASONS: Final[dict[ResyncChangeKind, str]] = {
    "dates": "You changed the dates by hand",
    "status": "You changed the status by hand",
}
REMOVED_WITH_NOTES_REASON: Final = "You added notes to this item"
REMOVED_WITH_EDITS_REASON: Final = "You edited this item by hand"


class StoredChange(ResyncChange):
    """A change as stored in `roadmap_resyncs.changes`: the public part plus what apply writes."""

    payload: dict[str, Any]


# --- Display strings -----------------------------------------------------------------------


def _day(date: dt.date) -> str:
    return f"{date.day} {date:%b %Y}"


def _dates_text(item: RoadmapItem) -> str:
    if item.start is None or item.end is None:
        return UNSCHEDULED_LABEL
    return f"{_day(item.start)} – {_day(item.end)}"


def _plural(count: int, singular: str, plural: str) -> str:
    return f"{count} {singular if count == 1 else plural}"


def _progress_text(progress: int, issues: IssueCounts) -> str:
    if issues.total == 0:
        return f"{progress}%"
    return f"{progress}% · {issues.done} of {_plural(issues.total, 'issue', 'issues')} done"


def _stories_texts(current: RoadmapItem, incoming: RoadmapItem) -> tuple[str, str]:
    before = current.stories or []
    after = incoming.stories or []
    before_keys = {story.key for story in before}
    added = [story for story in after if story.key not in before_keys]
    if added and len(after) == len(before) + len(added):
        return _plural(len(before), "story", "stories"), (
            f"{len(added)} new {'story' if len(added) == 1 else 'stories'}"
        )
    if len(before) != len(after):
        return _plural(len(before), "story", "stories"), _plural(len(after), "story", "stories")
    updated = sum(1 for old, new in zip(before, after, strict=True) if old != new)
    return _plural(len(before), "story", "stories"), f"{updated} updated"


# --- Diff ----------------------------------------------------------------------------------


def _change(
    kind: ResyncChangeKind,
    item: RoadmapItem,
    before: str | None,
    after: str | None,
    payload: dict[str, Any],
    *,
    conflict_reason: str | None = None,
    already_applied: bool = False,
) -> StoredChange:
    return StoredChange(
        id=f"{kind}:{item.key}",
        kind=kind,
        item_key=item.key,
        item_title=item.title,
        before=before,
        after=after,
        conflict=conflict_reason is not None,
        conflict_reason=conflict_reason,
        already_applied=already_applied,
        payload=payload,
    )


def _edited_change(
    kind: ResyncChangeKind,
    current: RoadmapItem,
    differs: bool,
    texts: tuple[str, str],
    payload: dict[str, Any],
) -> StoredChange | None:
    """A dates or status change; hand-edited fields make it a conflict or "already applied"."""
    edited = bool(set(FIELDS_BY_KIND[kind]) & set(current.edited_fields or []))
    if not differs:
        # The PM's hand edit now matches Jira: listed for information, never selectable.
        if not edited:
            return None
        return _change(kind, current, texts[0], texts[1], payload, already_applied=True)
    reason = CONFLICT_REASONS[kind] if edited else None
    return _change(kind, current, texts[0], texts[1], payload, conflict_reason=reason)


def _status_name(document: RoadmapDocument, status_id: str) -> str:
    return next((status.name for status in document.statuses if status.id == status_id), status_id)


def _item_changes(
    current_doc: RoadmapDocument, current: RoadmapItem, incoming: RoadmapItem
) -> list[StoredChange]:
    changes: list[StoredChange | None] = [
        _edited_change(
            "dates",
            current,
            (current.start, current.end) != (incoming.start, incoming.end),
            (_dates_text(current), _dates_text(incoming)),
            {"start": _iso(incoming.start), "end": _iso(incoming.end)},
        ),
        _edited_change(
            "status",
            current,
            current.status_id != incoming.status_id,
            (
                _status_name(current_doc, current.status_id),
                _status_name(current_doc, incoming.status_id),
            ),
            {"statusId": incoming.status_id},
        ),
    ]
    if (current.progress, current.issues) != (incoming.progress, incoming.issues):
        changes.append(
            _change(
                "progress",
                current,
                _progress_text(current.progress, current.issues),
                _progress_text(incoming.progress, incoming.issues),
                {"progress": incoming.progress, "issues": dump_document(incoming.issues)},
            )
        )
    if (current.stories or []) != (incoming.stories or []):
        before, after = _stories_texts(current, incoming)
        stories = [dump_document(story) for story in incoming.stories or []]
        changes.append(_change("stories", current, before, after, {"stories": stories or None}))
    return [change for change in changes if change is not None]


def _iso(date: dt.date | None) -> str | None:
    return date.isoformat() if date is not None else None


def _unique_id(candidate: str, taken: set[str]) -> str:
    unique = candidate
    suffix = 2
    while unique in taken:
        unique = f"{candidate}-{suffix}"
        suffix += 1
    taken.add(unique)
    return unique


def _new_change(
    incoming_doc: RoadmapDocument, item: RoadmapItem, item_id: str, position: float
) -> StoredChange:
    lane_name = next(lane.name for lane in incoming_doc.lanes if lane.id == item.lane_id)
    placed = item.model_copy(update={"id": item_id, "position": position})
    return _change(
        "new",
        item,
        None,
        f"{lane_name} · {_dates_text(item)}",
        {"item": dump_document(placed), "lane": {"name": lane_name}},
    )


def _removed_change(item: RoadmapItem) -> StoredChange:
    reason = None
    if item.notes:
        reason = REMOVED_WITH_NOTES_REASON
    elif item.edited_fields:
        reason = REMOVED_WITH_EDITS_REASON
    return _change("removed", item, _dates_text(item), None, {}, conflict_reason=reason)


def diff_roadmaps(current: RoadmapDocument, incoming: RoadmapDocument) -> list[StoredChange]:
    """Changes in item order: current items first (by key), then new incoming ones.

    Title and team changes in Jira are not diffed (plan ASSUMPTION 10).
    """
    incoming_by_key = {item.key: item for item in incoming.items}
    current_keys = {item.key for item in current.items}
    changes: list[StoredChange] = []
    for item in current.items:
        match = incoming_by_key.get(item.key)
        if match is None:
            changes.append(_removed_change(item))
        else:
            changes.extend(_item_changes(current, item, match))
    taken_ids = {item.id for item in current.items}
    position = max((item.position for item in current.items), default=0)
    for item in incoming.items:
        if item.key in current_keys:
            continue
        position += POSITION_STEP
        item_id = _unique_id(item.id, taken_ids)
        changes.append(_new_change(incoming, item, item_id, position))
    return changes


def unchanged_count(current: RoadmapDocument, changes: Iterable[StoredChange]) -> int:
    """Current items with no change to apply (an "already applied" one doesn't count)."""
    changed_keys = {change.item_key for change in changes if not change.already_applied}
    return sum(1 for item in current.items if item.key not in changed_keys)


# --- Apply ---------------------------------------------------------------------------------


def _lane_id_for(body: dict[str, Any], lane_name: str) -> str:
    """The lane named `lane_name` (any case), added at the end with the next colour if new."""
    lanes: list[dict[str, Any]] = body["lanes"]
    for lane in lanes:
        if str(lane["name"]).casefold() == lane_name.casefold():
            return str(lane["id"])
    lane_id = _unique_id(slugify(lane_name) or "team", {str(lane["id"]) for lane in lanes})
    last_position = max((float(lane["position"]) for lane in lanes), default=0)
    lanes.append(
        {
            "id": lane_id,
            "name": lane_name,
            "color": TEAM_COLOR_ORDER[len(lanes) % len(TEAM_COLOR_ORDER)],
            "position": last_position + POSITION_STEP,
        }
    )
    return lane_id


def _clear_edited(item: dict[str, Any], fields: Collection[str]) -> None:
    remaining = [field for field in item.get("editedFields", []) if field not in fields]
    if remaining:
        item["editedFields"] = remaining
    else:
        item.pop("editedFields", None)


def _set_or_drop(item: dict[str, Any], key: str, value: object) -> None:
    # Absent, not null, keeps the document lossless (exclude_none).
    if value is None:
        item.pop(key, None)
    else:
        item[key] = value


def _apply_one(body: dict[str, Any], change: StoredChange) -> None:
    items: list[dict[str, Any]] = body["items"]
    if change.kind == "new":
        item = dict(change.payload["item"])
        item["laneId"] = _lane_id_for(body, str(change.payload["lane"]["name"]))
        items.append(item)
        return
    if change.kind == "removed":
        body["items"] = [item for item in items if item["key"] != change.item_key]
        return
    target = next(item for item in items if item["key"] == change.item_key)
    for key, value in change.payload.items():
        _set_or_drop(target, key, value)
    _clear_edited(target, FIELDS_BY_KIND.get(change.kind, ()))


def apply_changes(
    current: RoadmapDocument,
    changes: Iterable[StoredChange],
    selected_ids: Collection[str],
    file_name: str,
    now: dt.datetime,
) -> dict[str, Any]:
    """The current document's JSON with the selected changes written, ready to validate.

    Applies exactly `selected_ids`, in diff order, and records the file and sync time.
    """
    body = dump_document(current)
    for change in changes:
        if change.id in selected_ids:
            _apply_one(body, change)
    body["source"] = {**body["source"], "file": file_name, "syncedAt": now.isoformat()}
    return body
