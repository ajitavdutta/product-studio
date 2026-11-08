import datetime as dt
import json

import pytest

from app.importers.jira.json_reader import read_json
from app.importers.jira.types import ParsedExport
from app.services.errors import InvalidInputError
from tests.importers.builders import (
    STORY_POINTS_FIELD_ID,
    build_rest_json,
    load_fixture_rows,
    sprint_window,
)


def _read(payload: bytes) -> ParsedExport:
    return read_json(payload.decode("utf-8"), "utf-8-sig")


def _column_values(parsed: ParsedExport, name: str) -> list[list[str]]:
    position = [column.name for column in parsed.columns].index(name)
    return [row[position] for row in parsed.rows]


def test_IMP_1_json_names_expansion_maps_customfield_10016_to_story_points() -> None:
    parsed = _read(build_rest_json(load_fixture_rows(), with_names=True))

    story_points = [column for column in parsed.columns if column.name == "Story Points"]

    assert [column.field_id for column in story_points] == [STORY_POINTS_FIELD_ID]


def test_IMP_1_json_without_names_uses_field_id() -> None:
    parsed = _read(build_rest_json(load_fixture_rows(), with_names=False))

    names = {column.name for column in parsed.columns}

    assert {STORY_POINTS_FIELD_ID, "summary", "issuetype"} <= names


def test_IMP_1_json_key_becomes_issue_key_column_and_rows_match_fixture() -> None:
    rows = load_fixture_rows()
    parsed = _read(build_rest_json(rows, with_names=True))

    keys = _column_values(parsed, "Issue key")

    assert keys == [row["Issue key"] for row in rows]


def test_IMP_1_json_values_flatten_objects_and_whole_number_floats() -> None:
    parsed = _read(build_rest_json(load_fixture_rows(), with_names=True))

    first_story = parsed.rows[1]
    by_name = dict(zip([column.name for column in parsed.columns], first_story, strict=True))

    assert (by_name["Issue Type"], by_name["Parent"], by_name["Team"], by_name["Story Points"]) == (
        ["Story"],
        ["PAY-142"],
        ["Checkout"],
        ["8"],
    )


def test_IMP_6_json_list_values_become_repeated_cells() -> None:
    rows = load_fixture_rows()
    parsed = _read(build_rest_json(rows, with_names=True))

    sprints = _column_values(parsed, "Sprint")

    assert sprints == [row["Sprint"] for row in rows]


def test_IMP_1_json_sprint_objects_fill_sprint_windows() -> None:
    parsed = _read(build_rest_json(load_fixture_rows(), with_names=True))

    windows = parsed.extras.sprint_windows

    assert (
        windows["PAY Sprint 25"]
        == sprint_window("PAY Sprint 25")
        == (
            dt.date(2026, 11, 16),
            dt.date(2026, 11, 29),
        )
    )


def test_IMP_1_json_fix_version_release_date_fills_release_dates() -> None:
    payload = {
        "issues": [
            {
                "key": "PAY-1",
                "fields": {"fixVersions": [{"name": "2027.1", "releaseDate": "2027-03-31"}]},
            }
        ]
    }

    parsed = read_json(json.dumps(payload), "utf-8-sig")

    assert parsed.extras.release_dates == {"2027.1": dt.date(2027, 3, 31)}


def test_IMP_1_json_reports_format_encoding_and_pads_missing_fields() -> None:
    payload = {
        "issues": [
            {"key": "PAY-1", "fields": {"summary": "One"}},
            {"key": "PAY-2", "fields": {"labels": ["a"]}},
        ]
    }

    parsed = read_json(json.dumps(payload), "cp1252")

    assert (parsed.format, parsed.encoding, parsed.rows) == (
        "json",
        "cp1252",
        [[["PAY-1"], ["One"], []], [["PAY-2"], [], ["a"]]],
    )


@pytest.mark.parametrize(
    "text",
    [
        '{"startAt": 0, "total": 0}',
        '{"issues": "none"}',
        "[1, 2, 3]",
    ],
)
def test_IMP_1_json_without_issues_rejected(text: str) -> None:
    with pytest.raises(InvalidInputError, match="no Jira issues"):
        read_json(text, "utf-8-sig")


def test_IMP_1_json_empty_issues_rejected() -> None:
    with pytest.raises(InvalidInputError, match="no issues in it"):
        read_json('{"issues": []}', "utf-8-sig")


def test_IMP_1_json_malformed_text_rejected_in_plain_language() -> None:
    with pytest.raises(InvalidInputError, match="couldn't be read"):
        read_json('{"issues": [', "utf-8-sig")


def test_IMP_1_json_issue_that_is_not_an_object_rejected() -> None:
    with pytest.raises(InvalidInputError, match="Issue 2 in this JSON file"):
        read_json('{"issues": [{"key": "PAY-1"}, "PAY-2"]}', "utf-8-sig")
