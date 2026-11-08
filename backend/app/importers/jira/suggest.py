"""Suggest a roadmap field for each merged Jira column (IMP-4, IMP-5, IMP-9).

Skill §3 order, most certain first, each pass over every column before the next starts:
saved template → standard Jira name → alias → Team fallback → value sniffing. A field is
given to one column only, except Epic (Parent and Epic Link both feed it) and Don't import.
"""

import datetime as dt
import re
import statistics
from collections.abc import Callable, Mapping, Sequence
from collections.abc import Set as AbstractSet
from typing import Final

from app.importers.jira.dates import detect_dayfirst, parse_jira_date
from app.importers.jira.names import (
    ALIAS_EXCLUSIONS,
    ALIASES,
    KEY_FALLBACK_ALIAS,
    STANDARD_NAMES,
    WHOLE_WORD_ALIASES,
    is_never_mapped,
    normalise_name,
)
from app.importers.jira.types import ColumnGroup
from app.schemas.imports import (
    FIELDS_ALLOWED_TWICE,
    ImportColumn,
    MatchConfidence,
    RoadmapField,
)

MIN_SNIFF_FILL: Final = 0.3
MIN_SNIFF_SHARE: Final = 0.8
MAX_POINTS: Final = 100
TYPICAL_MAX_POINTS: Final = 40
EPIC_FALLBACK_NOTE: Final = "Used when Parent is empty"
PARENT_NAMES: Final = frozenset({"parent", "parent id"})
TEAM_FALLBACK_NAME: Final = "components"

_KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")
_SPRINT_PATTERN = re.compile(r"\bsprint\s*\d+\b|\bS\d+\b", re.IGNORECASE)
_POINTS_PATTERN = re.compile(r"^\d+(\.[05])?$")

Suggestion = tuple[RoadmapField, MatchConfidence]


def suggest_mapping(
    groups: Sequence[ColumnGroup], template: Mapping[str, RoadmapField] | None = None
) -> list[ImportColumn]:
    """One `ImportColumn` per group, with a suggested field and confidence where one fits.

    `template` is a saved template's column map, keyed by column name or custom-field id.
    """
    names = [normalise_name(group.name) for group in groups]
    suggestions: dict[int, Suggestion] = {}
    taken: set[RoadmapField] = set()
    # Columns whose name says what they are; if they lose their field to an earlier column,
    # sniffing their values must not turn them into something else (Target start → End).
    named: set[int] = set()

    def assign(index: int, field: RoadmapField, confidence: MatchConfidence) -> bool:
        if index in suggestions or (field in taken and field not in FIELDS_ALLOWED_TWICE):
            return False
        suggestions[index] = (field, confidence)
        taken.add(field)
        return True

    for index, group in enumerate(groups):
        template_field = _template_field(group, template or {})
        if template_field is not None:
            named.add(index)
            assign(index, template_field, "template")
    for index, name in enumerate(names):
        if name in STANDARD_NAMES:
            named.add(index)
        standard_field = STANDARD_NAMES.get(name)
        if standard_field is not None:
            assign(index, standard_field, "exact")
    has_issue_key = "issue key" in names
    for index, name in enumerate(names):
        if index in suggestions or is_never_mapped(name):
            continue
        alias_fields = _alias_fields(name, has_issue_key)
        if alias_fields:
            named.add(index)
        for field in alias_fields:
            if assign(index, field, "alias"):
                break
    if "team" not in taken:
        _fallback_team(groups, names, assign)
    _sniff_values(groups, names, suggestions.keys() | named, assign)

    return [
        _import_column(group, suggestions.get(index), _note(index, names, suggestions))
        for index, group in enumerate(groups)
    ]


def classify(columns: Sequence[ImportColumn]) -> tuple[list[ImportColumn], list[str]]:
    """Split into the Map table's rows and the original names of the ignored columns.

    A column is listed when it has a suggestion or a standard Jira name (so Components shows
    as "Choose a field…"); the plan's relevance ASSUMPTION, which the payments fixture needs.
    """
    listed: list[ImportColumn] = []
    ignored: list[str] = []
    for column in columns:
        if column.suggested_field is not None or normalise_name(column.name) in STANDARD_NAMES:
            listed.append(column)
        else:
            ignored.append(column.name)
    return listed, ignored


def _template_field(
    group: ColumnGroup, template: Mapping[str, RoadmapField]
) -> RoadmapField | None:
    if group.name in template:
        return template[group.name]
    if group.field_id is not None:
        return template.get(group.field_id)
    return None


