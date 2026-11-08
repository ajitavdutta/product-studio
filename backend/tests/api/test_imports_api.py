import datetime as dt
from typing import Any, Final

from httpx import AsyncClient

from app.core import clock
from app.importers.jira.detect import EMPTY_EXPORT_MESSAGE, NOT_JIRA_MESSAGE
from app.services.imports import EXPIRED_MESSAGE, MISSING_REQUIRED_MESSAGE
from app.services.mapping_templates import NOT_FOUND_MESSAGE as TEMPLATE_NOT_FOUND_MESSAGE
from tests.conftest import FROZEN_TODAY, REPO_ROOT

PAYMENTS_CSV: Final = REPO_ROOT / "docs" / "fixtures" / "jira" / "payments-export.csv"


def csv_file(content: bytes | None = None, file_name: str = "payments-export.csv") -> Any:
    body = PAYMENTS_CSV.read_bytes() if content is None else content
    return {"file": (file_name, body, "text/csv")}


async def upload(client: AsyncClient, template_id: str | None = None) -> dict[str, Any]:
    params = {"templateId": template_id} if template_id else {}
    response = await client.post("/api/imports/jira", files=csv_file(), params=params)
    assert response.status_code == 201, response.text
    session: dict[str, Any] = response.json()
    return session


def column_id(session: dict[str, Any], name: str) -> str:
    return next(column["id"] for column in session["columns"] if column["name"] == name)


