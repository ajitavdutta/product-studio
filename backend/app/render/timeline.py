"""Roadmap timeline maths: PI cadence, view ranges, header columns and column boundaries.

Mirrors `frontend/src/lib/timeline` on purpose (ADR-3); both must pass
`docs/fixtures/timeline/*.json`. Change one, change the other in the same change.

Every range is half-open `[start, end_exclusive)`. An item's inclusive `end` becomes
`end + 1 day`. `today` is always a parameter so callers (and tests) control it.
"""

import datetime as dt
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from app.schemas.documents import ProgramIncrement, RoadmapItem, RoadmapTimeline

View = Literal["sprints", "months", "pis"]
ColumnRow = Literal["pi", "sprint", "month", "tick"]

DEFAULT_SPRINT_COLUMNS = 13
IP_SUFFIX = " · IP"
IP_TICK_LABEL = "IP"
EN_DASH = "–"

# Sprint date label breakpoints (RM-5), in CSS pixels of column width.
FULL_DATES_MIN_WIDTH = 96
COMPACT_RANGE_MIN_WIDTH = 70
START_ONLY_MIN_WIDTH = 44

ONE_DAY = dt.timedelta(days=1)
# English names regardless of the server locale, so labels match the frontend and fixtures.
MONTH_SHORT_NAMES = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


@dataclass(frozen=True)
class DateRange:
    start: dt.date
    end_exclusive: dt.date

    def overlaps(self, start: dt.date, end_exclusive: dt.date) -> bool:
        return start < self.end_exclusive and end_exclusive > self.start

    def contains(self, day: dt.date) -> bool:
        return self.start <= day < self.end_exclusive


@dataclass(frozen=True)
class Sprint:
    pi_id: str
    pi_name: str
    index: int
    label: str
    tick_label: str
    start: dt.date
    end_exclusive: dt.date
    ip: bool


@dataclass(frozen=True)
class Pi:
    id: str
    name: str
    start: dt.date
    end_exclusive: dt.date
    sprints: tuple[Sprint, ...]


@dataclass(frozen=True)
class Column:
    row: ColumnRow
    label: str
    start: dt.date
    end_exclusive: dt.date
    dates: str | None = None
    sub: str | None = None
    current: bool = False
    ip: bool = False
    clipped: bool = False


@dataclass(frozen=True)
class Boundary:
    date: dt.date
    strong: bool


def format_day_month(day: dt.date) -> str:
    """`2 Nov`: day without a leading zero, English short month."""
    return f"{day.day} {MONTH_SHORT_NAMES[day.month - 1]}"


def sprint_date_label(start: dt.date, end_exclusive: dt.date, col_w: float) -> str:
    """The sprint header date label for a column `col_w` CSS pixels wide (RM-5)."""
    end = end_exclusive - ONE_DAY
    if col_w >= FULL_DATES_MIN_WIDTH:
        return f"{format_day_month(start)} {EN_DASH} {format_day_month(end)}"
    if col_w >= COMPACT_RANGE_MIN_WIDTH:
        if (start.year, start.month) == (end.year, end.month):
            return f"{start.day}{EN_DASH}{format_day_month(end)}"
        return f"{format_day_month(start)}{EN_DASH}{format_day_month(end)}"
    if col_w >= START_ONLY_MIN_WIDTH:
        return format_day_month(start)
    return ""


def _sprint_label(pi: ProgramIncrement, index: int) -> str:
    names = pi.sprint_names or []
    label = names[index] if index < len(names) else f"S{index + 1}"
    return label + IP_SUFFIX if _is_ip(pi, index) else label


def _is_ip(pi: ProgramIncrement, index: int) -> bool:
    return pi.ip_sprint and index == pi.sprints - 1


