"""Read a Jira XML export (`<rss><channel><item>`) into raw columns and rows (IMP-1, NF-3).

Parsed incrementally with defusedxml, which refuses entity declarations and external
references, so a "billion laughs" file is rejected rather than expanded. Each `<item>` is
dropped from the tree once read, so memory stays flat however many issues there are.

Leaf child tags become columns, named as Jira's CSV export names them (`type` → `Issue Type`)
so templates and suggestions work the same for both formats; other tags keep their own name.
`<labels><label>…` gives one column with a value per label, and each
`<customfields><customfield id=…>` gives a column named by its `<customfieldname>` with
`field_id` set to its id. Repeated tags (`<component>` twice) give repeated cell values.
"""

import io
import xml.etree.ElementTree as ElementTree
from typing import Final

import defusedxml.ElementTree as SafeElementTree
from defusedxml import DefusedXmlException

from app.importers.jira.detect import EMPTY_EXPORT_MESSAGE
from app.importers.jira.types import ParsedExport, RawColumn, Rows
from app.schemas.imports import TextEncoding
from app.services.errors import InvalidInputError

FORBIDDEN_FEATURES_MESSAGE: Final = (
    "This XML file uses features we can't accept. "
    "Export it from Jira again without editing it, and upload the new file."
)
UNREADABLE_XML_MESSAGE: Final = (
    "This XML file couldn't be read. Export it from Jira again and upload the new file."
)
NOT_JIRA_XML_MESSAGE: Final = (
    "This XML file isn't a Jira issue export. Use Export → XML from Jira's issue search."
)

# Jira XML tag → the column name Jira's CSV export uses for the same field.
CSV_NAME_BY_TAG: Final[dict[str, str]] = {
    "key": "Issue key",
    "summary": "Summary",
    "type": "Issue Type",
    "status": "Status",
    "priority": "Priority",
    "resolution": "Resolution",
    "assignee": "Assignee",
    "reporter": "Reporter",
    "created": "Created",
    "updated": "Updated",
    "resolved": "Resolved",
    "due": "Due date",
    "parent": "Parent",
    "fixVersion": "Fix versions",
    "version": "Affects versions",
    "component": "Components",
    "labels": "Labels",
    "description": "Description",
    "environment": "Environment",
}
# `title` is "[KEY] Summary" and would be matched as Title; `link` is the issue's URL.
SKIPPED_TAGS: Final = frozenset({"title", "link"})
LABELS_TAG: Final = "labels"
CUSTOM_FIELDS_TAG: Final = "customfields"
_CHANNEL_PATH: Final = ("rss", "channel")


class _ColumnIndex:
    """Columns in first-seen order, looked up by tag or custom-field id."""

    def __init__(self) -> None:
        self.columns: list[RawColumn] = []
        self._position_by_identity: dict[str, int] = {}

    def position(self, identity: str, column: RawColumn) -> int:
        if identity not in self._position_by_identity:
            self._position_by_identity[identity] = len(self.columns)
            self.columns.append(column)
        return self._position_by_identity[identity]


def read_xml(text: str, encoding: TextEncoding) -> ParsedExport:
    """Parse decoded Jira RSS XML into a `ParsedExport` with format `xml`.

    Every row has one cell list per column, padded with `[]` for fields an issue lacks.
    `extras` stays empty: the XML view carries sprint and version names but not their dates.
    Raises `InvalidInputError` for forbidden XML features (entities, external references),
    malformed XML, a document that isn't `<rss><channel>`, or one with no `<item>`.
    """
    index = _ColumnIndex()
    rows: Rows = []
    try:
        _collect_items(text, index, rows)
    except DefusedXmlException as error:
        raise InvalidInputError(FORBIDDEN_FEATURES_MESSAGE) from error
    except ElementTree.ParseError as error:
        raise InvalidInputError(UNREADABLE_XML_MESSAGE) from error
    if not rows:
        raise InvalidInputError(EMPTY_EXPORT_MESSAGE)
    width = len(index.columns)
    padded: Rows = [row + [[] for _ in range(width - len(row))] for row in rows]
    return ParsedExport(format="xml", encoding=encoding, columns=index.columns, rows=padded)


def _collect_items(text: str, index: _ColumnIndex, rows: Rows) -> None:
    open_elements: list[ElementTree.Element] = []
    saw_channel = False
    for event, element in SafeElementTree.iterparse(io.StringIO(text), events=("start", "end")):
        if event == "start":
            if not open_elements and element.tag != _CHANNEL_PATH[0]:
                raise InvalidInputError(NOT_JIRA_XML_MESSAGE)
            open_elements.append(element)
            saw_channel = saw_channel or _tags(open_elements) == _CHANNEL_PATH
            continue
        open_elements.pop()
        if element.tag == "item" and _tags(open_elements) == _CHANNEL_PATH:
            rows.append(_read_item(element, index))
            # Drop the finished item so the tree never holds more than one issue.
            open_elements[-1].remove(element)
    if not saw_channel:
        raise InvalidInputError(NOT_JIRA_XML_MESSAGE)


def _tags(elements: list[ElementTree.Element]) -> tuple[str, ...]:
    return tuple(element.tag for element in elements)


def _read_item(item: ElementTree.Element, index: _ColumnIndex) -> list[list[str]]:
    row: list[list[str]] = []
    for child in item:
        if child.tag in SKIPPED_TAGS:
            continue
        if child.tag == CUSTOM_FIELDS_TAG:
            for custom_field in child.iter("customfield"):
                _add_custom_field(custom_field, index, row)
        elif child.tag == LABELS_TAG:
            _add_values(row, index.position(LABELS_TAG, _tag_column(LABELS_TAG)), _texts(child))
        elif len(child) == 0:
            _add_values(row, index.position(child.tag, _tag_column(child.tag)), _texts(child))
        # Other nested elements (comments, attachments, issue links) are not fields.
    return row


def _add_custom_field(
    custom_field: ElementTree.Element, index: _ColumnIndex, row: list[list[str]]
) -> None:
    field_id = custom_field.get("id")
    name = (custom_field.findtext("customfieldname") or "").strip() or field_id
    if not name:
        return
    identity = f"customfield:{field_id or name}"
    position = index.position(identity, RawColumn(name=name, field_id=field_id))
    values = [
        text
        for value in custom_field.iter("customfieldvalue")
        if (text := (value.text or "").strip())
    ]
    _add_values(row, position, values)


def _tag_column(tag: str) -> RawColumn:
    return RawColumn(name=CSV_NAME_BY_TAG.get(tag, tag))


def _texts(element: ElementTree.Element) -> list[str]:
    """The element's own text, or its children's texts when it is a list such as `<labels>`."""
    if len(element) == 0:
        text = (element.text or "").strip()
        return [text] if text else []
    return [text for child in element if (text := (child.text or "").strip())]


def _add_values(row: list[list[str]], position: int, values: list[str]) -> None:
    while len(row) <= position:
        row.append([])
    row[position].extend(values)
