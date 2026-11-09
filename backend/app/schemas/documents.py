"""Roadmap and diagram documents: the JSON contract described in `docs/data-model.md`.

Lossless rule: every document field is either required or defaults to `None`, and documents
are always serialised with `dump_document` (`by_alias=True, exclude_none=True`). A valid file
therefore dumps back to the same JSON, which keeps Save JSON → Open JSON lossless (ADR-4).
A field with any other default would break that; the round-trip tests catch it.

Validator messages are plain sentences shown to the user as they are.
"""

import datetime as dt
from collections import Counter
from collections.abc import Iterable
from itertools import pairwise
from typing import Any, Final, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from app.documents.geometry import LANE_MIN_HEIGHT, MIN_WIDTH, bad_connector_ids

CURRENT_SCHEMA_VERSION = 1
MILESTONE_NAME_MAX_LENGTH: Final = 120
# Same bounds as the editor's date inputs (frontend/src/lib/roadmap/milestones.ts); they stop a
# mistyped year such as 0007 from being saved.
DATE_MIN: Final = dt.date(1900, 1, 1)
DATE_MAX: Final = dt.date(2999, 12, 31)

DocumentKind = Literal["roadmap", "diagram"]

TeamColor = Literal["blue", "deepOrange", "blueGrey", "purple", "teal", "brown"]
ShapeType = Literal["start", "end", "task", "decision", "sub", "doc", "data", "note"]
Side = Literal["l", "r", "t", "b"]
DiagramFill = Literal["white", "blue", "green", "amber", "purple"]
EditableField = Literal["title", "statusId", "laneId", "start", "end"]


