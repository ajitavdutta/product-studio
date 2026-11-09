"""RM-15: re-sync a roadmap committed from the payments CSV with a newer export of it."""

import datetime as dt
from typing import Any, Final

from httpx import AsyncClient

from app.core import clock
from app.core.limits import MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE
from app.services.imports import RESYNC_MISSING_COLUMNS_MESSAGE
from app.services.mapping_templates import NOT_FOUND_MESSAGE as TEMPLATE_NOT_FOUND_MESSAGE
from app.services.resync import AUTO_WITH_TEMPLATE_MESSAGE, EXPIRED_MESSAGE, STALE_MESSAGE
from tests.api.test_imports_api import PAYMENTS_CSV, csv_file, suggested_mapping, upload
from tests.conftest import FROZEN_TODAY

UPDATED_FILE_NAME: Final = "jira-export-payments-2026-11-20.csv"


async def committed_roadmap(client: AsyncClient) -> dict[str, Any]:
    session = await upload(client)
    response = await client.post(
        f"/api/imports/{session['id']}/commit", json=suggested_mapping(session)
    )
    assert response.status_code == 201, response.text
    roadmap: dict[str, Any] = response.json()
    return roadmap


def item_id(roadmap: dict[str, Any], key: str) -> str:
    return next(item["id"] for item in roadmap["document"]["items"] if item["key"] == key)


async def hand_edit(client: AsyncClient, roadmap: dict[str, Any]) -> int:
    """Three edits the editor makes: dates, status and title, each marked in editedFields."""
    pay_155 = item_id(roadmap, "PAY-155")
    pay_161 = item_id(roadmap, "PAY-161")
    rsk_031 = item_id(roadmap, "RSK-031")
    ops = [
        {"op": "set", "path": f"/items/{pay_155}/end", "value": "2027-03-26"},
        {"op": "set", "path": f"/items/{pay_155}/editedFields", "value": ["end"]},
        {"op": "set", "path": f"/items/{pay_161}/statusId", "value": "at-risk"},
        {"op": "set", "path": f"/items/{pay_161}/editedFields", "value": ["statusId"]},
        {"op": "set", "path": f"/items/{rsk_031}/title", "value": "Fraud rules v2 (renamed)"},
        {"op": "set", "path": f"/items/{rsk_031}/editedFields", "value": ["title"]},
    ]
    response = await client.patch(
        f"/api/roadmaps/{roadmap['id']}",
        json={"baseVersion": roadmap["revision"], "ops": ops},
    )
    assert response.status_code == 200, response.text
    revision: int = response.json()["revision"]
    return revision


async def start_resync(client: AsyncClient, roadmap_id: str, body: bytes | None = None) -> Any:
    return await client.post(
        f"/api/roadmaps/{roadmap_id}/resync",
        files=csv_file(body, UPDATED_FILE_NAME),
    )


