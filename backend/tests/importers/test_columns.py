from app.importers.jira.columns import merge_repeated_columns, value_for, values_for
from app.importers.jira.types import ColumnGroup, ParsedExport, RawColumn, Rows


def parsed(columns: list[RawColumn], rows: Rows) -> ParsedExport:
    return ParsedExport(format="csv", encoding="utf-8-sig", columns=columns, rows=rows)


SPRINTS = parsed(
    [RawColumn("Issue key"), RawColumn("Sprint"), RawColumn("Sprint"), RawColumn("Sprint")],
    [
        [["PAY-1"], ["PAY Sprint 24"], ["PAY Sprint 25"], []],
        [["PAY-2"], ["PAY Sprint 26"], [], []],
        [["PAY-3"], [], [], []],
    ],
)


def group_named(groups: list[ColumnGroup], group_id: str) -> ColumnGroup:
    return next(group for group in groups if group.id == group_id)


def test_IMP_6_repeated_sprint_columns_merge_into_one_group() -> None:
    groups = merge_repeated_columns(SPRINTS)

    assert [(group.id, group.source_indexes) for group in groups] == [
        ("issue key", (0,)),
        ("sprint", (1, 2, 3)),
    ]


def test_IMP_6_sprint_keeps_latest_non_empty() -> None:
    sprint = group_named(merge_repeated_columns(SPRINTS), "sprint")

    assert [value_for(sprint, row) for row in SPRINTS.rows] == [
        "PAY Sprint 25",
        "PAY Sprint 26",
        None,
    ]


def test_IMP_6_sprint_history_kept_in_header_order() -> None:
    sprint = group_named(merge_repeated_columns(SPRINTS), "sprint")

    assert values_for(sprint, SPRINTS.rows[0]) == ["PAY Sprint 24", "PAY Sprint 25"]


def test_IMP_6_labels_and_components_join_into_list() -> None:
    export = parsed(
        [RawColumn("Labels"), RawColumn("Components"), RawColumn("Labels")],
        [[["roadmap"], ["Wallet", "Cards"], ["h1-2027"]]],
    )
    groups = merge_repeated_columns(export)
    row = export.rows[0]

    assert [values_for(group, row) for group in groups] == [
        ["roadmap", "h1-2027"],
        ["Wallet", "Cards"],
    ]


def test_IMP_6_fill_and_samples_count_merged_cells() -> None:
    sprint = group_named(merge_repeated_columns(SPRINTS), "sprint")

    assert (sprint.fill, sprint.samples) == (
        2 / 3,
        ["PAY Sprint 24", "PAY Sprint 25", "PAY Sprint 26"],
    )


def test_IMP_6_samples_capped_at_five() -> None:
    export = parsed([RawColumn("Summary")], [[[f"Item {n}"]] for n in range(8)])

    assert merge_repeated_columns(export)[0].samples == [f"Item {n}" for n in range(5)]


def test_IMP_6_same_field_id_merges_and_id_is_field_id() -> None:
    export = parsed(
        [RawColumn("Story Points", "customfield_10016"), RawColumn("SP", "customfield_10016")],
        [[["3"], []]],
    )

    [group] = merge_repeated_columns(export)

    assert (group.id, group.label, group.source_indexes) == (
        "customfield_10016",
        "Story Points",
        (0, 1),
    )


def test_IMP_4_label_drops_custom_field_wrapper() -> None:
    export = parsed([RawColumn("Custom field (Story Points)")], [[["3"]]])

    [group] = merge_repeated_columns(export)

    assert (group.id, group.name, group.label) == (
        "story points",
        "Custom field (Story Points)",
        "Story Points",
    )


def test_IMP_6_no_rows_gives_zero_fill() -> None:
    [group] = merge_repeated_columns(parsed([RawColumn("Summary")], []))

    assert (group.fill, group.samples) == (0.0, [])


def test_IMP_6_blank_values_do_not_count_as_filled() -> None:
    [group] = merge_repeated_columns(parsed([RawColumn("Summary")], [[["  "]], [["Login"]]]))

    assert group.fill == 0.5
