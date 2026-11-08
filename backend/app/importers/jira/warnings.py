"""The Preview panel's warnings (IMP-10, IMP-11).

Worded exactly as `docs/fixtures/jira/payments-export.expected.json`:
straight quotes, singular and plural forms, and a fixed order.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

from app.schemas.imports import ImportColumn, ImportMapping, RoadmapField

# IMP-10: without any of these, no item can get a date. ASSUMPTION about the copy.
DATE_FIELDS: Final[frozenset[RoadmapField]] = frozenset({"start", "end", "sprint"})
NO_DATE_FIELDS_WARNING: Final = (
    "Neither Start/End nor Sprint is mapped, so every item will go to Unscheduled"
)


@dataclass(frozen=True, slots=True)
class BuildCounts:
    """What the builder found that the user should know about."""

    undated_items: int
    undated_stories: int
    teamless_issues: int
    rolled_up: bool
    unscheduled_tray: bool


def _plural(count: int, singular: str, plural: str) -> str:
    return singular if count == 1 else plural


def _undated_items_warning(counts: BuildCounts) -> str:
    noun = ("epic", "epics") if counts.rolled_up else ("issue", "issues")
    destination = "Unscheduled" if counts.unscheduled_tray else "not imported"
    count = counts.undated_items
    verb = _plural(count, "has", "have")
    return f"{count} {_plural(count, *noun)} {verb} no dates → {destination}"


def _undated_stories_warning(count: int) -> str:
    # ASSUMPTION: the fixture only shows the singular; the plural reads "their epics' ranges".
    if count == 1:
        return "1 issue has no dates → excluded from its epic's range"
    return f"{count} issues have no dates → excluded from their epics' ranges"


def _teamless_warning(count: int) -> str:
    return f"{count} {_plural(count, 'issue has', 'issues have')} no team → Unassigned lane"


def unmapped_labels(mapping: ImportMapping, columns: Sequence[ImportColumn]) -> list[str]:
    """Labels of the listed columns the mapping gives no field (Don't import counts as mapped)."""
    return [column.label for column in columns if column.id not in mapping.columns]


def collect_warnings(
    counts: BuildCounts, mapping: ImportMapping, columns: Sequence[ImportColumn]
) -> list[str]:
    """Return the warnings in the fixture's order; a zero count gives no warning."""
    warnings: list[str] = []
    if counts.undated_items:
        warnings.append(_undated_items_warning(counts))
    if counts.undated_stories:
        warnings.append(_undated_stories_warning(counts.undated_stories))
    if counts.teamless_issues:
        warnings.append(_teamless_warning(counts.teamless_issues))
    warnings.extend(f'"{label}" isn\'t mapped yet' for label in unmapped_labels(mapping, columns))
    if not DATE_FIELDS & set(mapping.columns.values()):
        warnings.append(NO_DATE_FIELDS_WARNING)
    return warnings
