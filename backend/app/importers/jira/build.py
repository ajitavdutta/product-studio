"""Build a schema-v1 roadmap document from mapped Jira rows (IMP-7, IMP-8, IMP-11).

Pure: no database and no clock; the caller passes `now` and the settings. The rules are in
`docs/plans/M2-jira-import.md` ("`build_roadmap` rules").
"""

import datetime as dt
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from itertools import islice
from typing import Final, Literal
from uuid import UUID

from app.documents.defaults import DEFAULT_STATUSES, TEAM_COLOR_ORDER
from app.documents.slugs import slugify
from app.importers.jira.dates import detect_dayfirst, parse_jira_date
from app.importers.jira.names import normalise_name
from app.importers.jira.types import ColumnGroup, ExportExtras, Rows
from app.importers.jira.warnings import BuildCounts, collect_warnings, unmapped_labels
from app.schemas.documents import (
    CURRENT_SCHEMA_VERSION,
    IssueCounts,
    Milestone,
    ProgramIncrement,
    RoadmapDocument,
    RoadmapItem,
    RoadmapLane,
    RoadmapSource,
    RoadmapStatus,
    RoadmapTimeline,
    Story,
)
from app.schemas.imports import ImportColumn, ImportFormat, ImportMapping, RoadmapField
from app.schemas.settings import PiCadence, SettingsRead

EPIC_TYPE: Final = "Epic"
# ASSUMPTION: a non-epic item with no Type column is labelled "Issue", not "Epic".
ISSUE_TYPE: Final = "Issue"
SPRINT_LENGTH_DAYS: Final = 14
MAX_PIS: Final = 12
POSITION_STEP: Final = 1000
# Preview rebuilds on every mapping edit, so the day/month order is sniffed from at most this
# many date cells per column, not the whole export. A day-first export shows a day above 12
# within a few dozen dates, so the cap costs nothing in practice.
DAYFIRST_SAMPLE_SIZE: Final = 1000
UNASSIGNED_LANE_ID: Final = "unassigned"
UNASSIGNED_LANE_NAME: Final = "Unassigned"
FALLBACK_STATUS_ID: Final = "not-started"
DONE_STATUS_ID: Final = "done"
# At risk is started work that is stuck, so it counts as in progress: the payments fixture
# expects RSK-031 (3 In Progress + 1 Blocked) to have 4 issues in progress.
IN_PROGRESS_STATUS_IDS: Final = frozenset({"in-progress", "at-risk"})
IN_PROGRESS_WEIGHT: Final = 0.5
# Parent wins over Epic Link on a row where both have a value (skill §3).
PARENT_COLUMN_NAMES: Final = frozenset({"parent", "parent id", "parent key"})

SOURCE_TYPES: Final[dict[ImportFormat, Literal["jira-csv", "jira-json", "jira-xml"]]] = {
    "csv": "jira-csv",
    "json": "jira-json",
    "xml": "jira-xml",
}

Span = tuple[dt.date, dt.date]


@dataclass(frozen=True, slots=True)
class ImportData:
    """What the import session holds: listed columns, merged groups, rows and export extras.

    `rows` are indexed like the raw columns, so each group's `source_indexes` point into a row.
    """

    session_id: UUID
    file_name: str
    format: ImportFormat
    template_id: str | None
    columns: Sequence[ImportColumn]
    groups: Sequence[ColumnGroup]
    rows: Rows
    extras: ExportExtras = field(default_factory=ExportExtras)


@dataclass(frozen=True, slots=True)
class BuildResult:
    document: RoadmapDocument
    epics: int
    issues: int
    teams: int
    warnings: list[str]
    unmapped: list[str]


@dataclass(frozen=True, slots=True)
class _Issue:
    """One Jira row read through the mapping."""

    key: str
    title: str
    type: str | None
    epic: str | None
    team: str | None
    jira_status: str | None
    sprint: str | None
    releases: list[str]
    start: dt.date | None
    end: dt.date | None


