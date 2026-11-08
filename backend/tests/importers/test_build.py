"""build_roadmap over small hand-built rows (IMP-7, IMP-8, IMP-10, IMP-11)."""

import datetime as dt
from typing import Any
from uuid import UUID

from app.importers.jira.build import (
    DAYFIRST_SAMPLE_SIZE,
    BuildResult,
    ImportData,
    build_roadmap,
)
from app.importers.jira.names import normalise_name
from app.importers.jira.types import ColumnGroup, ExportExtras
from app.schemas.documents import RoadmapDocument, RoadmapItem, dump_document
from app.schemas.imports import ImportColumn, ImportMapping
from app.schemas.settings import PiCadence, SettingsRead

NOW = dt.datetime(2026, 11, 6, 17, 10, tzinfo=dt.timezone(dt.timedelta(hours=5, minutes=30)))
SESSION_ID = UUID("6f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7")
HEADER = (
    "Issue key",
    "Summary",
    "Issue Type",
    "Status",
    "Sprint",
    "Custom field (Start date)",
    "Due date",
    "Parent",
    "Custom field (Team)",
    "Fix versions",
)
COLUMN_FIELDS = {
    "issue key": "key",
    "summary": "title",
    "issue type": "type",
    "status": "status",
    "sprint": "sprint",
    "start date": "start",
    "due date": "end",
    "parent": "epic",
    "team": "team",
    "fix versions": "release",
}
STATUS_MAP = {
    "To Do": "not-started",
    "In Progress": "in-progress",
    "Blocked": "at-risk",
    "Done": "done",
}


def row(
    key: str,
    *,
    type: str = "Story",
    status: str = "To Do",
    parent: str = "",
    team: str = "Checkout",
    start: str = "",
    end: str = "",
    sprint: str = "",
    release: str = "",
) -> dict[str, str]:
    return {
        "Issue key": key,
        "Summary": f"Title of {key}",
        "Issue Type": type,
        "Status": status,
        "Sprint": sprint,
        "Custom field (Start date)": start,
        "Due date": end,
        "Parent": parent,
        "Custom field (Team)": team,
        "Fix versions": release,
    }


def epic(key: str, **overrides: str) -> dict[str, str]:
    return row(key, type="Epic", **overrides)


def import_data(rows: list[dict[str, str]], extras: ExportExtras | None = None) -> ImportData:
    groups = [
        ColumnGroup(
            id=normalise_name(name),
            name=name,
            label=normalise_name(name).title(),
            field_id=None,
            source_indexes=(index,),
            samples=[],
            fill=1.0,
        )
        for index, name in enumerate(HEADER)
    ]
    columns = [
        ImportColumn(id=group.id, name=group.name, label=group.label, samples=[], fill=1.0)
        for group in groups
    ]
    raw_rows = [[[values[name]] if values[name] else [] for name in HEADER] for values in rows]
    return ImportData(
        session_id=SESSION_ID,
        file_name="payments-export.csv",
        format="csv",
        template_id=None,
        columns=columns,
        groups=groups,
        rows=raw_rows,
        extras=extras or ExportExtras(),
    )


def mapping(columns: dict[str, str] | None = None, **overrides: Any) -> ImportMapping:
    rollup = overrides.pop("rollup", {})
    body: dict[str, Any] = {
        "columns": COLUMN_FIELDS if columns is None else columns,
        "statusMap": STATUS_MAP,
        "rollup": rollup,
        "name": "Payments",
        **overrides,
    }
    return ImportMapping.model_validate(body)


def build(
    rows: list[dict[str, str]],
    import_mapping: ImportMapping | None = None,
    settings: SettingsRead | None = None,
    extras: ExportExtras | None = None,
) -> BuildResult:
    return build_roadmap(
        import_data(rows, extras), import_mapping or mapping(), settings or SettingsRead(), NOW
    )


def item(result: BuildResult, key: str) -> RoadmapItem:
    return next(entry for entry in result.document.items if entry.key == key)


def span(result: BuildResult, key: str) -> tuple[dt.date | None, dt.date | None]:
    found = item(result, key)
    return found.start, found.end


D = dt.date.fromisoformat


