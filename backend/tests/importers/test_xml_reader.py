import pytest

from app.importers.jira.types import ParsedExport, RawColumn
from app.importers.jira.xml_reader import read_xml
from app.services.errors import InvalidInputError
from tests.importers.builders import (
    STORY_POINTS_FIELD_ID,
    TEAM_FIELD_ID,
    build_rss_xml,
    load_fixture_rows,
)

BILLION_LAUGHS = """<?xml version="1.0"?>
<!DOCTYPE rss [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<rss><channel><item><summary>&lol3;</summary></item></channel></rss>"""

EXTERNAL_ENTITY = """<?xml version="1.0"?>
<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]>
<rss><channel><item><summary>&secret;</summary></item></channel></rss>"""


def _read(payload: bytes) -> ParsedExport:
    return read_xml(payload.decode("utf-8"), "utf-8-sig")


def _column_values(parsed: ParsedExport, name: str) -> list[list[str]]:
    position = [column.name for column in parsed.columns].index(name)
    return [row[position] for row in parsed.rows]


def test_IMP_1_xml_customfield_named_by_customfieldname_with_id() -> None:
    parsed = _read(build_rss_xml(load_fixture_rows()))

    custom = [column for column in parsed.columns if column.field_id]

    assert {
        RawColumn("Story Points", STORY_POINTS_FIELD_ID),
        RawColumn("Team", TEAM_FIELD_ID),
    } <= set(custom)


def test_IMP_1_xml_tags_use_jira_csv_column_names_and_skip_title_and_link() -> None:
    parsed = _read(build_rss_xml(load_fixture_rows()))

    names = [column.name for column in parsed.columns if column.field_id is None]

    assert names[:4] == ["Issue key", "Summary", "Issue Type", "Status"] and not (
        {"title", "link"} & set(names)
    )


def test_IMP_1_xml_rows_match_fixture_keys_and_pad_missing_fields() -> None:
    rows = load_fixture_rows()
    parsed = _read(build_rss_xml(rows))

    keys = _column_values(parsed, "Issue key")

    assert keys == [row["Issue key"] for row in rows] and all(
        len(row) == len(parsed.columns) for row in parsed.rows
    )


def test_IMP_6_xml_repeated_component_tags_become_repeated_cells() -> None:
    xml = (
        "<rss><channel><item><key>PAY-1</key>"
        "<component>Wallet</component><component>Cards</component>"
        "</item></channel></rss>"
    )

    parsed = read_xml(xml, "utf-8-sig")

    assert (parsed.columns, parsed.rows) == (
        [RawColumn("Issue key"), RawColumn("Components")],
        [[["PAY-1"], ["Wallet", "Cards"]]],
    )


def test_IMP_6_xml_labels_and_repeated_sprint_values_become_repeated_cells() -> None:
    rows = load_fixture_rows()
    parsed = _read(build_rss_xml(rows))

    labels_and_sprints = (_column_values(parsed, "Labels"), _column_values(parsed, "Sprint"))

    assert labels_and_sprints == ([row["Labels"] for row in rows], [row["Sprint"] for row in rows])


def test_IMP_1_xml_reports_format_and_encoding_with_no_extras() -> None:
    parsed = read_xml("<rss><channel><item><key>PAY-1</key></item></channel></rss>", "cp1252")

    assert (parsed.format, parsed.encoding, parsed.extras.sprint_windows) == ("xml", "cp1252", {})


def test_NF_3_xml_entity_expansion_rejected() -> None:
    with pytest.raises(InvalidInputError, match="This XML file uses features we can't accept"):
        read_xml(BILLION_LAUGHS, "utf-8-sig")


def test_NF_3_xml_external_entity_rejected() -> None:
    with pytest.raises(InvalidInputError, match="This XML file uses features we can't accept"):
        read_xml(EXTERNAL_ENTITY, "utf-8-sig")


def test_IMP_1_xml_malformed_rejected_in_plain_language() -> None:
    with pytest.raises(InvalidInputError, match="couldn't be read"):
        read_xml("<rss><channel><item><key>PAY-1</key>", "utf-8-sig")


@pytest.mark.parametrize(
    "xml",
    ["<html><body>Hello</body></html>", "<rss><item><key>PAY-1</key></item></rss>"],
)
def test_IMP_1_xml_that_is_not_a_jira_export_rejected(xml: str) -> None:
    with pytest.raises(InvalidInputError, match="isn't a Jira issue export"):
        read_xml(xml, "utf-8-sig")


def test_IMP_1_xml_without_items_rejected() -> None:
    with pytest.raises(InvalidInputError, match="no issues in it"):
        read_xml("<rss><channel><title>Jira</title></channel></rss>", "utf-8-sig")