@dataclass(frozen=True, slots=True)
class _Draft:
    """An item before it gets ids, lanes and positions."""

    issue: _Issue
    is_epic: bool
    span: Span | None
    stories: list[_Issue]
    team: str | None


class _RowReader:
    """Reads mapped fields out of a row; date columns learn their day/month order up front."""

    def __init__(self, groups: Sequence[ColumnGroup], mapping: ImportMapping, rows: Rows) -> None:
        self._groups: dict[RoadmapField, list[ColumnGroup]] = {}
        for group in groups:
            mapped = mapping.columns.get(group.id)
            if mapped is not None and mapped != "ignore":
                self._groups.setdefault(mapped, []).append(group)
        self._groups["epic"] = sorted(self._groups.get("epic", []), key=_parent_first)
        self._dayfirst = {
            group.id: detect_dayfirst(
                islice(
                    (value for row in rows for value in _cells(row, group)), DAYFIRST_SAMPLE_SIZE
                )
            )
            for date_field in ("start", "end")
            for group in self._groups.get(date_field, [])
        }

    def has(self, mapped: RoadmapField) -> bool:
        return bool(self._groups.get(mapped))

    def values(self, row: list[list[str]], mapped: RoadmapField) -> list[str]:
        """Every non-empty value, in column order (Parent before Epic Link)."""
        return [value for group in self._groups.get(mapped, []) for value in _cells(row, group)]

    def first(self, row: list[list[str]], mapped: RoadmapField) -> str | None:
        values = self.values(row, mapped)
        return values[0] if values else None

    def date(self, row: list[list[str]], mapped: RoadmapField) -> dt.date | None:
        for group in self._groups.get(mapped, []):
            for value in _cells(row, group):
                parsed = parse_jira_date(value, self._dayfirst[group.id])
                if parsed is not None:
                    return parsed
        return None

    def issue(self, row: list[list[str]]) -> _Issue | None:
        key = self.first(row, "key")
        if key is None:
            return None
        sprints = self.values(row, "sprint")
        return _Issue(
            key=key,
            title=self.first(row, "title") or key,
            type=self.first(row, "type"),
            epic=self.first(row, "epic"),
            team=self.first(row, "team"),
            jira_status=self.first(row, "status"),
            # Repeated Sprint cells run oldest to newest; the last one is the current sprint.
            sprint=sprints[-1] if sprints else None,
            releases=list(dict.fromkeys(self.values(row, "release"))),
            start=self.date(row, "start"),
            end=self.date(row, "end"),
        )


def _parent_first(group: ColumnGroup) -> bool:
    is_parent = group.field_id == "parent" or normalise_name(group.name) in PARENT_COLUMN_NAMES
    return not is_parent


def _cells(row: list[list[str]], group: ColumnGroup) -> list[str]:
    values = (
        value.strip() for index in group.source_indexes if index < len(row) for value in row[index]
    )
    return [value for value in values if value]


def _read_issues(reader: _RowReader, rows: Rows) -> list[_Issue]:
    """Rows with a key, in file order; a repeated key keeps its first row."""
    issues: dict[str, _Issue] = {}
    for row in rows:
        issue = reader.issue(row)
        if issue is not None and issue.key not in issues:
            issues[issue.key] = issue
    return list(issues.values())


def _learned_sprint_windows(issues: Iterable[_Issue]) -> dict[str, Span]:
    """`[min start, max end]` of the issues with both dates, per latest sprint name."""
    windows: dict[str, Span] = {}
    for issue in issues:
        if issue.sprint is None or issue.start is None or issue.end is None:
            continue
        known = windows.get(issue.sprint)
        if known is None:
            windows[issue.sprint] = (issue.start, issue.end)
        else:
            windows[issue.sprint] = (min(known[0], issue.start), max(known[1], issue.end))
    return windows