def test_IMP_8_rollup_span_and_counts() -> None:
    result = build(
        [
            epic("PAY-1"),
            row("PAY-11", parent="PAY-1", status="Done", start="2026-11-16", end="2026-11-29"),
            row(
                "PAY-12",
                parent="PAY-1",
                status="In Progress",
                start="16/Nov/26 12:00 AM",
                end="2027-01-29",
            ),
            row("PAY-13", parent="PAY-1", start="2026-12-01", end="2026-12-14"),
        ]
    )

    rolled = item(result, "PAY-1")
    assert (
        [entry.key for entry in result.document.items],
        (rolled.start, rolled.end),
        dump_document(rolled.issues),
        [story.key for story in rolled.stories or []],
    ) == (
        ["PAY-1"],
        (D("2026-11-16"), D("2027-01-29")),
        {"total": 3, "done": 1, "inProgress": 1},
        ["PAY-11", "PAY-12", "PAY-13"],
    )


def test_IMP_8_progress_rounds_half_to_even() -> None:
    stories = [
        row("MX-1", parent="MX-0", status="Done"),
        row("MX-2", parent="MX-0", status="Done"),
        row("MX-3", parent="MX-0", status="In Progress"),
        row("MX-4", parent="MX-0", status="To Do"),
    ]

    result = build([epic("MX-0"), *stories])

    assert item(result, "MX-0").progress == 62


def test_IMP_8_blocked_stories_count_as_in_progress() -> None:
    stories = [
        row("MX-1", parent="MX-0", status="Done"),
        row("MX-2", parent="MX-0", status="Done"),
        row("MX-3", parent="MX-0", status="Blocked"),
        row("MX-4", parent="MX-0", status="To Do"),
    ]

    result = build([epic("MX-0"), *stories])

    rolled = item(result, "MX-0")
    assert (rolled.issues.in_progress, rolled.progress) == (1, 62)


def test_IMP_8_story_without_dates_excluded_from_range() -> None:
    result = build(
        [
            epic("PAY-1"),
            row("PAY-11", parent="PAY-1", start="2026-12-01", end="2027-01-02"),
            row("PAY-12", parent="PAY-1"),
        ]
    )

    assert (span(result, "PAY-1"), item(result, "PAY-1").issues.total) == (
        (D("2026-12-01"), D("2027-01-02")),
        2,
    )


def test_IMP_8_epic_without_dated_stories_uses_own_dates() -> None:
    result = build(
        [epic("PAY-1", start="2027-02-01", end="2027-03-05"), row("PAY-11", parent="PAY-1")]
    )

    assert span(result, "PAY-1") == (D("2027-02-01"), D("2027-03-05"))


def test_IMP_8_numeric_dates_read_day_first_when_a_sample_proves_it() -> None:
    result = build([row("PAY-1", start="03/04/26"), row("PAY-2", start="13/04/26")])

    assert span(result, "PAY-1")[0] == D("2026-04-03")


def test_IMP_8_day_month_order_sniffed_from_a_capped_sample() -> None:
    # Preview runs on every edit, so only the first DAYFIRST_SAMPLE_SIZE date cells are
    # scanned; day-first evidence after them is not seen and dates read month first.
    ambiguous = [row(f"PAY-{index}", start="03/04/26") for index in range(DAYFIRST_SAMPLE_SIZE)]

    result = build([*ambiguous, row("PAY-LATE", start="13/04/26")])

    assert span(result, "PAY-0")[0] == D("2026-03-04")


def test_IMP_8_sprint_dates_from_export_windows() -> None:
    windows = {"PAY Sprint 25": (D("2026-11-16"), D("2026-11-29"))}

    result = build(
        [epic("PAY-1", sprint="PAY Sprint 25")], extras=ExportExtras(sprint_windows=windows)
    )

    assert span(result, "PAY-1") == (D("2026-11-16"), D("2026-11-29"))


def test_IMP_8_sprint_dates_learned_from_same_file() -> None:
    result = build(
        [
            epic("PAY-1", sprint="S3"),
            epic("PAY-2", sprint="S3", start="2026-11-16", end="2026-11-22"),
            epic("PAY-3", sprint="S3", start="2026-11-20", end="2026-11-29"),
        ]
    )

    assert span(result, "PAY-1") == (D("2026-11-16"), D("2026-11-29"))