class DocumentModel(BaseModel):
    """Base for every document part: camelCase on the wire, unknown keys rejected."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


def dump_document(document: DocumentModel) -> dict[str, Any]:
    """Serialise a document (or part) to its exact JSON form."""
    return document.model_dump(mode="json", by_alias=True, exclude_none=True)


def _first_duplicate(ids: Iterable[str]) -> str | None:
    counts = Counter(ids)
    return next((value for value, count in counts.items() if count > 1), None)


def _require_unique(ids: Iterable[str], plural: str) -> None:
    duplicate = _first_duplicate(ids)
    if duplicate is not None:
        raise ValueError(f"Two {plural} share the id {duplicate}")


def _check_schema_version(value: int) -> int:
    if value != CURRENT_SCHEMA_VERSION:
        raise ValueError(f"This document must be schema version {CURRENT_SCHEMA_VERSION}")
    return value


# --- Roadmap ---------------------------------------------------------------------------


class RoadmapSource(DocumentModel):
    type: Literal["jira-csv", "jira-json", "jira-xml", "json"] = Field(
        ..., description="What the roadmap was built from"
    )
    file: str = Field(..., description="Name of the imported file")
    imported_at: dt.datetime = Field(..., description="When the file was imported")
    mapping_template_id: str | None = Field(None, description="Mapping template used, if any")
    synced_at: dt.datetime | None = Field(None, description="Last re-sync from Jira")


class ProgramIncrement(DocumentModel):
    id: str
    name: str
    start: dt.date
    sprints: int = Field(..., ge=1, le=12, description="Sprints in this PI, including the IP")
    ip_sprint: bool = Field(..., description="Whether the last sprint is an IP sprint")
    sprint_names: list[str] | None = Field(None, description="Custom sprint names, in order")


class RoadmapTimeline(DocumentModel):
    start: dt.date
    sprint_length_days: int = Field(..., ge=1)
    pis: list[ProgramIncrement]


class RoadmapLane(DocumentModel):
    id: str
    name: str
    color: TeamColor = Field(..., description="A `team` key of shared/design-tokens.json")
    position: float = Field(..., description="Float ordering key")


class RoadmapStatus(DocumentModel):
    id: str
    name: str
    color: str = Field(..., description="Status colour key")
    jira_statuses: list[str] = Field(..., description="Jira statuses that map to this one")


class IssueCounts(DocumentModel):
    total: int = Field(..., ge=0)
    done: int = Field(..., ge=0)
    in_progress: int = Field(..., ge=0)

    @model_validator(mode="after")
    def _counts_fit_total(self) -> Self:
        if self.done + self.in_progress > self.total:
            raise ValueError("Done and in-progress issues can't add up to more than the total")
        return self


class Story(DocumentModel):
    key: str
    title: str
    status_id: str


class RoadmapItem(DocumentModel):
    id: str
    key: str = Field(..., description="Jira key, e.g. PAY-142")
    title: str
    type: str = Field(..., description="Jira issue type, e.g. Epic")
    lane_id: str
    status_id: str
    start: dt.date | None = Field(None, description="Inclusive start; absent when unscheduled")
    end: dt.date | None = Field(None, description="Inclusive end; absent when unscheduled")
    progress: int = Field(..., ge=0, le=100)
    issues: IssueCounts
    stories: list[Story] | None = None
    notes: str | None = None
    jira_url: str | None = None
    position: float
    edited_fields: list[EditableField] | None = Field(
        None, description="Fields the PM changed by hand; re-sync keeps them"
    )

    @model_validator(mode="after")
    def _edited_fields_unique(self) -> Self:
        if _first_duplicate(self.edited_fields or []) is not None:
            raise ValueError(f"Item {self.key} lists an edited field twice")
        return self


class Milestone(DocumentModel):
    id: str
    name: str = Field(..., min_length=1, max_length=MILESTONE_NAME_MAX_LENGTH)
    kind: Literal["milestone", "freeze"]
    date: dt.date | None = Field(None, description="Required for a milestone")
    start: dt.date | None = Field(None, description="Required for a freeze")
    end: dt.date | None = Field(None, description="Required for a freeze")

    @field_validator("name", mode="before")
    @classmethod
    def _name_given(cls, value: object) -> object:
        # Whitespace-only counts as blank; the stored name keeps its spacing (lossless rule).
        if isinstance(value, str) and not value.strip():
            raise ValueError("Give the milestone a name")
        return value


class RoadmapDocument(DocumentModel):
    schema_version: int
    kind: Literal["roadmap"]
    id: UUID
    name: str = Field(..., min_length=1, max_length=200)
    source: RoadmapSource
    timeline: RoadmapTimeline
    lanes: list[RoadmapLane]
    statuses: list[RoadmapStatus]
    items: list[RoadmapItem]
    milestones: list[Milestone]
    linked_diagrams: list[UUID]

    _version = field_validator("schema_version")(_check_schema_version)

    @model_validator(mode="after")
    def _check_consistency(self) -> Self:
        self._check_date_range()
        _require_unique((lane.id for lane in self.lanes), "lanes")
        _require_unique((status.id for status in self.statuses), "statuses")
        _require_unique((item.id for item in self.items), "items")
        _require_unique((pi.id for pi in self.timeline.pis), "program increments")
        _require_unique((milestone.id for milestone in self.milestones), "milestones")
        lane_ids = {lane.id for lane in self.lanes}
        status_ids = {status.id for status in self.statuses}
        for item in self.items:
            _check_item(item, lane_ids, status_ids)
        for milestone in self.milestones:
            _check_milestone(milestone)
        _check_pis_do_not_overlap(self.timeline)
        return self

    def _check_date_range(self) -> None:
        _require_in_range("The timeline has a start date", [self.timeline.start])
        for pi in self.timeline.pis:
            _require_in_range(f"{pi.name} has a start date", [pi.start])
        for item in self.items:
            _require_in_range(f"Item {item.key} has a date", [item.start, item.end])
        for milestone in self.milestones:
            noun = "Milestone" if milestone.kind == "milestone" else "Freeze"
            _require_in_range(
                f"{noun} “{milestone.name}” has a date",
                [milestone.date, milestone.start, milestone.end],
            )


def _require_in_range(subject: str, dates: Iterable[dt.date | None]) -> None:
    if any(date is not None and not DATE_MIN <= date <= DATE_MAX for date in dates):
        raise ValueError(
            f"{subject} outside the supported range ({DATE_MIN.isoformat()} to "
            f"{DATE_MAX.isoformat()})"
        )


def _check_item(item: RoadmapItem, lane_ids: set[str], status_ids: set[str]) -> None:
    if item.lane_id not in lane_ids:
        raise ValueError(f"Item {item.key} is in a lane that doesn't exist ({item.lane_id})")
    if item.status_id not in status_ids:
        raise ValueError(f"Item {item.key} has a status that doesn't exist ({item.status_id})")
    for story in item.stories or []:
        if story.status_id not in status_ids:
            raise ValueError(
                f"Story {story.key} has a status that doesn't exist ({story.status_id})"
            )
    if item.start is not None and item.end is None:
        raise ValueError(f"Item {item.key} has a start date but no end date")
    if item.start is None and item.end is not None:
        raise ValueError(f"Item {item.key} has an end date but no start date")
    if item.start is not None and item.end is not None and item.end < item.start:
        raise ValueError(f"Item {item.key} has an end date before its start date")


def _check_milestone(milestone: Milestone) -> None:
    has_date = milestone.date is not None
    has_range = milestone.start is not None or milestone.end is not None
    # A kind change in the editor must swap date for range in one save, never carry both.
    if (milestone.kind == "milestone" and has_range) or (milestone.kind == "freeze" and has_date):
        raise ValueError(f"Milestone “{milestone.name}” can't have both a date and a date range")
    if milestone.kind == "milestone":
        if milestone.date is None:
            raise ValueError(f"Milestone “{milestone.name}” needs a date")
        return
    if milestone.start is None or milestone.end is None:
        raise ValueError(f"Freeze “{milestone.name}” needs a start and an end date")
    if milestone.end < milestone.start:
        raise ValueError(f"Freeze “{milestone.name}” ends before it starts")


def _check_pis_do_not_overlap(timeline: RoadmapTimeline) -> None:
    """Each PI must start on or after the previous one's end; gaps are allowed (RM-4)."""
    ordered = sorted(timeline.pis, key=lambda pi: pi.start)
    for previous, current in pairwise(ordered):
        previous_end = previous.start + dt.timedelta(
            days=previous.sprints * timeline.sprint_length_days
        )
        if current.start < previous_end:
            raise ValueError(f"{current.name} starts before {previous.name} ends")


