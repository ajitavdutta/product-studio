"""collect_warnings copy and order (IMP-10, IMP-11)."""

from typing import Any

from app.importers.jira.warnings import BuildCounts, collect_warnings
from app.schemas.imports import ImportColumn, ImportMapping

COLUMNS = [
    ImportColumn(id="sprint", name="Sprint", label="Sprint", samples=[], fill=1.0),
    ImportColumn(id="components", name="Components", label="Components", samples=[], fill=0.27),
]


def mapping(columns: dict[str, Any]) -> ImportMapping:
    return ImportMapping.model_validate({"columns": columns, "statusMap": {}, "name": "Payments"})


def counts(**overrides: Any) -> BuildCounts:
    values: dict[str, Any] = {
        "undated_items": 0,
        "undated_stories": 0,
        "teamless_issues": 0,
        "rolled_up": True,
        "unscheduled_tray": True,
        **overrides,
    }
    return BuildCounts(**values)


def test_IMP_11_fixture_warnings_in_order() -> None:
    found = counts(undated_items=5, undated_stories=1, teamless_issues=1)

    warnings = collect_warnings(found, mapping({"sprint": "sprint"}), COLUMNS)

    assert warnings == [
        "5 epics have no dates → Unscheduled",
        "1 issue has no dates → excluded from its epic's range",
        "1 issue has no team → Unassigned lane",
        '"Components" isn\'t mapped yet',
    ]


def test_IMP_11_no_warnings_when_counts_are_zero_and_all_mapped() -> None:
    all_mapped = mapping({"sprint": "sprint", "components": "ignore"})

    assert collect_warnings(counts(), all_mapped, COLUMNS) == []


def test_IMP_11_rollup_off_uses_issue_noun_and_tray_off_says_not_imported() -> None:
    found = counts(undated_items=3, rolled_up=False, unscheduled_tray=False)

    warnings = collect_warnings(
        found, mapping({"sprint": "sprint", "components": "ignore"}), COLUMNS
    )

    assert warnings == ["3 issues have no dates → not imported"]


def test_IMP_10_no_date_fields_warning_last() -> None:
    nothing_dated = mapping({"sprint": "ignore", "components": "ignore"})

    assert collect_warnings(counts(), nothing_dated, COLUMNS) == [
        "Neither Start/End nor Sprint is mapped, so every item will go to Unscheduled"
    ]