def test_IMP_8_export_window_beats_learned_window() -> None:
    windows = {"S3": (D("2026-12-01"), D("2026-12-14"))}

    result = build(
        [
            epic("PAY-1", sprint="S3"),
            epic("PAY-2", sprint="S3", start="2026-11-16", end="2026-11-22"),
        ],
        extras=ExportExtras(sprint_windows=windows),
    )

    assert span(result, "PAY-1") == (D("2026-12-01"), D("2026-12-14"))


def test_IMP_8_no_sprint_window_stays_unscheduled_with_warning() -> None:
    result = build([epic("PAY-1", sprint="S9")])

    assert (span(result, "PAY-1"), result.warnings[0]) == (
        (None, None),
        "1 epic has no dates → Unscheduled",
    )


def test_IMP_8_sprint_dates_off_leaves_item_unscheduled() -> None:
    windows = {"S3": (D("2026-12-01"), D("2026-12-14"))}

    result = build(
        [epic("PAY-1", sprint="S3")],
        mapping(rollup={"useSprintDates": False}),
        extras=ExportExtras(sprint_windows=windows),
    )

    assert span(result, "PAY-1") == (None, None)


def test_IMP_8_tray_off_drops_undated_items() -> None:
    result = build(
        [epic("PAY-1", start="2026-11-16", end="2026-11-29"), epic("PAY-2")],
        mapping(rollup={"unscheduledTray": False}),
    )

    assert (
        [entry.key for entry in result.document.items],
        result.warnings[0],
    ) == (["PAY-1"], "1 epic has no dates → not imported")


def test_IMP_8_rollup_off_every_row_is_an_item() -> None:
    result = build(
        [
            epic("PAY-1"),
            row("PAY-11", parent="PAY-1", status="Done", start="2026-11-16", end="2026-11-29"),
        ],
        mapping(rollup={"rollUpStories": False}),
    )

    story = item(result, "PAY-11")
    assert (
        [entry.key for entry in result.document.items],
        (story.start, story.end),
        dump_document(story.issues),
        result.warnings[0],
    ) == (
        ["PAY-1", "PAY-11"],
        (D("2026-11-16"), D("2026-11-29")),
        {"total": 0, "done": 0, "inProgress": 0},
        "1 issue has no dates → Unscheduled",
    )


def test_IMP_8_story_without_epic_becomes_its_own_item() -> None:
    result = build([row("PAY-9", start="2026-11-16", end="2026-11-29")])

    assert (item(result, "PAY-9").type, result.epics) == ("Story", 0)


def test_IMP_8_without_type_column_referenced_keys_are_epics() -> None:
    columns = {key: field for key, field in COLUMN_FIELDS.items() if field != "type"}

    result = build(
        [epic("PAY-1"), row("PAY-11", parent="PAY-1", start="2026-11-16", end="2026-11-29")],
        mapping(columns),
    )

    assert ([entry.key for entry in result.document.items], item(result, "PAY-1").type) == (
        ["PAY-1"],
        "Epic",
    )


def test_IMP_8_fix_versions_become_milestones_when_on() -> None:
    rows = [
        epic("PAY-1", start="2026-11-16", end="2027-01-29", release="2027.1"),
        epic("PAY-2", start="2026-12-01", end="2027-03-12", release="2027.1"),
        epic("PAY-3", start="2027-02-01", end="2027-02-28", release="2027.2"),
        epic("PAY-4", release="2027.3"),
    ]
    extras = ExportExtras(release_dates={"2027.2": D("2027-03-31")})

    result = build(rows, mapping(rollup={"fixVersionsAsMilestones": True}), extras=extras)

    assert [dump_document(entry) for entry in result.document.milestones] == [
        {"id": "ms-2027-1", "name": "2027.1", "kind": "milestone", "date": "2027-03-12"},
        {"id": "ms-2027-2", "name": "2027.2", "kind": "milestone", "date": "2027-03-31"},
    ]


def test_IMP_8_fix_versions_ignored_when_off() -> None:
    result = build([epic("PAY-1", start="2026-11-16", end="2027-01-29", release="2027.1")])

    assert result.document.milestones == []


