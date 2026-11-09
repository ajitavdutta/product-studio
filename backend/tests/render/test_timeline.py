"""Backend timeline maths against the shared fixtures in docs/fixtures/timeline (ADR-3)."""

import datetime as dt
import json
from dataclasses import asdict
from typing import Any

import pytest

from app.render.timeline import (
    Column,
    DateRange,
    View,
    boundaries,
    columns,
    current_sprint,
    default_range,
    program_increments,
    sprint_date_label,
)
from app.schemas.documents import ProgramIncrement, RoadmapDocument
from tests.conftest import REPO_ROOT

FIXTURES_DIR = REPO_ROOT / "docs" / "fixtures" / "timeline"
VIEWS: tuple[View, ...] = ("sprints", "months", "pis")
OPTIONAL_COLUMN_FLAGS = ("current", "ip", "clipped")


def load_fixture(view: View) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads((FIXTURES_DIR / f"{view}.json").read_text(encoding="utf-8"))
    return loaded


def fixture_pis(fixture: dict[str, Any]) -> list[ProgramIncrement]:
    return [
        ProgramIncrement(
            id=f"pi-{index}",
            name=pi["name"],
            start=dt.date.fromisoformat(pi["start"]),
            sprints=pi["sprints"],
            ip_sprint=pi["ipSprint"],
        )
        for index, pi in enumerate(fixture["pis"])
    ]


def fixture_range(fixture: dict[str, Any]) -> DateRange:
    return DateRange(
        dt.date.fromisoformat(fixture["range"]["start"]),
        dt.date.fromisoformat(fixture["range"]["endExclusive"]),
    )


def column_as_fixture(column: Column) -> dict[str, Any]:
    """Our column in the fixture's shape: absent `dates`/`sub` and false flags are omitted."""
    raw = asdict(column)
    shaped: dict[str, Any] = {
        "row": raw["row"],
        "label": raw["label"],
        "start": raw["start"].isoformat(),
        "endExclusive": raw["end_exclusive"].isoformat(),
    }
    shaped.update({key: raw[key] for key in ("dates", "sub") if raw[key] is not None})
    shaped.update({key: True for key in OPTIONAL_COLUMN_FLAGS if raw[key]})
    return shaped


def normalised_fixture_columns(fixture: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {key: value for key, value in column.items() if value is not False}
        for column in fixture["columns"]
    ]


def computed_columns(view: View) -> list[dict[str, Any]]:
    fixture = load_fixture(view)
    pis = program_increments(fixture_pis(fixture), sprint_length_days=14)
    today = dt.date.fromisoformat(fixture["today"])
    return [column_as_fixture(c) for c in columns(view, fixture_range(fixture), pis, today)]


@pytest.fixture
def example_document(roadmap_example: dict[str, Any]) -> RoadmapDocument:
    return RoadmapDocument.model_validate(roadmap_example)


def test_RM_4_fixture_pi_ends_match_cadence() -> None:
    fixture = load_fixture("sprints")
    pis = program_increments(fixture_pis(fixture), sprint_length_days=14)
    expected_inclusive_ends = [pi["end"] for pi in fixture["pis"]]
    assert [
        (pi.end_exclusive - dt.timedelta(days=1)).isoformat() for pi in pis
    ] == expected_inclusive_ends


def test_RM_5_sprint_columns_match_fixture() -> None:
    assert computed_columns("sprints") == normalised_fixture_columns(load_fixture("sprints"))


def test_RM_5_compact_dates_match_fixture() -> None:
    fixture = load_fixture("sprints")
    sprints = [s for pi in program_increments(fixture_pis(fixture), 14) for s in pi.sprints]
    by_name = {f"{s.pi_name} {s.label}": s for s in sprints}
    for case in fixture["compactDates"]:
        sprint = by_name[case["sprint"].removesuffix(" (crosses months)")]
        label = sprint_date_label(sprint.start, sprint.end_exclusive, case["colW"])
        assert label == case["label"], f"{case['sprint']} at colW {case['colW']}"


def test_RM_6_month_columns_match_fixture() -> None:
    assert computed_columns("months") == normalised_fixture_columns(load_fixture("months"))


def test_RM_7_pi_columns_match_fixture() -> None:
    assert computed_columns("pis") == normalised_fixture_columns(load_fixture("pis"))


