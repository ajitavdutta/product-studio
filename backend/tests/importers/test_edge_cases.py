"""Jira import edge cases, end to end: a generated file in `tmp_path` → upload → preview.

The reader, merge and suggest units have their own tests; these prove the pieces agree once
they run together behind `POST /api/imports/jira` (IMP-1, IMP-5, IMP-6, NF-3).
"""

import csv
from pathlib import Path
from typing import Any, Final

import pytest
from httpx import AsyncClient

from app.importers.jira.detect import EMPTY_FILE_MESSAGE

# Jira Cloud caps a multi-line text field (Description, Environment) at 32,767 characters.
JIRA_TEXT_FIELD_MAX: Final = 32_767
# Python's csv module refuses a single field longer than this by default.
CSV_FIELD_SIZE_LIMIT: Final = 131_072
JIRA_CLOUD_COLUMN_COUNT: Final = 200


def write_csv(
    tmp_path: Path,
    rows: list[list[str]],
    *,
    delimiter: str = ",",
    encoding: str = "utf-8",
    name: str = "export.csv",
) -> Path:
    path = tmp_path / name
    with path.open("w", encoding=encoding, newline="") as handle:
        csv.writer(handle, delimiter=delimiter).writerows(rows)
    return path


async def upload_path(client: AsyncClient, path: Path) -> Any:
    return await client.post(
        "/api/imports/jira", files={"file": (path.name, path.read_bytes(), "text/csv")}
    )


async def upload_ok(client: AsyncClient, path: Path) -> dict[str, Any]:
    response = await upload_path(client, path)
    assert response.status_code == 201, response.text
    session: dict[str, Any] = response.json()
    return session


def column(session: dict[str, Any], name: str) -> dict[str, Any]:
    found: dict[str, Any] = next(c for c in session["columns"] if c["name"] == name)
    return found


async def preview_suggested(client: AsyncClient, session: dict[str, Any]) -> dict[str, Any]:
    body = {
        "columns": {
            c["id"]: c["suggestedField"] for c in session["columns"] if c["suggestedField"]
        },
        "statusMap": {s["jiraStatus"]: s["statusId"] for s in session["statuses"]},
        "name": session["suggestedName"],
    }
    response = await client.post(f"/api/imports/{session['id']}/preview", json=body)
    assert response.status_code == 200, response.text
    preview: dict[str, Any] = response.json()
    return preview


def items_by_key(preview: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["key"]: item for item in preview["document"]["items"]}


# --- Encoding and delimiter ----------------------------------------------------------------


async def test_NF_3_bom_csv(client: AsyncClient, tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        [["Issue key", "Summary", "Status"], ["PAY-1", "Wallet", "Done"]],
        encoding="utf-8-sig",
    )

    session = await upload_ok(client, path)

    assert (
        session["encoding"],
        session["columns"][0]["name"],
        session["columns"][0]["suggestedField"],
    ) == ("utf-8-sig", "Issue key", "key")


async def test_NF_3_cp1252_csv_from_excel_keeps_accents(
    client: AsyncClient, tmp_path: Path
) -> None:
    path = write_csv(
        tmp_path,
        [["Issue key", "Summary", "Issue Type"], ["PAY-1", "Café checkout – EUR", "Epic"]],
        encoding="cp1252",
    )

    session = await upload_ok(client, path)
    preview = await preview_suggested(client, session)

    assert (session["encoding"], items_by_key(preview)["PAY-1"]["title"]) == (
        "cp1252",
        "Café checkout – EUR",
    )


async def test_IMP_1_semicolon_csv(client: AsyncClient, tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        [
            ["Issue key", "Summary", "Issue Type", "Status"],
            ["PAY-1", "Checkout, saved cards", "Epic", "In Progress"],
            ["PAY-2", "Refunds, partial", "Epic", "Done"],
        ],
        delimiter=";",
    )

    session = await upload_ok(client, path)
    preview = await preview_suggested(client, session)

    assert (
        session["rowCount"],
        [c["name"] for c in session["columns"]],
        [item["title"] for item in preview["document"]["items"]],
    ) == (
        2,
        ["Issue key", "Summary", "Issue Type", "Status"],
        ["Checkout, saved cards", "Refunds, partial"],
    )


# --- Repeated and custom columns -----------------------------------------------------------