def test_IMP_8_unassigned_lane_only_when_used() -> None:
    with_team = build([epic("PAY-1"), epic("RSK-1", team="Risk & Fraud")])
    without_team = build([epic("PAY-1"), epic("PAY-2", team="")])

    assert (
        [(lane.id, lane.color, lane.position) for lane in with_team.document.lanes],
        [lane.id for lane in without_team.document.lanes],
        item(without_team, "PAY-2").lane_id,
    ) == (
        [("checkout", "blue", 1000), ("risk-fraud", "deepOrange", 2000)],
        ["checkout", "unassigned"],
        "unassigned",
    )


def test_IMP_8_epic_without_team_takes_most_common_story_team() -> None:
    result = build(
        [
            epic("PAY-1", team=""),
            row("PAY-11", parent="PAY-1", team="Platform"),
            row("PAY-12", parent="PAY-1", team="Checkout"),
            row("PAY-13", parent="PAY-1", team="Checkout"),
        ]
    )

    assert item(result, "PAY-1").lane_id == "checkout"


def test_IMP_8_story_without_team_is_warned_but_gets_no_lane() -> None:
    result = build([epic("MX-77"), row("MX-771", parent="MX-77", team="")])

    assert ([lane.id for lane in result.document.lanes], result.warnings[-1]) == (
        ["checkout"],
        "1 issue has no team → Unassigned lane",
    )


def test_IMP_8_parent_wins_over_epic_link() -> None:
    columns = {**COLUMN_FIELDS, "epic link": "epic"}
    data = import_data([epic("PAY-1"), epic("PAY-2"), row("PAY-11", parent="PAY-1")])
    epic_link = ColumnGroup(
        id="epic link",
        name="Epic Link",
        label="Epic Link",
        field_id=None,
        source_indexes=(len(HEADER),),
        samples=[],
        fill=1.0,
    )
    for raw_row, value in zip(data.rows, ["", "", "PAY-2"], strict=True):
        raw_row.append([value] if value else [])
    data = ImportData(
        session_id=data.session_id,
        file_name=data.file_name,
        format=data.format,
        template_id=None,
        columns=data.columns,
        groups=[epic_link, *data.groups],
        rows=data.rows,
    )

    result = build_roadmap(data, mapping(columns), SettingsRead(), NOW)

    assert (item(result, "PAY-1").issues.total, item(result, "PAY-2").issues.total) == (1, 0)


def test_IMP_7_jira_statuses_recorded_on_document_statuses() -> None:
    result = build(
        [epic("PAY-1", status="In Progress"), row("PAY-11", parent="PAY-1", status="Blocked")]
    )

    assert {status.id: status.jira_statuses for status in result.document.statuses} == {
        "not-started": [],
        "in-progress": ["In Progress"],
        "at-risk": ["Blocked"],
        "done": [],
    }


def test_IMP_7_custom_status_added() -> None:
    custom = {"id": "in-qa", "name": "In QA", "color": "teal"}
    status_map = {**STATUS_MAP, "In QA": "in-qa"}

    result = build(
        [epic("PAY-1", status="In QA")],
        mapping(statusMap=status_map, customStatuses=[custom]),
    )

    added = result.document.statuses[-1]
    assert (
        (added.id, added.name, added.color, added.jira_statuses),
        item(result, "PAY-1").status_id,
    ) == (("in-qa", "In QA", "teal", ["In QA"]), "in-qa")


def test_IMP_7_status_missing_from_map_defaults_to_not_started() -> None:
    result = build([epic("PAY-1", status="Triage")])

    assert item(result, "PAY-1").status_id == "not-started"


def test_timeline_covers_latest_end_from_cadence() -> None:
    settings = SettingsRead(pi_cadence=PiCadence(sprints_per_pi=5, ip_sprint=False))

    result = build(
        [
            epic("PAY-1", start="2026-11-04", end="2027-01-12"),
            epic("PAY-2", start="2027-01-13", end="2027-01-13"),
        ],
        settings=settings,
    )

    timeline = dump_document(result.document.timeline)
    assert timeline == {
        "start": "2026-11-02",
        "sprintLengthDays": 14,
        "pis": [
            {"id": "pi-1", "name": "PI 1", "start": "2026-11-02", "sprints": 5, "ipSprint": False},
            {"id": "pi-2", "name": "PI 2", "start": "2027-01-11", "sprints": 5, "ipSprint": False},
        ],
    }


def test_timeline_without_dates_starts_on_monday_of_today() -> None:
    result = build([epic("PAY-1")])

    timeline = result.document.timeline
    assert (timeline.start, len(timeline.pis)) == (D("2026-11-02"), 1)