def _issue_span(issue: _Issue, windows: dict[str, Span] | None) -> Span | None:
    """The issue's own dates, completed from its sprint window when `windows` is given.

    ASSUMPTION: a lone date with no window to complete it makes a one-day item, and dates
    entered back to front are put in order, so the document always validates.
    """
    start, end = issue.start, issue.end
    window = windows.get(issue.sprint) if windows is not None and issue.sprint else None
    if window is not None:
        start = start or window[0]
        end = end or window[1]
    if start is None:
        return None if end is None else (end, end)
    if end is None:
        return (start, start)
    return (min(start, end), max(start, end))


def _merge_spans(spans: Iterable[Span]) -> Span | None:
    listed = list(spans)
    if not listed:
        return None
    return (min(span[0] for span in listed), max(span[1] for span in listed))


def _status_id(issue: _Issue, mapping: ImportMapping) -> str:
    if issue.jira_status is None:
        return FALLBACK_STATUS_ID
    return mapping.status_map.get(issue.jira_status, FALLBACK_STATUS_ID)


def _story_team(stories: Sequence[_Issue]) -> str | None:
    # Counter keeps first-seen order among equal counts, so a tie goes to the earlier story.
    teams = Counter(story.team for story in stories if story.team)
    return teams.most_common(1)[0][0] if teams else None


def _drafts(
    issues: list[_Issue], reader: _RowReader, mapping: ImportMapping, spans: dict[str, Span | None]
) -> list[_Draft]:
    if not mapping.rollup.roll_up_stories:
        return [
            _Draft(issue, _is_typed_epic(issue), spans[issue.key], [], issue.team)
            for issue in issues
        ]
    if reader.has("type"):
        epic_keys = {issue.key for issue in issues if _is_typed_epic(issue)}
    else:
        # ASSUMPTION: with no Type column, an epic is any key another row points at.
        referenced = {issue.epic for issue in issues if issue.epic}
        epic_keys = {issue.key for issue in issues if issue.key in referenced}
    stories: dict[str, list[_Issue]] = {key: [] for key in epic_keys}
    drafts: list[_Draft] = []
    for issue in issues:
        if issue.key not in epic_keys and issue.epic in epic_keys:
            stories[issue.epic].append(issue)
    for issue in issues:
        if issue.key not in epic_keys:
            if issue.epic not in epic_keys:
                drafts.append(_Draft(issue, False, spans[issue.key], [], issue.team))
            continue
        children = stories[issue.key]
        span = (
            _merge_spans(s for s in (spans[child.key] for child in children) if s)
            or spans[issue.key]
        )
        drafts.append(_Draft(issue, True, span, children, issue.team or _story_team(children)))
    return drafts


def _is_typed_epic(issue: _Issue) -> bool:
    return issue.type is not None and issue.type.casefold() == EPIC_TYPE.casefold()


def _issue_counts(stories: Sequence[_Issue], mapping: ImportMapping) -> tuple[IssueCounts, int]:
    statuses = [_status_id(story, mapping) for story in stories]
    done = statuses.count(DONE_STATUS_ID)
    in_progress = sum(1 for status_id in statuses if status_id in IN_PROGRESS_STATUS_IDS)
    total = len(statuses)
    counts = IssueCounts(total=total, done=done, in_progress=in_progress)
    if total == 0:
        return counts, 0
    # Python's round is half-to-even: 62.5 → 62, which the fixture expects for MX-070.
    return counts, round(100 * (done + IN_PROGRESS_WEIGHT * in_progress) / total)


def _unique_id(candidate: str, taken: set[str]) -> str:
    unique = candidate
    suffix = 2
    while unique in taken:
        unique = f"{candidate}-{suffix}"
        suffix += 1
    taken.add(unique)
    return unique


@dataclass(frozen=True, slots=True)
class _Lanes:
    lanes: list[RoadmapLane]
    ids_by_team: dict[str, str]
    unassigned_id: str | None