def program_increments(pis: Iterable[ProgramIncrement], sprint_length_days: int) -> list[Pi]:
    """Expand each PI into its sprints (sprint `j` starts at `pi.start + j * length`)."""
    length = dt.timedelta(days=sprint_length_days)
    expanded: list[Pi] = []
    for pi in sorted(pis, key=lambda candidate: (candidate.start, candidate.id)):
        sprints = tuple(
            Sprint(
                pi_id=pi.id,
                pi_name=pi.name,
                index=index,
                label=_sprint_label(pi, index),
                tick_label=IP_TICK_LABEL if _is_ip(pi, index) else _sprint_label(pi, index),
                start=pi.start + index * length,
                end_exclusive=pi.start + (index + 1) * length,
                ip=_is_ip(pi, index),
            )
            for index in range(pi.sprints)
        )
        expanded.append(Pi(pi.id, pi.name, pi.start, pi.start + pi.sprints * length, sprints))
    return expanded


def _all_sprints(pis: Sequence[Pi]) -> list[Sprint]:
    return [sprint for pi in pis for sprint in pi.sprints]


def current_sprint(pis: Sequence[Pi], today: dt.date) -> Sprint | None:
    """The sprint containing `today`, or `None` before, between or after the PIs."""
    return next((s for s in _all_sprints(pis) if s.start <= today < s.end_exclusive), None)


def _scheduled_spans(items: Iterable[RoadmapItem]) -> list[DateRange]:
    return [
        DateRange(item.start, item.end + ONE_DAY)
        for item in items
        if item.start is not None and item.end is not None
    ]


def _first_of_month(day: dt.date) -> dt.date:
    return day.replace(day=1)


def _next_month(day: dt.date) -> dt.date:
    first = _first_of_month(day)
    return (
        first.replace(year=first.year + 1, month=1)
        if first.month == 12
        else first.replace(month=first.month + 1)
    )


def _default_months_range(timeline: RoadmapTimeline, spans: Sequence[DateRange]) -> DateRange:
    # ASSUMPTION: with no scheduled items the Months view shows the timeline start's month.
    if not spans:
        return DateRange(_first_of_month(timeline.start), _next_month(timeline.start))
    earliest = min(span.start for span in spans)
    latest_inclusive = max(span.end_exclusive for span in spans) - ONE_DAY
    return DateRange(_first_of_month(earliest), _next_month(latest_inclusive))


def _default_sprints_range(timeline: RoadmapTimeline, pis: Sequence[Pi]) -> DateRange:
    candidates = [s for s in _all_sprints(pis) if s.start >= timeline.start]
    if not candidates:
        # ASSUMPTION: no sprint on or after the start → 13 sprint lengths from the start.
        span = dt.timedelta(days=timeline.sprint_length_days * DEFAULT_SPRINT_COLUMNS)
        return DateRange(timeline.start, timeline.start + span)
    shown = candidates[:DEFAULT_SPRINT_COLUMNS]
    return DateRange(shown[0].start, shown[-1].end_exclusive)


def _default_pis_range(
    timeline: RoadmapTimeline, pis: Sequence[Pi], spans: Sequence[DateRange]
) -> DateRange:
    touched = [pi for pi in pis if any(span.overlaps(pi.start, pi.end_exclusive) for span in spans)]
    # ASSUMPTION: no item inside any PI → show every PI; no PIs at all → the Months range.
    chosen = touched or list(pis)
    if not chosen:
        return _default_months_range(timeline, spans)
    return DateRange(chosen[0].start, max(pi.end_exclusive for pi in chosen))


def default_range(view: View, timeline: RoadmapTimeline, items: Iterable[RoadmapItem]) -> DateRange:
    """The range a view opens on before the user changes it (RM-5, RM-6, RM-7)."""
    pis = program_increments(timeline.pis, timeline.sprint_length_days)
    spans = _scheduled_spans(items)
    if view == "sprints":
        return _default_sprints_range(timeline, pis)
    if view == "months":
        return _default_months_range(timeline, spans)
    return _default_pis_range(timeline, pis, spans)