def test_IMP_11_document_validates_as_roadmap_v1() -> None:
    result = build(
        [
            epic("PAY-1", status="In Progress", release="2027.1"),
            row("PAY-11", parent="PAY-1", status="Done", start="2026-11-16", end="2026-11-29"),
            epic("PAY-2", team=""),
        ],
        mapping(rollup={"fixVersionsAsMilestones": True}),
    )

    dumped = dump_document(result.document)
    reloaded = RoadmapDocument.model_validate(dumped)
    assert (
        dump_document(reloaded) == dumped,
        dumped["schemaVersion"],
        dumped["id"],
        dumped["source"],
        (result.epics, result.issues, result.teams),
    ) == (
        True,
        1,
        str(SESSION_ID),
        {
            "type": "jira-csv",
            "file": "payments-export.csv",
            "importedAt": "2026-11-06T17:10:00+05:30",
        },
        (2, 3, 1),
    )


def test_IMP_11_item_ids_and_positions() -> None:
    result = build([epic("PAY-142"), epic("RSK-031")])

    assert [(entry.id, entry.position) for entry in result.document.items] == [
        ("it-pay-142", 1000),
        ("it-rsk-031", 2000),
    ]


def test_IMP_11_warning_copy_singular_and_plural() -> None:
    single = build(
        [
            epic("PAY-1"),
            row("PAY-11", parent="PAY-1", team=""),
            epic("PAY-2", start="2026-11-16", end="2026-11-29"),
            row("PAY-21", parent="PAY-2", start="2026-11-16", end="2026-11-29"),
        ]
    )
    plural = build(
        [
            epic("PAY-1"),
            epic("PAY-2"),
            row("PAY-11", parent="PAY-1", team=""),
            row("PAY-12", parent="PAY-1", team=""),
        ]
    )

    assert (single.warnings, plural.warnings) == (
        [
            "1 epic has no dates → Unscheduled",
            "1 issue has no dates → excluded from its epic's range",
            "1 issue has no team → Unassigned lane",
        ],
        [
            "2 epics have no dates → Unscheduled",
            "2 issues have no dates → excluded from their epics' ranges",
            "2 issues have no team → Unassigned lane",
        ],
    )


def test_IMP_11_unmapped_listed_column_warned_and_reported() -> None:
    columns = {key: field for key, field in COLUMN_FIELDS.items() if key != "fix versions"}

    result = build([epic("PAY-1", start="2026-11-16", end="2026-11-29")], mapping(columns))

    assert (result.warnings, result.unmapped) == (
        ['"Fix Versions" isn\'t mapped yet'],
        ["Fix Versions"],
    )


def test_IMP_11_ignored_column_counts_as_mapped() -> None:
    columns = {**COLUMN_FIELDS, "fix versions": "ignore"}

    result = build([epic("PAY-1", start="2026-11-16", end="2026-11-29")], mapping(columns))

    assert (result.warnings, result.unmapped) == ([], [])


def test_IMP_10_warns_when_no_dates_or_sprint_mapped() -> None:
    columns = {
        key: field
        for key, field in COLUMN_FIELDS.items()
        if field not in ("start", "end", "sprint")
    }
    ignored = {"sprint": "ignore", "start date": "ignore", "due date": "ignore"}

    result = build([epic("PAY-1")], mapping({**columns, **ignored}))

    assert result.warnings == [
        "1 epic has no dates → Unscheduled",
        "Neither Start/End nor Sprint is mapped, so every item will go to Unscheduled",
    ]


def test_IMP_10_rows_without_key_mapping_build_an_empty_document() -> None:
    columns = {key: field for key, field in COLUMN_FIELDS.items() if field != "key"}

    result = build([epic("PAY-1")], mapping(columns))

    assert (result.document.items, result.issues) == ([], 0)


def test_jira_url_from_settings_base_url() -> None:
    settings = SettingsRead.model_validate({"jiraBaseUrl": "https://acme.atlassian.net"})

    result = build([epic("PAY-142")], settings=settings)

    assert item(result, "PAY-142").jira_url == "https://acme.atlassian.net/browse/PAY-142"


def test_no_jira_url_without_base_url() -> None:
    result = build([epic("PAY-142")])

    assert item(result, "PAY-142").jira_url is None