def suggested_mapping(session: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """The body the Map page sends before the user changes anything, plus `overrides`."""
    mapping = {
        "columns": {
            column["id"]: column["suggestedField"]
            for column in session["columns"]
            if column["suggestedField"] is not None
        },
        "statusMap": {status["jiraStatus"]: status["statusId"] for status in session["statuses"]},
        "name": session["suggestedName"],
    }
    return {**mapping, **overrides}


async def test_IMP_1_upload_returns_session_with_format_and_row_count(
    client: AsyncClient,
) -> None:
    session = await upload(client)

    assert (
        session["fileName"],
        session["format"],
        session["formatLabel"],
        session["encoding"],
        session["rowCount"],
        session["size"],
        session["suggestedName"],
    ) == (
        "payments-export.csv",
        "csv",
        "Jira CSV",
        "utf-8-sig",
        55,
        PAYMENTS_CSV.stat().st_size,
        "payments-export",
    )


async def test_IMP_1_non_jira_file_422_plain(client: AsyncClient) -> None:
    response = await client.post(
        "/api/imports/jira", files=csv_file(b"just some notes\n", "notes.md")
    )

    assert (response.status_code, response.json()["detail"]) == (422, NOT_JIRA_MESSAGE)


async def test_IMP_1_header_only_csv_422_empty_export(client: AsyncClient) -> None:
    response = await client.post("/api/imports/jira", files=csv_file(b"Issue key,Summary\n"))

    assert (response.status_code, response.json()["detail"]) == (422, EMPTY_EXPORT_MESSAGE)


async def test_IMP_9_unknown_template_id_422_plain(client: AsyncClient) -> None:
    response = await client.post(
        "/api/imports/jira",
        files=csv_file(),
        params={"templateId": "5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50"},
    )

    assert (response.status_code, response.json()["detail"]) == (422, TEMPLATE_NOT_FOUND_MESSAGE)


async def test_IMP_1_sample_info_reports_55_issues(client: AsyncClient) -> None:
    response = await client.get("/api/imports/jira/sample")

    assert response.json() == {"fileName": "payments-export.csv", "rowCount": 55}


async def test_IMP_1_sample_import_starts_a_session(client: AsyncClient) -> None:
    response = await client.post("/api/imports/jira/sample")

    assert (response.status_code, response.json()["rowCount"]) == (201, 55)


async def test_IMP_1_get_session_returns_what_upload_returned(client: AsyncClient) -> None:
    session = await upload(client)

    response = await client.get(f"/api/imports/{session['id']}")

    assert response.json() == session


async def test_IMP_11_preview_is_pure_and_returns_document(client: AsyncClient) -> None:
    session = await upload(client)
    body = suggested_mapping(session)

    first = (await client.post(f"/api/imports/{session['id']}/preview", json=body)).json()
    second = (await client.post(f"/api/imports/{session['id']}/preview", json=body)).json()
    roadmaps = (await client.get("/api/roadmaps")).json()

    assert (
        first == second,
        first["document"]["id"] == session["id"],
        (first["epics"], first["issues"], first["teams"], first["milestones"]),
        len(first["firstEpics"]),
        first["moreEpics"],
        first["fileName"],
        first["missingRequired"],
        first["unmappedColumns"],
        first["sizeEstimateBytes"] > 0,
        roadmaps,
    ) == (True, True, (15, 55, 4, 0), 5, 10, "payments-export.json", [], ["Components"], True, [])


async def test_IMP_10_preview_lists_missing_key_and_title(client: AsyncClient) -> None:
    session = await upload(client)
    body = suggested_mapping(session)
    del body["columns"][column_id(session, "Summary")]

    preview = (await client.post(f"/api/imports/{session['id']}/preview", json=body)).json()

    assert preview["missingRequired"] == ["title"]


async def test_IMP_12_commit_creates_roadmap_and_deletes_session(client: AsyncClient) -> None:
    session = await upload(client)
    body = {**suggested_mapping(session, name="Payments 2027"), "updateTemplate": False}

    committed = await client.post(f"/api/imports/{session['id']}/commit", json=body)
    roadmap = await client.get(f"/api/roadmaps/{session['id']}")
    expired = await client.get(f"/api/imports/{session['id']}")

    assert (
        committed.status_code,
        committed.json()["fileName"],
        roadmap.json()["document"]["source"]["type"],
        expired.status_code,
    ) == (201, "payments-2027.json", "jira-csv", 404)


async def test_IMP_10_commit_without_title_422(client: AsyncClient) -> None:
    session = await upload(client)
    body = suggested_mapping(session)
    body["columns"][column_id(session, "Summary")] = "ignore"

    response = await client.post(f"/api/imports/{session['id']}/commit", json=body)

    assert (response.status_code, response.json()["detail"]) == (422, MISSING_REQUIRED_MESSAGE)


async def test_IMP_9_commit_creates_template_then_next_upload_applies_it(
    client: AsyncClient,
) -> None:
    first = await upload(client)
    body = suggested_mapping(first)
    body["columns"][column_id(first, "Components")] = "ignore"
    committed = (await client.post(f"/api/imports/{first['id']}/commit", json=body)).json()
    template_id = committed["document"]["source"]["mappingTemplateId"]

    second = await upload(client, template_id)
    unmapped = [column["name"] for column in second["columns"] if not column["suggestedField"]]
    template = (await client.get(f"/api/mapping-templates/{template_id}")).json()

    assert (second["templateId"], unmapped, template["name"]) == (
        template_id,
        [],
        "payments-export mapping",
    )


async def test_IMP_9_update_writes_only_changed_entries(client: AsyncClient) -> None:
    template = (
        await client.post(
            "/api/mapping-templates",
            json={"name": "Payments", "columnMap": {"Description": "ignore"}, "statusMap": {}},
        )
    ).json()
    session = await upload(client, template["id"])
    body = suggested_mapping(session)
    body["columns"][column_id(session, "Components")] = "ignore"
    body["statusMap"]["Blocked"] = "in-progress"

    await client.post(f"/api/imports/{session['id']}/commit", json=body)
    saved = (await client.get(f"/api/mapping-templates/{template['id']}")).json()

    assert (saved["columnMap"], saved["statusMap"]) == (
        {"Description": "ignore", "Components": "ignore"},
        {"Blocked": "in-progress"},
    )


async def test_IMP_9_commit_drops_link_to_template_deleted_after_upload(
    client: AsyncClient,
) -> None:
    template = (
        await client.post(
            "/api/mapping-templates", json={"name": "Payments", "columnMap": {}, "statusMap": {}}
        )
    ).json()
    session = await upload(client, template["id"])
    await client.delete(f"/api/mapping-templates/{template['id']}")
    body = {**suggested_mapping(session), "updateTemplate": False}

    committed = await client.post(f"/api/imports/{session['id']}/commit", json=body)

    assert "mappingTemplateId" not in committed.json()["document"]["source"]


async def test_IMP_5_duplicate_field_422_names_both_columns(client: AsyncClient) -> None:
    session = await upload(client)
    body = suggested_mapping(session)
    body["columns"][column_id(session, "Due date")] = "start"

    response = await client.post(f"/api/imports/{session['id']}/preview", json=body)

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Two columns are mapped to Start: “Start date” and “Due date”",
    )


async def test_expired_session_404(client: AsyncClient) -> None:
    session = await upload(client)
    clock.freeze(FROZEN_TODAY + dt.timedelta(days=1))

    response = await client.get(f"/api/imports/{session['id']}")

    assert (response.status_code, response.json()["detail"]) == (404, EXPIRED_MESSAGE)


async def test_upload_purges_expired_sessions(client: AsyncClient) -> None:
    old = await upload(client)
    clock.freeze(FROZEN_TODAY + dt.timedelta(days=1))
    await upload(client)
    clock.freeze(FROZEN_TODAY)

    response = await client.get(f"/api/imports/{old['id']}")

    assert response.status_code == 404


async def test_non_uuid_session_id_404_plain(client: AsyncClient) -> None:
    response = await client.get("/api/imports/not-a-uuid")

    assert (response.status_code, response.json()) == (404, {"detail": EXPIRED_MESSAGE})


async def test_non_uuid_roadmap_id_404_plain(client: AsyncClient) -> None:
    response = await client.get("/api/roadmaps/demo")

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "We couldn't find that roadmap. It may have been deleted."},
    )


async def test_non_uuid_diagram_id_404_plain(client: AsyncClient) -> None:
    response = await client.delete("/api/diagrams/demo")

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "We couldn't find that diagram. It may have been deleted."},
    )
