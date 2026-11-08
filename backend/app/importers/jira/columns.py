"""Merge Jira's repeated columns into one Map-table row each (IMP-6).

Jira repeats a header once per value of a multi-value field (`Sprint, Sprint, Sprint`). Columns
sharing a field id, or else a normalised name, become one `ColumnGroup`; a row's values for the
group are its cells' values in header order.
"""

from typing import Final

from app.importers.jira.names import display_label, normalise_name
from app.importers.jira.types import ColumnGroup, ParsedExport

MAX_SAMPLES: Final = 5


def merge_repeated_columns(parsed: ParsedExport) -> list[ColumnGroup]:
    """Group `parsed.columns` by field id or normalised name, in order of first appearance.

    `samples` are the first non-empty merged values and `fill` the fraction of rows with any.
    """
    indexes_by_id: dict[str, list[int]] = {}
    for index, column in enumerate(parsed.columns):
        group_id = column.field_id or normalise_name(column.name)
        indexes_by_id.setdefault(group_id, []).append(index)

    groups: list[ColumnGroup] = []
    for group_id, indexes in indexes_by_id.items():
        first = parsed.columns[indexes[0]]
        groups.append(
            ColumnGroup(
                id=group_id,
                name=first.name,
                label=display_label(first.name),
                field_id=first.field_id,
                source_indexes=tuple(indexes),
                samples=[],
                fill=0.0,
            )
        )
    return [_with_samples_and_fill(group, parsed) for group in groups]


def _with_samples_and_fill(group: ColumnGroup, parsed: ParsedExport) -> ColumnGroup:
    samples: list[str] = []
    filled_rows = 0
    for row in parsed.rows:
        values = values_for(group, row)
        if values:
            filled_rows += 1
        samples.extend(values[: MAX_SAMPLES - len(samples)])
    fill = filled_rows / len(parsed.rows) if parsed.rows else 0.0
    return ColumnGroup(
        id=group.id,
        name=group.name,
        label=group.label,
        field_id=group.field_id,
        source_indexes=group.source_indexes,
        samples=samples,
        fill=fill,
    )


def values_for(group: ColumnGroup, row: list[list[str]]) -> list[str]:
    """Every non-empty value of `group` in `row` (a parsed row), in header order.

    This is the list Labels, Components and Fix versions keep, and the full sprint history.
    """
    return [
        value
        for index in group.source_indexes
        if index < len(row)
        for value in row[index]
        if value.strip()
    ]


def value_for(group: ColumnGroup, row: list[list[str]]) -> str | None:
    """The single value of `group` in `row`: the last non-empty one, so Sprint is the latest."""
    values = values_for(group, row)
    return values[-1] if values else None