async def test_RM_15_same_export_lists_only_hand_edit_conflicts(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    await hand_edit(client, roadmap)

    response = await start_resync(client, roadmap["id"])

    resync = response.json()
    assert (
        response.status_code,
        [(change["id"], change["conflict"]) for change in resync["changes"]],
        resync["templateName"],
        resync["fileName"],
    ) == (
        201,
        [("dates:PAY-155", True), ("status:PAY-161", True)],
        "payments-export mapping",
        UPDATED_FILE_NAME,
    )


async def test_RM_15_unchanged_counts_items_without_changes(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    await hand_edit(client, roadmap)

    resync = (await start_resync(client, roadmap["id"])).json()

    assert resync["unchanged"] == len(roadmap["document"]["items"]) - 2


async def test_RM_15_apply_conflict_writes_jira_value_and_keeps_title(
    client: AsyncClient,
) -> None:
    roadmap = await committed_roadmap(client)
    revision = await hand_edit(client, roadmap)
    resync = (await start_resync(client, roadmap["id"])).json()

    applied = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync/{resync['id']}/apply",
        json={"baseVersion": revision, "changeIds": ["dates:PAY-155"]},
    )

    document = applied.json()["document"]
    items = {item["key"]: item for item in document["items"]}
    assert (
        applied.status_code,
        applied.json()["revision"],
        items["PAY-155"]["end"],
        "editedFields" in items["PAY-155"],
        items["PAY-161"]["statusId"],
        items["RSK-031"]["title"],
        document["source"]["file"],
        document["source"]["syncedAt"],
    ) == (
        200,
        revision + 1,
        "2027-03-12",
        False,
        "at-risk",
        "Fraud rules v2 (renamed)",
        UPDATED_FILE_NAME,
        "2026-11-06T00:00:00Z",
    )


async def test_RM_15_apply_deletes_the_resync(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    revision = await hand_edit(client, roadmap)
    resync = (await start_resync(client, roadmap["id"])).json()
    url = f"/api/roadmaps/{roadmap['id']}/resync/{resync['id']}/apply"
    await client.post(url, json={"baseVersion": revision, "changeIds": ["dates:PAY-155"]})

    again = await client.post(
        url, json={"baseVersion": revision + 1, "changeIds": ["dates:PAY-155"]}
    )

    assert (again.status_code, again.json()["detail"]) == (404, EXPIRED_MESSAGE)


async def test_RM_15_stale_base_version_409(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    resync = (await start_resync(client, roadmap["id"])).json()
    await hand_edit(client, roadmap)

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync/{resync['id']}/apply",
        json={"baseVersion": 1, "changeIds": ["dates:PAY-155"]},
    )

    assert (response.status_code, response.json()["detail"]) == (409, STALE_MESSAGE)


async def test_RM_15_expired_resync_404(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    revision = await hand_edit(client, roadmap)
    resync = (await start_resync(client, roadmap["id"])).json()
    clock.freeze(FROZEN_TODAY + dt.timedelta(days=1))

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync/{resync['id']}/apply",
        json={"baseVersion": revision, "changeIds": ["dates:PAY-155"]},
    )

    assert (response.status_code, response.json()["detail"]) == (404, EXPIRED_MESSAGE)


async def test_RM_15_unknown_change_id_422(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    revision = await hand_edit(client, roadmap)
    resync = (await start_resync(client, roadmap["id"])).json()

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync/{resync['id']}/apply",
        json={"baseVersion": revision, "changeIds": ["dates:NOPE-1"]},
    )

    assert response.status_code == 422


async def test_RM_15_empty_selection_422(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    resync = (await start_resync(client, roadmap["id"])).json()

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync/{resync['id']}/apply",
        json={"baseVersion": 0, "changeIds": []},
    )

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Choose at least one change to apply",
    )


async def test_RM_15_key_title_missing_422(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    body = b"Issue key,Assignee\nPAY-142,Asha\n"

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync",
        files={"file": ("other.csv", body, "text/csv")},
    )

    assert (response.status_code, response.json()["detail"]) == (
        422,
        RESYNC_MISSING_COLUMNS_MESSAGE,
    )


async def test_RM_15_resync_missing_roadmap_404(client: AsyncClient) -> None:
    response = await start_resync(client, "0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31")

    assert response.status_code == 404


async def test_RM_15_new_epic_and_status_warning(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    extra_row = (
        "\r\nRefund webhooks,PAY-190,10999,Epic,In QA,High,PM,20/Oct/26 12:00 AM,,,,,,,,"
        "04/Jan/27 12:00 AM,12/Feb/27 12:00 AM,,,Payouts,"
    )
    body = PAYMENTS_CSV.read_bytes().rstrip(b"\r\n") + extra_row.encode()

    resync = (await start_resync(client, roadmap["id"], body)).json()

    new = next(change for change in resync["changes"] if change["kind"] == "new")
    assert (new["id"], new["after"], resync["warnings"][0]) == (
        "new:PAY-190",
        "Payouts · 4 Jan 2027 – 12 Feb 2027",
        "1 issue has a Jira status this roadmap doesn't map (In QA) — it shows as Not started",
    )


async def test_NF_3_resync_upload_over_20mb_413(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)

    response = await start_resync(client, roadmap["id"], b"x" * (MAX_UPLOAD_BYTES + 1))

    assert (response.status_code, response.json()["detail"]) == (413, MAX_UPLOAD_MESSAGE)


async def test_RM_15_unknown_template_422(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync",
        files=csv_file(None, UPDATED_FILE_NAME),
        data={"templateId": "not-a-template"},
    )

    assert (response.status_code, response.json()["detail"]) == (
        422,
        TEMPLATE_NOT_FOUND_MESSAGE,
    )


async def test_RM_15_item_after_last_pi_warns(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    first_pi = roadmap["document"]["timeline"]["pis"][0]
    await client.patch(
        f"/api/roadmaps/{roadmap['id']}",
        json={
            "baseVersion": 0,
            "ops": [{"op": "set", "path": "/timeline/pis", "value": [first_pi]}],
        },
    )

    resync = (await start_resync(client, roadmap["id"])).json()

    pi_warnings = [warning for warning in resync["warnings"] if "after the last PI" in warning]
    # Several epics overflow one PI, so they are summarised in a single "… more end" line.
    assert (len(pi_warnings), " more end after the last PI" in pi_warnings[0]) == (1, True)


async def test_RM_15_automatic_mapping_ignores_saved_template(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync",
        files=csv_file(None, UPDATED_FILE_NAME),
        data={"mapping": "auto"},
    )

    assert (response.status_code, response.json()["templateName"]) == (201, None)


async def test_RM_15_no_mapping_field_uses_saved_template(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)

    resync = (await start_resync(client, roadmap["id"])).json()

    assert resync["templateName"] == "payments-export mapping"


async def test_RM_15_automatic_mapping_with_template_id_422(client: AsyncClient) -> None:
    roadmap = await committed_roadmap(client)
    template_id = roadmap["document"]["source"]["mappingTemplateId"]

    response = await client.post(
        f"/api/roadmaps/{roadmap['id']}/resync",
        files=csv_file(None, UPDATED_FILE_NAME),
        data={"mapping": "auto", "templateId": template_id},
    )

    assert (response.status_code, response.json()["detail"]) == (422, AUTO_WITH_TEMPLATE_MESSAGE)
