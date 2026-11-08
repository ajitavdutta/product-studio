"""The M2 acceptance gate: the payments CSV gives exactly `payments-export.expected.json`.

Runs the whole import path (upload → stored session → preview) with the suggested mapping,
as the Map page sends it before the user changes anything.
"""

import json
from typing import Any, Final

import pytest
from sqlalchemy.orm import Session

from app.documents.defaults import DEFAULT_STATUSES
from app.importers.jira.columns import value_for
from app.models import ImportSession
from app.schemas.documents import RoadmapDocument
from app.schemas.imports import ImportMapping, ImportPreview, ImportSessionRead
from app.schemas.mapping_templates import MappingTemplateCreate
from app.services import imports as service
from app.services.mapping_templates import create_template
from tests.conftest import REPO_ROOT
from tests.importers.builders import (
    EPIC_LINK_FIELD_ID,
    TEAM_FIELD_ID,
    build_rest_json,
    build_rss_xml,
    load_fixture_rows,
)

FIXTURE_DIR: Final = REPO_ROOT / "docs" / "fixtures" / "jira"
PAYMENTS_CSV: Final = FIXTURE_DIR / "payments-export.csv"
EXPECTED: Final[dict[str, Any]] = json.loads(
    (FIXTURE_DIR / "payments-export.expected.json").read_text(encoding="utf-8")
)
SAMPLE_CSV: Final = (
    REPO_ROOT / "backend" / "app" / "importers" / "jira" / "sample" / ("payments-export.csv")
)

# The fixture's Map-table labels → RoadmapField; the parenthesised notes are UI captions.
EXPECTED_FIELD_PREFIXES: Final = (
    ("Swimlane / Team", "team"),
    ("Epic", "epic"),
    ("Sprint", "sprint"),
    ("Tags", "tags"),
    ("Key", "key"),
    ("Title", "title"),
    ("Type", "type"),
    ("Status", "status"),
    ("Release", "release"),
    ("Points", "points"),
    ("Start", "start"),
    ("End", "end"),
)


def expected_field(label: str) -> str:
    return next(field for prefix, field in EXPECTED_FIELD_PREFIXES if label.startswith(prefix))


def suggested_mapping(read: ImportSessionRead) -> ImportMapping:
    return ImportMapping(
        columns={
            column.id: column.suggested_field
            for column in read.columns
            if column.suggested_field is not None
        },
        status_map={status.jira_status: status.status_id for status in read.statuses},
        name=read.suggested_name,
    )


def upload(db_session: Session, file_name: str, data: bytes) -> ImportSessionRead:
    return service.create_session(db_session, file_name, data, None)


def preview_of(db_session: Session, read: ImportSessionRead) -> ImportPreview:
    return service.preview(db_session, str(read.id), suggested_mapping(read))


@pytest.fixture
def csv_session(db_session: Session) -> ImportSessionRead:
    return upload(db_session, PAYMENTS_CSV.name, PAYMENTS_CSV.read_bytes())


@pytest.fixture
def csv_preview(db_session: Session, csv_session: ImportSessionRead) -> ImportPreview:
    return preview_of(db_session, csv_session)


def epic_summary(document: RoadmapDocument) -> list[dict[str, Any]]:
    lane_names = {lane.id: lane.name for lane in document.lanes}
    return [
        {
            "key": item.key,
            "title": item.title,
            "team": lane_names[item.lane_id],
            "start": item.start.isoformat() if item.start else None,
            "end": item.end.isoformat() if item.end else None,
            "issues": item.issues.model_dump(by_alias=True),
            "progress": item.progress,
        }
        for item in document.items
        if item.type == "Epic" and item.start is not None
    ]


def test_IMP_payments_csv_epics_match_expected(csv_preview: ImportPreview) -> None:
    assert epic_summary(csv_preview.document) == EXPECTED["epics"]


def test_IMP_payments_csv_unscheduled_match_expected(csv_preview: ImportPreview) -> None:
    unscheduled = [item.key for item in csv_preview.document.items if item.start is None]

    assert unscheduled == EXPECTED["unscheduled"]


