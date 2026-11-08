"""Data passed between the Jira readers, the column merger, the mapper and the builder.

Rows are always `list[list[list[str]]]`: per row, per column, the non-empty values of that
column's cells in header order. A CSV cell gives one value, or none when it is empty; a JSON
list or a repeated XML tag gives several.
"""

import datetime as dt
from dataclasses import dataclass, field

from app.schemas.imports import ImportFormat, TextEncoding

Rows = list[list[list[str]]]


@dataclass(frozen=True, slots=True)
class RawColumn:
    """One header cell (CSV) or field (JSON/XML), before repeated columns are merged."""

    name: str
    field_id: str | None = None


@dataclass(frozen=True, slots=True)
class ExportExtras:
    """Dates some exports carry beside the rows (JSON/XML); CSV leaves both empty."""

    sprint_windows: dict[str, tuple[dt.date, dt.date]] = field(default_factory=dict)
    release_dates: dict[str, dt.date] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ParsedExport:
    format: ImportFormat
    encoding: TextEncoding
    columns: list[RawColumn]
    rows: Rows
    extras: ExportExtras = field(default_factory=ExportExtras)


@dataclass(frozen=True, slots=True)
class ColumnGroup:
    """Raw columns sharing a normalised name or field id, merged into one Map-table row."""

    id: str
    name: str
    label: str
    field_id: str | None
    source_indexes: tuple[int, ...]
    samples: list[str]
    fill: float
