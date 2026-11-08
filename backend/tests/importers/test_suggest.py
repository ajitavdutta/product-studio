import csv
from pathlib import Path

from app.importers.jira.columns import merge_repeated_columns
from app.importers.jira.suggest import classify, suggest_mapping
from app.importers.jira.types import ColumnGroup, ParsedExport, RawColumn
from app.schemas.imports import ImportColumn, RoadmapField

PAYMENTS_CSV = Path(__file__).parents[3] / "docs" / "fixtures" / "jira" / "payments-export.csv"


def groups_from(table: dict[str, list[str]]) -> list[ColumnGroup]:
    """Merged groups for a column-name → cell-values table; '' is an empty cell."""
    names = list(table)
    row_count = max(len(values) for values in table.values())
    rows = [
        [
            [table[name][row]] if row < len(table[name]) and table[name][row] else []
            for name in names
        ]
        for row in range(row_count)
    ]
    columns = [RawColumn(name) for name in names]
    export = ParsedExport(format="csv", encoding="utf-8-sig", columns=columns, rows=rows)
    return merge_repeated_columns(export)


def suggested(columns: list[ImportColumn]) -> dict[str, tuple[str | None, str | None]]:
    return {column.name: (column.suggested_field, column.confidence) for column in columns}


def test_IMP_5_exact_names_match_with_exact_confidence() -> None:
    groups = groups_from(
        {"Issue key": ["PAY-1"], "Summary": ["Login"], "Status": ["Done"], "Due date": [""]}
    )

    assert suggested(suggest_mapping(groups)) == {
        "Issue key": ("key", "exact"),
        "Summary": ("title", "exact"),
        "Status": ("status", "exact"),
        "Due date": ("end", "exact"),
    }


def test_IMP_5_custom_field_story_points_matches_points_by_alias() -> None:
    [column] = suggest_mapping(groups_from({"Custom field (Story Points)": ["3"]}))

    assert (column.suggested_field, column.confidence, column.label) == (
        "points",
        "alias",
        "Story Points",
    )


def test_IMP_5_issue_id_not_key_when_issue_key_present() -> None:
    columns = suggest_mapping(groups_from({"Issue key": ["PAY-1"], "Issue id": ["10001"]}))

    assert suggested(columns)["Issue id"] == (None, None)


def test_IMP_5_issue_id_is_key_when_no_issue_key() -> None:
    [column] = suggest_mapping(groups_from({"Issue id": ["10001"]}))

    assert (column.suggested_field, column.confidence) == ("key", "alias")


def test_IMP_5_status_category_not_status() -> None:
    [column] = suggest_mapping(groups_from({"Status Category": ["Done"]}))

    assert column.suggested_field is None


def test_IMP_5_sp_alias_is_whole_word_only() -> None:
    columns = suggest_mapping(groups_from({"Display order": ["High"], "SP": ["3"]}))

    assert suggested(columns) == {"Display order": (None, None), "SP": ("points", "alias")}


def test_IMP_5_longest_alias_wins() -> None:
    [column] = suggest_mapping(groups_from({"Parent key": ["PAY-1"]}))

    assert (column.suggested_field, column.confidence) == ("epic", "alias")


def test_IMP_5_sniffs_key_pattern_then_epic() -> None:
    groups = groups_from(
        {"Ref": ["PAY-1", "PAY-2", "PAY-3"], "Belongs to": ["PAY-9", "PAY-9", "RSK-4"]}
    )

    assert suggested(suggest_mapping(groups)) == {
        "Ref": ("key", "sniffed"),
        "Belongs to": ("epic", "sniffed"),
    }


def test_IMP_5_sniffs_dates_earlier_median_is_start() -> None:
    groups = groups_from(
        {
            "Finish": ["2026-12-01", "2026-12-15", "2027-01-10"],
            "Kickoff": ["16/Nov/26 12:00 AM", "30/Nov/26 9:00 AM", "14/Dec/26 12:00 AM"],
        }
    )

    assert suggested(suggest_mapping(groups)) == {
        "Finish": ("end", "sniffed"),
        "Kickoff": ("start", "sniffed"),
    }


def test_IMP_5_sniffs_numeric_dayfirst_dates() -> None:
    groups = groups_from({"Kickoff": ["16/11/2026", "30/11/2026", "14/12/2026"]})

    assert suggested(suggest_mapping(groups)) == {"Kickoff": ("start", "sniffed")}


def test_IMP_5_sniffs_sprint_and_points() -> None:
    groups = groups_from(
        {"Iteration": ["PAY Sprint 24", "S3", "Sprint 25"], "Size": ["3", "5", "0.5"]}
    )

    assert suggested(suggest_mapping(groups)) == {
        "Iteration": ("sprint", "sniffed"),
        "Size": ("points", "sniffed"),
    }


def test_IMP_5_large_numbers_not_sniffed_as_points() -> None:
    [column] = suggest_mapping(groups_from({"Ticket no": ["10001", "10002", "10003"]}))

    assert column.suggested_field is None


def test_IMP_5_never_sniffs_created() -> None:
    [column] = suggest_mapping(groups_from({"Created": ["20/Oct/26 12:00 AM"] * 3}))

    assert column.suggested_field is None


def test_IMP_5_fill_below_0_3_not_sniffed() -> None:
    [column] = suggest_mapping(groups_from({"Ref": ["PAY-1", "", "", "", ""]}))

    assert column.suggested_field is None