# --- Diagram ---------------------------------------------------------------------------


class DiagramLane(DocumentModel):
    id: str
    name: str
    position: float = Field(..., description="Float ordering key")
    min_height: int | None = Field(None, description="Manual resize, if any")
    height: int = Field(..., description="Resolved lane height in diagram units")


class DiagramShape(DocumentModel):
    id: str
    type: ShapeType
    lane_id: str
    x: float = Field(..., description="Absolute x in diagram units")
    y: float = Field(..., description="y relative to the lane top")
    label: str | None = None
    sub: str | None = None
    owner: str | None = None
    fill: DiagramFill | None = Field(None, description="A `diagram.fills` token key")
    jira_key: str | None = None


class Connector(DocumentModel):
    id: str
    from_: str = Field(..., alias="from", description="Source shape id")
    to: str = Field(..., description="Target shape id")
    from_side: Side
    to_side: Side
    label: str | None = None
    style: Literal["flow", "association"]
    points: list[tuple[float, float]] = Field(
        ..., description="Resolved route in absolute diagram coordinates"
    )


class DiagramDocument(DocumentModel):
    schema_version: int
    kind: Literal["diagram"]
    id: UUID
    name: str = Field(..., min_length=1, max_length=200)
    version: int = Field(..., ge=1, description="Increments on Save version")
    owner: str | None = None
    linked_roadmap_id: UUID | None = None
    orientation: Literal["horizontal"]
    width: int = Field(..., description="Resolved diagram width")
    min_width: int | None = Field(None, description="Manual resize, if any")
    lanes: list[DiagramLane]
    shapes: list[DiagramShape]
    connectors: list[Connector]

    _version = field_validator("schema_version")(_check_schema_version)

    @model_validator(mode="after")
    def _check_consistency(self) -> Self:
        _require_unique((lane.id for lane in self.lanes), "lanes")
        _require_unique((shape.id for shape in self.shapes), "shapes")
        _require_unique((connector.id for connector in self.connectors), "connectors")
        self._check_references()
        self._check_sizes()
        self._check_geometry()
        return self

    def _check_references(self) -> None:
        lane_ids = {lane.id for lane in self.lanes}
        shape_ids = {shape.id for shape in self.shapes}
        for shape in self.shapes:
            if shape.lane_id not in lane_ids:
                raise ValueError(
                    f"Shape {shape.id} is in a lane that doesn't exist ({shape.lane_id})"
                )
        for connector in self.connectors:
            if connector.from_ not in shape_ids:
                raise ValueError(
                    f"Connector {connector.id} starts at a shape that doesn't exist "
                    f"({connector.from_})"
                )
            if connector.to not in shape_ids:
                raise ValueError(
                    f"Connector {connector.id} ends at a shape that doesn't exist ({connector.to})"
                )

    def _check_sizes(self) -> None:
        for lane in self.lanes:
            if lane.height < LANE_MIN_HEIGHT:
                raise ValueError(
                    f"Lane “{lane.name}” is shorter than the {LANE_MIN_HEIGHT}px minimum"
                )
        if self.width < MIN_WIDTH:
            raise ValueError(f"The diagram is narrower than the {MIN_WIDTH}px minimum")

    def _check_geometry(self) -> None:
        bad_ids = bad_connector_ids(self)
        if not bad_ids:
            return
        rule = (
            "each segment must be horizontal or vertical and start and end on its shapes' anchors"
        )
        if len(bad_ids) == 1:
            raise ValueError(f"Connector {bad_ids[0]} isn't drawn correctly: {rule}")
        raise ValueError(f"Connectors {', '.join(bad_ids)} aren't drawn correctly: {rule}")
