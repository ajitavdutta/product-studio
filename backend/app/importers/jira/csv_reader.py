"""Read a Jira CSV export into raw columns and rows (IMP-1, IMP-6, NF-3).

The text is read row by row through `csv.reader`; nothing is evaluated. Repeated headers
(`Sprint, Sprint`) stay separate raw columns here and are merged later by `columns.py`.
"""

import csv
import io
from collections.abc import Iterator
from itertools import islice
from typing import Final

from app.importers.jira.detect import EMPTY_EXPORT_MESSAGE
from app.importers.jira.types import ParsedExport, RawColumn, Rows
from app.schemas.imports import TextEncoding
from app.services.errors import InvalidInputError

ALLOWED_DELIMITERS: Final = ",;"
DEFAULT_DELIMITER: Final = ","
# Lines handed to csv.Sniffer: enough to see the delimiter, few enough to stay fast.
SNIFF_LINES: Final = 20
NO_HEADER_MESSAGE: Final = "This CSV file has no header row"
_UTF8_BOM: Final = "﻿"


def read_csv(text: str, encoding: TextEncoding) -> ParsedExport:
    """Parse decoded CSV text. Each header cell becomes a `RawColumn`, in order.

    Every row gets one cell list per column: `[value]`, or `[]` for an empty cell. Short rows
    are padded, extra cells beyond the header are dropped, and blank lines are skipped.
    Raises `InvalidInputError` when there is no header, no rows, or the CSV is malformed.
    """
    text = text.removeprefix(_UTF8_BOM)
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=_sniff_delimiter(text))
    try:
        header = next(reader, None)
        if header is None or not any(cell.strip() for cell in header):
            raise InvalidInputError(NO_HEADER_MESSAGE)
        columns = [RawColumn(name=cell.strip()) for cell in header]
        rows = _read_rows(reader, len(columns))
    except csv.Error as exc:
        raise InvalidInputError(
            f"We couldn't read line {reader.line_num} of this CSV file. "
            "Export it from Jira again and retry."
        ) from exc
    if not rows:
        raise InvalidInputError(EMPTY_EXPORT_MESSAGE)
    return ParsedExport(format="csv", encoding=encoding, columns=columns, rows=rows)


def _sniff_delimiter(text: str) -> str:
    sample = "".join(islice(io.StringIO(text, newline=""), SNIFF_LINES))
    try:
        return csv.Sniffer().sniff(sample, delimiters=ALLOWED_DELIMITERS).delimiter
    except csv.Error:
        return DEFAULT_DELIMITER


def _read_rows(reader: Iterator[list[str]], column_count: int) -> Rows:
    rows: Rows = []
    for record in reader:
        cells = [cell.strip() for cell in record[:column_count]]
        if not any(cells):
            continue
        cells.extend([""] * (column_count - len(cells)))
        rows.append([[cell] if cell else [] for cell in cells])
    return rows
