import pytest

from app.importers.jira.names import (
    ALIASES,
    STANDARD_NAMES,
    display_label,
    is_never_mapped,
    normalise_name,
)


def test_IMP_5_normalise_strips_custom_field_wrapper() -> None:
    assert normalise_name("Custom field (Start date)") == "start date"


def test_IMP_5_normalise_strips_trailing_brackets_and_collapses_space() -> None:
    assert normalise_name("  Story   Points [Number] ") == "story points"


def test_IMP_5_normalise_strips_brackets_inside_custom_field_wrapper() -> None:
    assert normalise_name("Custom field (Team [Team])") == "team"


def test_IMP_5_normalise_keeps_inner_parentheses() -> None:
    assert normalise_name("Fix Version/s") == "fix version/s"


def test_IMP_4_display_label_drops_wrapper_but_keeps_case() -> None:
    assert display_label("Custom field (Story Points)") == "Story Points"


def test_IMP_4_display_label_leaves_plain_header_alone() -> None:
    assert display_label("Issue Type") == "Issue Type"


@pytest.mark.parametrize("name", ["Created", "Σ Time Spent", "Last Viewed"])
def test_IMP_5_never_map_columns(name: str) -> None:
    assert is_never_mapped(normalise_name(name))


def test_IMP_5_ordinary_column_is_mappable() -> None:
    assert not is_never_mapped(normalise_name("Custom field (Start date)"))


def test_IMP_5_name_tables_are_already_normalised() -> None:
    names = [*STANDARD_NAMES, *(alias for aliases in ALIASES.values() for alias in aliases)]

    assert [name for name in names if normalise_name(name) != name] == []