def test_IMP_5_each_field_used_once_except_epic() -> None:
    groups = groups_from(
        {
            "Start date": ["2026-11-16"],
            "Target start": ["2026-11-20"],
            "Parent": ["PAY-1"],
            "Epic Link": ["PAY-1"],
        }
    )

    assert suggested(suggest_mapping(groups)) == {
        "Start date": ("start", "alias"),
        "Target start": (None, None),
        "Parent": ("epic", "exact"),
        "Epic Link": ("epic", "exact"),
    }


def test_IMP_5_epic_link_and_parent_both_map_to_epic() -> None:
    columns = suggest_mapping(groups_from({"Parent": ["PAY-1"], "Epic Link": ["PAY-1"]}))

    assert [(c.suggested_field, c.note) for c in columns] == [
        ("epic", None),
        ("epic", "Used when Parent is empty"),
    ]


def test_IMP_5_epic_link_alone_has_no_note() -> None:
    [column] = suggest_mapping(groups_from({"Epic Link": ["PAY-1"]}))

    assert (column.suggested_field, column.note) == ("epic", None)


def test_IMP_5_team_falls_back_to_components_as_sniffed() -> None:
    groups = groups_from({"Issue key": ["PAY-1", "PAY-2"], "Components": ["Wallet", ""]})

    assert suggested(suggest_mapping(groups))["Components"] == ("team", "sniffed")


def test_IMP_5_atlassian_team_field_matches_team() -> None:
    export = ParsedExport(
        format="json",
        encoding="utf-8-sig",
        columns=[RawColumn("Team", "customfield_10001")],
        rows=[[["Checkout"]]],
    )

    [column] = suggest_mapping(merge_repeated_columns(export))

    assert (column.id, column.suggested_field) == ("customfield_10001", "team")


def test_IMP_4_components_listed_unmapped_when_team_taken() -> None:
    groups = groups_from({"Custom field (Team)": ["Checkout"], "Components": ["Wallet"]})

    listed, ignored = classify(suggest_mapping(groups))

    assert ([(c.name, c.suggested_field) for c in listed], ignored) == (
        [("Custom field (Team)", "team"), ("Components", None)],
        [],
    )


def test_IMP_4_priority_assignee_created_description_ignored() -> None:
    groups = groups_from(
        {
            "Summary": ["Login"],
            "Priority": ["High"],
            "Assignee": ["Asha"],
            "Created": ["20/Oct/26 12:00 AM"],
            "Description": ["Long text"],
        }
    )

    listed, ignored = classify(suggest_mapping(groups))

    assert ([c.name for c in listed], ignored) == (
        ["Summary"],
        ["Priority", "Assignee", "Created", "Description"],
    )


def test_IMP_9_template_entry_by_column_name_wins() -> None:
    groups = groups_from({"Components": ["Wallet"], "Labels": ["roadmap"]})
    template: dict[str, RoadmapField] = {"Components": "team", "Labels": "ignore"}

    assert suggested(suggest_mapping(groups, template)) == {
        "Components": ("team", "template"),
        "Labels": ("ignore", "template"),
    }


def test_IMP_9_template_entry_by_field_id_wins() -> None:
    export = ParsedExport(
        format="json",
        encoding="utf-8-sig",
        columns=[RawColumn("Story Points", "customfield_10016")],
        rows=[[["3"]]],
    )

    [column] = suggest_mapping(merge_repeated_columns(export), {"customfield_10016": "ignore"})

    assert (column.suggested_field, column.confidence) == ("ignore", "template")


def test_IMP_9_template_field_takes_precedence_over_exact_name() -> None:
    groups = groups_from({"Due date": ["2026-12-01"], "Target end": ["2026-12-05"]})

    columns = suggest_mapping(groups, {"Target end": "end"})

    assert suggested(columns) == {"Due date": (None, None), "Target end": ("end", "template")}


def payments_groups() -> list[ColumnGroup]:
    """The fixture read with the standard library, so this test doesn't depend on csv_reader."""
    with PAYMENTS_CSV.open(encoding="utf-8-sig", newline="") as handle:
        header, *cells = list(csv.reader(handle))
    rows = [[[cell] if cell else [] for cell in row] for row in cells]
    columns = [RawColumn(name) for name in header]
    export = ParsedExport(format="csv", encoding="utf-8-sig", columns=columns, rows=rows)
    return merge_repeated_columns(export)


def test_IMP_5_payments_fixture_mapping_matches_expected() -> None:
    listed, ignored = classify(suggest_mapping(payments_groups()))

    assert {c.name: c.suggested_field for c in listed} == {
        "Summary": "title",
        "Issue key": "key",
        "Issue Type": "type",
        "Status": "status",
        "Sprint": "sprint",
        "Fix versions": "release",
        "Labels": "tags",
        "Components": None,
        "Custom field (Story Points)": "points",
        "Custom field (Start date)": "start",
        "Due date": "end",
        "Parent": "epic",
        "Epic Link": "epic",
        "Custom field (Team)": "team",
    }


def test_IMP_4_payments_fixture_ignored_columns_match_expected() -> None:
    _, ignored = classify(suggest_mapping(payments_groups()))

    assert sorted(ignored) == sorted(["Issue id", "Priority", "Assignee", "Created", "Description"])


def test_IMP_6_payments_fixture_repeat_counts() -> None:
    listed, _ = classify(suggest_mapping(payments_groups()))

    repeated = {c.name: c.repeat_count for c in listed if c.repeat_count > 1}

    assert repeated == {"Sprint": 2, "Labels": 2}