def _lanes(drafts: Sequence[_Draft]) -> _Lanes:
    """Lanes for the teams items use, in order of first appearance, plus Unassigned if needed."""
    taken: set[str] = set()
    lanes: list[RoadmapLane] = []
    lane_ids: dict[str, str] = {}
    for team in dict.fromkeys(draft.team for draft in drafts if draft.team):
        index = len(lanes)
        lane_id = _unique_id(slugify(team) or f"team-{index + 1}", taken)
        lane_ids[team] = lane_id
        color = TEAM_COLOR_ORDER[index % len(TEAM_COLOR_ORDER)]
        lanes.append(
            RoadmapLane(id=lane_id, name=team, color=color, position=(index + 1) * POSITION_STEP)
        )
    unassigned_id: str | None = None
    if any(draft.team is None for draft in drafts):
        index = len(lanes)
        unassigned_id = _unique_id(UNASSIGNED_LANE_ID, taken)
        lanes.append(
            RoadmapLane(
                id=unassigned_id,
                name=UNASSIGNED_LANE_NAME,
                color=TEAM_COLOR_ORDER[index % len(TEAM_COLOR_ORDER)],
                position=(index + 1) * POSITION_STEP,
            )
        )
    return _Lanes(lanes, lane_ids, unassigned_id)


def _items(
    drafts: Sequence[_Draft], lanes: _Lanes, mapping: ImportMapping, jira_base_url: str | None
) -> list[RoadmapItem]:
    taken: set[str] = set()
    items: list[RoadmapItem] = []
    for index, draft in enumerate(drafts):
        issue = draft.issue
        counts, progress = _issue_counts(draft.stories, mapping)
        fallback_type = EPIC_TYPE if draft.is_epic else ISSUE_TYPE
        stories = [
            Story(key=story.key, title=story.title, status_id=_status_id(story, mapping))
            for story in draft.stories
        ]
        items.append(
            RoadmapItem(
                id=_unique_id("it-" + slugify(issue.key), taken),
                key=issue.key,
                title=issue.title,
                type=issue.type or fallback_type,
                lane_id=_lane_id(draft, lanes),
                status_id=_status_id(issue, mapping),
                start=draft.span[0] if draft.span else None,
                end=draft.span[1] if draft.span else None,
                progress=progress,
                issues=counts,
                stories=stories or None,
                jira_url=f"{jira_base_url}browse/{issue.key}" if jira_base_url else None,
                position=(index + 1) * POSITION_STEP,
            )
        )
    return items


def _lane_id(draft: _Draft, lanes: _Lanes) -> str:
    if draft.team is not None:
        return lanes.ids_by_team[draft.team]
    # _lanes adds the Unassigned lane whenever a draft has no team.
    assert lanes.unassigned_id is not None
    return lanes.unassigned_id


def _statuses(issues: Sequence[_Issue], mapping: ImportMapping) -> list[RoadmapStatus]:
    """Default plus custom statuses, each listing the Jira statuses in this file mapped to it."""
    in_file: dict[str, list[str]] = {}
    for jira_status in dict.fromkeys(issue.jira_status for issue in issues if issue.jira_status):
        status_id = mapping.status_map.get(jira_status, FALLBACK_STATUS_ID)
        in_file.setdefault(status_id, []).append(jira_status)
    known = [(status.id, status.name, status.color) for status in DEFAULT_STATUSES]
    known += [(status.id, status.name, status.color) for status in mapping.custom_statuses]
    return [
        RoadmapStatus(
            id=status_id, name=name, color=color, jira_statuses=in_file.get(status_id, [])
        )
        for status_id, name, color in known
    ]


def _timeline(spans: Sequence[Span], cadence: PiCadence, today: dt.date) -> RoadmapTimeline:
    """PIs from the Monday on or before the earliest start until they cover the latest end.

    ASSUMPTION: the spec has no PI anchor; RM-4 lets the user fix it in M3.
    """
    first = min((span[0] for span in spans), default=today)
    anchor = first - dt.timedelta(days=first.weekday())
    latest_end = max((span[1] for span in spans), default=anchor)
    pi_days = cadence.sprints_per_pi * SPRINT_LENGTH_DAYS
    # `end` is inclusive, so the PIs must reach the day after it.
    needed = ((latest_end - anchor).days + pi_days) // pi_days
    count = max(1, min(MAX_PIS, needed))
    pis = [
        ProgramIncrement(
            id=f"pi-{number}",
            name=f"PI {number}",
            start=anchor + dt.timedelta(days=(number - 1) * pi_days),
            sprints=cadence.sprints_per_pi,
            ip_sprint=cadence.ip_sprint,
        )
        for number in range(1, count + 1)
    ]
    return RoadmapTimeline(start=anchor, sprint_length_days=SPRINT_LENGTH_DAYS, pis=pis)