@pytest.mark.parametrize("view", VIEWS)
def test_RM_4_boundaries_match_fixture(view: View) -> None:
    fixture = load_fixture(view)
    pis = program_increments(fixture_pis(fixture), sprint_length_days=14)
    computed = {
        (b.date.isoformat(), b.strong) for b in boundaries(view, fixture_range(fixture), pis)
    }
    expected = {(b["date"], b["strong"]) for b in fixture["boundaries"]}
    assert computed == expected


def test_RM_4_ip_sprint_label_and_custom_sprint_names() -> None:
    named = ProgramIncrement(
        id="pi-named",
        name="PI 9",
        start=dt.date(2027, 1, 4),
        sprints=4,
        ip_sprint=True,
        sprint_names=["Alpha", "Beta"],
    )
    plain = ProgramIncrement(
        id="pi-plain", name="PI 10", start=dt.date(2027, 3, 1), sprints=2, ip_sprint=False
    )

    named_pi, plain_pi = program_increments([plain, named], sprint_length_days=7)

    assert [(s.label, s.tick_label, s.ip) for s in named_pi.sprints] == [
        ("Alpha", "Alpha", False),
        ("Beta", "Beta", False),
        ("S3", "S3", False),
        ("S4 · IP", "IP", True),
    ]
    assert [(s.label, s.ip) for s in plain_pi.sprints] == [("S1", False), ("S2", False)]
    assert named_pi.end_exclusive == dt.date(2027, 2, 1)


@pytest.mark.parametrize("view", VIEWS)
def test_RM_4_default_range_from_example_document(
    view: View, example_document: RoadmapDocument
) -> None:
    computed = default_range(view, example_document.timeline, example_document.items)
    assert computed == fixture_range(load_fixture(view))


@pytest.mark.parametrize(
    "today",
    [dt.date(2026, 10, 4), dt.date(2027, 6, 14), dt.date(2028, 1, 1)],
    ids=["before-first-pi", "day-after-last-pi", "long-after"],
)
def test_RM_4_no_current_sprint_outside_pis(today: dt.date) -> None:
    pis = program_increments(fixture_pis(load_fixture("sprints")), sprint_length_days=14)
    assert current_sprint(pis, today) is None


def test_RM_4_current_sprint_on_frozen_today() -> None:
    pis = program_increments(fixture_pis(load_fixture("sprints")), sprint_length_days=14)
    sprint = current_sprint(pis, dt.date(2026, 11, 6))
    assert sprint is not None and (sprint.pi_name, sprint.label) == ("PI 4 · 2026", "S3")


def test_RM_4_no_current_sprint_in_gap_between_pis() -> None:
    first = ProgramIncrement(
        id="a", name="A", start=dt.date(2027, 1, 4), sprints=1, ip_sprint=False
    )
    later = ProgramIncrement(
        id="b", name="B", start=dt.date(2027, 2, 1), sprints=1, ip_sprint=False
    )
    pis = program_increments([first, later], sprint_length_days=14)
    assert current_sprint(pis, dt.date(2027, 1, 20)) is None


def test_RM_6_months_range_without_scheduled_items(example_document: RoadmapDocument) -> None:
    computed = default_range("months", example_document.timeline, [])
    assert computed == DateRange(dt.date(2026, 11, 1), dt.date(2026, 12, 1))


def test_RM_6_partial_month_column_is_clipped() -> None:
    month_columns = columns(
        "months", DateRange(dt.date(2026, 11, 15), dt.date(2027, 1, 10)), [], dt.date(2026, 11, 6)
    )
    assert [(c.label, c.start.isoformat(), c.clipped) for c in month_columns] == [
        ("Nov 2026", "2026-11-15", True),
        ("Dec", "2026-12-01", False),
        ("Jan 2027", "2027-01-01", True),
    ]


def test_RM_5_sprints_range_stops_when_pis_run_out(example_document: RoadmapDocument) -> None:
    timeline = example_document.timeline.model_copy(update={"start": dt.date(2027, 4, 1)})
    computed = default_range("sprints", timeline, example_document.items)
    assert computed == DateRange(dt.date(2027, 4, 5), dt.date(2027, 6, 14))