def _clip(
    range_: DateRange, start: dt.date, end_exclusive: dt.date
) -> tuple[dt.date, dt.date, bool]:
    clipped_start = max(start, range_.start)
    clipped_end = min(end_exclusive, range_.end_exclusive)
    return clipped_start, clipped_end, (clipped_start, clipped_end) != (start, end_exclusive)


def _pi_columns(range_: DateRange, pis: Sequence[Pi], with_dates: bool) -> list[Column]:
    result: list[Column] = []
    for pi in pis:
        if not range_.overlaps(pi.start, pi.end_exclusive):
            continue
        start, end, clipped = _clip(range_, pi.start, pi.end_exclusive)
        sub = (
            f"{format_day_month(pi.start)} {EN_DASH} {format_day_month(pi.end_exclusive - ONE_DAY)}"
            if with_dates
            else None
        )
        result.append(Column("pi", pi.name, start, end, sub=sub, clipped=clipped))
    return result


def _sprint_columns(
    range_: DateRange, pis: Sequence[Pi], today: dt.date, row: Literal["sprint", "tick"]
) -> list[Column]:
    result: list[Column] = []
    for sprint in _all_sprints(pis):
        if not range_.overlaps(sprint.start, sprint.end_exclusive):
            continue
        start, end, clipped = _clip(range_, sprint.start, sprint.end_exclusive)
        is_sprint_row = row == "sprint"
        result.append(
            Column(
                row,
                sprint.label if is_sprint_row else sprint.tick_label,
                start,
                end,
                dates=(
                    sprint_date_label(sprint.start, sprint.end_exclusive, FULL_DATES_MIN_WIDTH)
                    if is_sprint_row
                    else None
                ),
                current=sprint.start <= today < sprint.end_exclusive,
                ip=sprint.ip,
                clipped=clipped,
            )
        )
    return result


def _month_label(month_start: dt.date, is_first: bool) -> str:
    short = MONTH_SHORT_NAMES[month_start.month - 1]
    return f"{short} {month_start.year}" if is_first or month_start.month == 1 else short


def _pi_containing(pis: Sequence[Pi], day: dt.date) -> Pi | None:
    return next((pi for pi in pis if pi.start <= day < pi.end_exclusive), None)


def _month_columns(range_: DateRange, pis: Sequence[Pi]) -> list[Column]:
    result: list[Column] = []
    month = _first_of_month(range_.start)
    while month < range_.end_exclusive:
        start, end, clipped = _clip(range_, month, _next_month(month))
        midpoint = start + dt.timedelta(days=(end - start).days // 2)
        containing = _pi_containing(pis, midpoint)
        result.append(
            Column(
                "month",
                _month_label(month, is_first=not result),
                start,
                end,
                sub=containing.name if containing else None,
                clipped=clipped,
            )
        )
        month = _next_month(month)
    return result


def columns(view: View, range_: DateRange, pis: Sequence[Pi], today: dt.date) -> list[Column]:
    """Header cells for `view` inside `range_`: band row(s) first, then the fine row."""
    if view == "sprints":
        return _pi_columns(range_, pis, with_dates=False) + _sprint_columns(
            range_, pis, today, "sprint"
        )
    if view == "months":
        return _month_columns(range_, pis)
    return _pi_columns(range_, pis, with_dates=True) + _sprint_columns(range_, pis, today, "tick")


def boundaries(view: View, range_: DateRange, pis: Sequence[Pi]) -> list[Boundary]:
    """Column edges strictly inside `range_`, sorted by date; PI edges are strong (EX-7)."""
    if view == "months":
        edges = {column.start: False for column in _month_columns(range_, pis)}
    else:
        pi_edges = {day for pi in pis for day in (pi.start, pi.end_exclusive)}
        sprint_view_columns = _sprint_columns(range_, pis, range_.start, "sprint")
        edges = {
            day: day in pi_edges
            for column in sprint_view_columns
            for day in (column.start, column.end_exclusive)
        }
    return [
        Boundary(day, strong)
        for day, strong in sorted(edges.items())
        if range_.start < day < range_.end_exclusive
    ]