def _milestones(
    issues: Sequence[_Issue], ends: dict[str, dt.date], release_dates: dict[str, dt.date]
) -> list[Milestone]:
    """One milestone per release, dated by the export or else by the latest end in it.

    ASSUMPTION: a release with neither date is skipped.
    """
    latest: dict[str, dt.date | None] = {}
    for issue in issues:
        end = ends.get(issue.key)
        for release in issue.releases:
            known = latest.get(release)
            latest[release] = max(known, end) if known and end else known or end
    taken: set[str] = set()
    milestones: list[Milestone] = []
    for release, latest_end in latest.items():
        date = release_dates.get(release) or latest_end
        if date is None:
            continue
        milestone_id = _unique_id("ms-" + (slugify(release) or "release"), taken)
        milestones.append(Milestone(id=milestone_id, name=release, kind="milestone", date=date))
    return milestones


def build_roadmap(
    data: ImportData, mapping: ImportMapping, settings: SettingsRead, now: dt.datetime
) -> BuildResult:
    """Build the document that preview shows and commit saves, with its counts and warnings."""
    reader = _RowReader(data.groups, mapping, data.rows)
    issues = _read_issues(reader, data.rows)
    windows: dict[str, Span] | None = None
    if mapping.rollup.use_sprint_dates:
        windows = _learned_sprint_windows(issues) | data.extras.sprint_windows
    spans = {issue.key: _issue_span(issue, windows) for issue in issues}
    all_drafts = _drafts(issues, reader, mapping, spans)
    drafts = all_drafts
    if not mapping.rollup.unscheduled_tray:
        drafts = [draft for draft in all_drafts if draft.span is not None]

    lanes = _lanes(drafts)
    base_url = str(settings.jira_base_url).rstrip("/") + "/" if settings.jira_base_url else None
    items = _items(drafts, lanes, mapping, base_url)
    ends = {key: span[1] for key, span in spans.items() if span}
    ends.update({draft.issue.key: draft.span[1] for draft in drafts if draft.span})
    milestones = (
        _milestones(issues, ends, data.extras.release_dates)
        if mapping.rollup.fix_versions_as_milestones
        else []
    )
    document = RoadmapDocument(
        schema_version=CURRENT_SCHEMA_VERSION,
        kind="roadmap",
        id=data.session_id,
        name=mapping.name,
        source=RoadmapSource(
            type=SOURCE_TYPES[data.format],
            file=data.file_name,
            imported_at=now,
            mapping_template_id=data.template_id,
        ),
        timeline=_timeline([d.span for d in drafts if d.span], settings.pi_cadence, now.date()),
        lanes=lanes.lanes,
        statuses=_statuses(issues, mapping),
        items=items,
        milestones=milestones,
        linked_diagrams=[],
    )
    counts = BuildCounts(
        undated_items=sum(1 for draft in all_drafts if draft.span is None),
        undated_stories=sum(
            1 for draft in all_drafts for story in draft.stories if spans[story.key] is None
        ),
        teamless_issues=sum(1 for issue in issues if issue.team is None),
        rolled_up=mapping.rollup.roll_up_stories,
        unscheduled_tray=mapping.rollup.unscheduled_tray,
    )
    return BuildResult(
        document=document,
        epics=sum(1 for draft in drafts if draft.is_epic),
        issues=len(issues),
        teams=len(lanes.ids_by_team),
        warnings=collect_warnings(counts, mapping, data.columns),
        unmapped=unmapped_labels(mapping, data.columns),
    )