async def test_IMP_6_three_duplicate_sprint_columns_keep_latest(
    client: AsyncClient, tmp_path: Path
) -> None:
    # PAY-1 dates PAY Sprint 26; PAY-2 has no dates and three sprints, the last being 26.
    # With "use sprint dates" on, PAY-2 must take Sprint 26's window, not Sprint 24's.
    header = ["Issue key", "Summary", "Sprint", "Sprint", "Sprint", "Start date", "Due date"]
    path = write_csv(
        tmp_path,
        [
            header,
            ["PAY-0", "Earlier", "PAY Sprint 24", "", "", "2026-11-02", "2026-11-15"],
            ["PAY-1", "Dated", "PAY Sprint 26", "", "", "2026-11-30", "2026-12-13"],
            ["PAY-2", "Carried", "PAY Sprint 24", "PAY Sprint 25", "PAY Sprint 26", "", ""],
        ],
    )

    session = await upload_ok(client, path)
    preview = await preview_suggested(client, session)
    sprint = column(session, "Sprint")
    carried = items_by_key(preview)["PAY-2"]

    assert (sprint["repeatCount"], sprint["suggestedField"], carried["start"], carried["end"]) == (
        3,
        "sprint",
        "2026-11-30",
        "2026-12-13",
    )


async def test_IMP_5_custom_field_story_points(client: AsyncClient, tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        [["Issue key", "Summary", "Custom field (Story Points)"], ["PAY-1", "Wallet", "5"]],
    )

    session = await upload_ok(client, path)
    points = column(session, "Custom field (Story Points)")

    assert (points["label"], points["suggestedField"], points["confidence"]) == (
        "Story Points",
        "points",
        "alias",
    )


async def test_IMP_5_epic_link_vs_parent_prefers_parent(
    client: AsyncClient, tmp_path: Path
) -> None:
    header = ["Issue key", "Summary", "Issue Type", "Status", "Parent", "Epic Link"]
    path = write_csv(
        tmp_path,
        [
            header,
            ["PAY-1", "Wallet", "Epic", "To Do", "", ""],
            ["PAY-2", "Refunds", "Epic", "To Do", "", ""],
            ["PAY-11", "Both set", "Story", "Done", "PAY-1", "PAY-2"],
            ["PAY-12", "Epic Link only", "Story", "Done", "", "PAY-2"],
        ],
    )

    session = await upload_ok(client, path)
    preview = await preview_suggested(client, session)
    items = items_by_key(preview)

    assert (
        column(session, "Parent")["suggestedField"],
        column(session, "Epic Link")["suggestedField"],
        [story["key"] for story in items["PAY-1"]["stories"]],
        [story["key"] for story in items["PAY-2"]["stories"]],
    ) == ("epic", "epic", ["PAY-11"], ["PAY-12"])


async def test_IMP_5_200_column_export_streams(client: AsyncClient, tmp_path: Path) -> None:
    # Asserts the result of a Jira Cloud "all fields" export, not memory use.
    extra = [f"Custom field (Field {index})" for index in range(JIRA_CLOUD_COLUMN_COUNT)]
    header = ["Issue key", "Summary", "Issue Type", *extra]
    rows = [header] + [
        [f"PAY-{n}", f"Epic {n}", "Epic", *(["x"] * len(extra))] for n in range(1, 301)
    ]
    path = write_csv(tmp_path, rows)

    session = await upload_ok(client, path)
    preview = await preview_suggested(client, session)

    assert (
        session["rowCount"],
        len(session["columns"]) + len(session["ignoredColumns"]),
        preview["epics"],
    ) == (300, len(header), 300)


# --- Empty and oversized content -----------------------------------------------------------


@pytest.mark.parametrize("content", [b"", b"   \r\n\n", b"\xef\xbb\xbf"])
async def test_IMP_1_empty_file_422(client: AsyncClient, content: bytes) -> None:
    response = await client.post(
        "/api/imports/jira", files={"file": ("export.csv", content, "text/csv")}
    )

    assert (response.status_code, response.json()["detail"]) == (422, EMPTY_FILE_MESSAGE)


async def test_IMP_1_longest_jira_description_accepted(client: AsyncClient, tmp_path: Path) -> None:
    description = "Line of a long spec.\n" * (JIRA_TEXT_FIELD_MAX // 21)
    description = description.ljust(JIRA_TEXT_FIELD_MAX, "x")
    path = write_csv(
        tmp_path, [["Issue key", "Summary", "Description"], ["PAY-1", "Wallet", description]]
    )

    session = await upload_ok(client, path)

    assert session["rowCount"] == 1


async def test_IMP_1_cell_over_csv_field_limit_422_names_the_line(
    client: AsyncClient, tmp_path: Path
) -> None:
    path = write_csv(
        tmp_path,
        [
            ["Issue key", "Summary", "Description"],
            ["PAY-1", "Fine", "short"],
            ["PAY-2", "Huge", "x" * (CSV_FIELD_SIZE_LIMIT + 1)],
        ],
    )

    response = await upload_path(client, path)

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "We couldn't read line 3 of this CSV file. Export it from Jira again and retry.",
    )