def test_IMP_payments_csv_stories_without_dates_and_team(
    db_session: Session, csv_session: ImportSessionRead
) -> None:
    row = db_session.get(ImportSession, str(csv_session.id))
    assert row is not None
    data = service._import_data(row)
    by_field = {column.suggested_field: column.id for column in csv_session.columns}
    groups = {group.id: group for group in data.groups}

    def value(stored_row: list[list[str]], field: str) -> str | None:
        return value_for(groups[by_field[field]], stored_row)

    stories = [r for r in data.rows if value(r, "type") != "Epic"]
    undated = [
        value(r, "key") for r in stories if value(r, "start") is None and value(r, "end") is None
    ]
    teamless = [value(r, "key") for r in data.rows if value(r, "team") is None]

    assert (undated, teamless) == (EXPECTED["storiesWithoutDates"], EXPECTED["storiesWithoutTeam"])


def test_IMP_payments_csv_mapping_matches_expected(csv_session: ImportSessionRead) -> None:
    mapped = {
        column.name: column.suggested_field
        for column in csv_session.columns
        if column.suggested_field is not None
    }
    needs_choice = [
        column.label for column in csv_session.columns if column.suggested_field is None
    ]
    expected_mapping = {
        name: expected_field(label) for name, label in EXPECTED["expectedMapping"].items()
    }

    assert (mapped, csv_session.ignored_columns, needs_choice) == (
        expected_mapping,
        EXPECTED["notMapped"],
        EXPECTED["needsChoice"],
    )


def test_IMP_payments_csv_repeated_columns_merged(csv_session: ImportSessionRead) -> None:
    repeats = {column.name: column.repeat_count for column in csv_session.columns}

    assert (repeats["Sprint"], repeats["Labels"]) == (2, 2)


def test_IMP_payments_csv_status_mapping_matches_expected(
    csv_session: ImportSessionRead,
) -> None:
    names = {status.id: status.name for status in DEFAULT_STATUSES}
    mapping = {status.jira_status: names[status.status_id] for status in csv_session.statuses}

    assert mapping == EXPECTED["statusMapping"]


def test_IMP_payments_csv_warnings_exact(csv_preview: ImportPreview) -> None:
    assert csv_preview.warnings == EXPECTED["warnings"]


def test_IMP_payments_csv_file_format_encoding_rowcount(csv_session: ImportSessionRead) -> None:
    assert (
        csv_session.file_name,
        csv_session.format,
        csv_session.encoding,
        csv_session.row_count,
    ) == (EXPECTED["file"], EXPECTED["format"], EXPECTED["encoding"], EXPECTED["rowCount"])


@pytest.mark.parametrize(
    ("file_name", "with_names"),
    [("payments.json", True), ("payments-ids.json", False)],
    ids=["with-names", "without-names"],
)
def test_IMP_payments_json_gives_the_same_epics(
    db_session: Session, file_name: str, with_names: bool
) -> None:
    # Without `names` nothing says customfield_10001 is Team or customfield_10014 is Epic
    # Link; a saved template matched by field id supplies both (IMP-9).
    # With `names`, no template is needed.
    template_id = None
    if not with_names:
        template = create_template(
            db_session,
            MappingTemplateCreate(
                name="Payments",
                column_map={TEAM_FIELD_ID: "team", EPIC_LINK_FIELD_ID: "epic"},
                status_map={},
            ),
        )
        template_id = template.id
    data = build_rest_json(load_fixture_rows(), with_names=with_names)
    read = service.create_session(db_session, file_name, data, template_id)

    assert epic_summary(preview_of(db_session, read).document) == EXPECTED["epics"]


def test_IMP_payments_xml_gives_the_same_epics(db_session: Session) -> None:
    read = upload(db_session, "payments.xml", build_rss_xml(load_fixture_rows()))

    assert epic_summary(preview_of(db_session, read).document) == EXPECTED["epics"]


def test_bundled_sample_equals_fixture() -> None:
    assert SAMPLE_CSV.read_bytes() == PAYMENTS_CSV.read_bytes()
