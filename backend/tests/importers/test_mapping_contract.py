from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.imports import ImportColumn, ImportMapping, check_mapping_columns


def column(column_id: str, label: str) -> ImportColumn:
    return ImportColumn(id=column_id, name=label, label=label, samples=[], fill=1.0)


COLUMNS = [
    column("start date", "Start date"),
    column("target start", "Target start"),
    column("parent", "Parent"),
    column("epic link", "Epic Link"),
]


def mapping(**overrides: Any) -> ImportMapping:
    body: dict[str, Any] = {"columns": {}, "statusMap": {}, "name": "Payments", **overrides}
    return ImportMapping.model_validate(body)


def first_message(error: ValidationError) -> str:
    return str(error.errors()[0]["msg"]).removeprefix("Value error, ")


def test_IMP_5_field_mapped_twice_is_rejected_with_labels() -> None:
    twice = mapping(columns={"start date": "start", "target start": "start"})

    with pytest.raises(ValueError) as raised:
        check_mapping_columns(twice, COLUMNS)

    assert str(raised.value) == "Two columns are mapped to Start: “Start date” and “Target start”"


def test_IMP_5_parent_and_epic_link_may_both_map_to_epic() -> None:
    both = mapping(columns={"parent": "epic", "epic link": "epic"})

    check_mapping_columns(both, COLUMNS)


def test_IMP_5_unknown_column_id_is_rejected() -> None:
    unknown = mapping(columns={"priority": "ignore"})

    with pytest.raises(ValueError, match="This import has no column “priority”"):
        check_mapping_columns(unknown, COLUMNS)


def test_IMP_7_unknown_status_id_is_rejected() -> None:
    with pytest.raises(ValidationError) as raised:
        mapping(statusMap={"In QA": "testing"})

    assert first_message(raised.value) == "“In QA” is mapped to an unknown status “testing”"


def test_IMP_7_custom_status_id_is_accepted() -> None:
    custom = {"id": "in-qa", "name": "In QA", "color": "teal"}

    accepted = mapping(statusMap={"In QA": "in-qa"}, customStatuses=[custom])

    assert accepted.status_map == {"In QA": "in-qa"}


def test_IMP_7_custom_status_cannot_reuse_a_default_id() -> None:
    custom = {"id": "done", "name": "Shipped", "color": "teal"}

    with pytest.raises(ValidationError) as raised:
        mapping(customStatuses=[custom])

    assert first_message(raised.value) == "A new status can't use the id “done”; it's taken"


def test_IMP_8_rollup_rules_default_to_the_spec() -> None:
    rules = mapping().rollup

    assert (
        rules.roll_up_stories,
        rules.use_sprint_dates,
        rules.unscheduled_tray,
        rules.fix_versions_as_milestones,
    ) == (True, True, True, False)