def _alias_fields(name: str, has_issue_key: bool) -> list[RoadmapField]:
    """Fields whose aliases `name` contains, the longest (most specific) alias first."""
    matches: list[tuple[int, RoadmapField]] = []
    for field, aliases in ALIASES.items():
        if any(excluded in name for excluded in ALIAS_EXCLUSIONS.get(field, ())):
            continue
        lengths = [len(alias) for alias in aliases if _contains_alias(name, alias)]
        if lengths:
            matches.append((max(lengths), field))
    if not has_issue_key and KEY_FALLBACK_ALIAS in name:
        matches.append((len(KEY_FALLBACK_ALIAS), "key"))
    # Stable sort keeps the ALIASES order between equally long aliases.
    return [field for _, field in sorted(matches, key=lambda match: -match[0])]


def _contains_alias(name: str, alias: str) -> bool:
    if alias in WHOLE_WORD_ALIASES:
        return re.search(rf"\b{re.escape(alias)}\b", name) is not None
    return alias in name


def _fallback_team(
    groups: Sequence[ColumnGroup],
    names: Sequence[str],
    assign: Callable[[int, RoadmapField, MatchConfidence], bool],
) -> None:
    """With no Team column, Components (when it has values) becomes Team, flagged as sniffed.

    Labels, the skill's last candidate, is already Tags by its standard name, so it never
    reaches this point.
    """
    for index, name in enumerate(names):
        if name == TEAM_FALLBACK_NAME and groups[index].fill > 0:
            assign(index, "team", "sniffed")
            return


def _sniff_values(
    groups: Sequence[ColumnGroup],
    names: Sequence[str],
    skipped: AbstractSet[int],
    assign: Callable[[int, RoadmapField, MatchConfidence], bool],
) -> None:
    candidates = [
        index
        for index, group in enumerate(groups)
        if index not in skipped
        and not is_never_mapped(names[index])
        and group.fill >= MIN_SNIFF_FILL
        and group.samples
    ]
    date_columns: list[tuple[dt.date, int]] = []
    for index in candidates:
        samples = groups[index].samples
        if _mostly(samples, lambda value: _KEY_PATTERN.match(value) is not None):
            if not assign(index, "key", "sniffed"):
                assign(index, "epic", "sniffed")
        elif dates := _sniffed_dates(samples):
            date_columns.append((statistics.median_low(dates), index))
        elif _mostly(samples, lambda value: _SPRINT_PATTERN.search(value) is not None):
            assign(index, "sprint", "sniffed")
        elif _looks_like_points(samples):
            assign(index, "points", "sniffed")
    # The column with the earlier median date is Start, the next one End.
    for _, index in sorted(date_columns):
        if not assign(index, "start", "sniffed"):
            assign(index, "end", "sniffed")


def _sniffed_dates(samples: Sequence[str]) -> list[dt.date]:
    """The samples' dates when most samples are dates (any format Jira exports), else []."""
    dayfirst = detect_dayfirst(samples)
    dates = [date for value in samples if (date := parse_jira_date(value, dayfirst)) is not None]
    return dates if len(dates) >= MIN_SNIFF_SHARE * len(samples) else []


def _mostly(samples: Sequence[str], matches: Callable[[str], bool]) -> bool:
    return sum(1 for value in samples if matches(value.strip())) >= MIN_SNIFF_SHARE * len(samples)


def _looks_like_points(samples: Sequence[str]) -> bool:
    """Integers or halves from 0 to 100, mostly no more than 40."""
    numbers = [float(value) for value in samples if _POINTS_PATTERN.match(value.strip())]
    if len(numbers) < MIN_SNIFF_SHARE * len(samples):
        return False
    if any(number > MAX_POINTS for number in numbers):
        return False
    return sum(1 for number in numbers if number <= TYPICAL_MAX_POINTS) > len(numbers) / 2


def _note(index: int, names: Sequence[str], suggestions: Mapping[int, Suggestion]) -> str | None:
    """Epic Link (or any non-Parent Epic column) is only read when Parent is empty."""
    epic_indexes = [i for i, (field, _) in suggestions.items() if field == "epic"]
    has_parent = any(names[i] in PARENT_NAMES for i in epic_indexes)
    if has_parent and index in epic_indexes and names[index] not in PARENT_NAMES:
        return EPIC_FALLBACK_NOTE
    return None


def _import_column(
    group: ColumnGroup, suggestion: Suggestion | None, note: str | None
) -> ImportColumn:
    field, confidence = suggestion if suggestion is not None else (None, None)
    return ImportColumn(
        id=group.id,
        name=group.name,
        label=group.label,
        field_id=group.field_id,
        samples=group.samples,
        fill=group.fill,
        repeat_count=len(group.source_indexes),
        suggested_field=field,
        confidence=confidence,
        note=note,
    )
