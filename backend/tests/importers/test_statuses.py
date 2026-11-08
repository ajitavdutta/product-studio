import pytest

from app.importers.jira.statuses import map_statuses


@pytest.mark.parametrize(
    ("jira_status", "status_id"),
    [
        ("To Do", "not-started"),
        ("Open", "not-started"),
        ("Backlog", "not-started"),
        ("Selected for Development", "not-started"),
        ("In Progress", "in-progress"),
        ("In Review", "in-progress"),
        ("In QA", "in-progress"),
        ("Code Review", "in-progress"),
        ("Blocked", "at-risk"),
        ("Impeded", "at-risk"),
        ("On Hold", "at-risk"),
        ("Done", "done"),
        ("Closed", "done"),
        ("Resolved", "done"),
        ("Released", "done"),
    ],
)
def test_IMP_7_default_status_table(jira_status: str, status_id: str) -> None:
    [suggestion] = map_statuses([jira_status])

    assert suggestion.status_id == status_id


def test_IMP_7_default_table_ignores_case() -> None:
    [suggestion] = map_statuses(["IN PROGRESS"])

    assert (suggestion.jira_status, suggestion.status_id) == ("IN PROGRESS", "in-progress")


def test_IMP_7_unknown_status_defaults_to_not_started() -> None:
    [suggestion] = map_statuses(["Awaiting Legal"])

    assert suggestion.status_id == "not-started"


def test_IMP_7_template_status_map_wins() -> None:
    [suggestion] = map_statuses(["In Review"], {"in review": "at-risk"})

    assert suggestion.status_id == "at-risk"


def test_IMP_7_distinct_statuses_counted_in_file_order() -> None:
    suggestions = map_statuses(["To Do", "Done", "To Do", "", "Blocked", "Done", "To Do"])

    assert [(s.jira_status, s.count) for s in suggestions] == [
        ("To Do", 3),
        ("Done", 2),
        ("Blocked", 1),
    ]


def test_IMP_7_no_statuses_gives_empty_list() -> None:
    assert map_statuses([]) == []
