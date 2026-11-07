import json
from typing import Any

from httpx import AsyncClient

ROADMAP_ID = "0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31"
DIAGRAM_ID = "5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50"


def json_file(body: object, file_name: str = "plan.json") -> dict[str, Any]:
    return {"file": (file_name, json.dumps(body).encode(), "application/json")}


def without_id(document: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in document.items() if key != "id"}


async def rename(client: AsyncClient, base_version: int, name: str) -> Any:
    return await client.patch(
        f"/api/roadmaps/{ROADMAP_ID}",
        json={"baseVersion": base_version, "ops": [{"op": "set", "path": "/name", "value": name}]},
    )


async def test_RM_16_round_trip_download_then_import_is_lossless(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)
    downloaded = (await client.get(f"/api/roadmaps/{ROADMAP_ID}/document")).json()
    await client.delete(f"/api/roadmaps/{ROADMAP_ID}")

    kept = (await client.post("/api/roadmaps/import-json", files=json_file(downloaded))).json()
    copied = (await client.post("/api/roadmaps/import-json", files=json_file(downloaded))).json()

    assert (
        downloaded == roadmap_example,
        kept["document"] == roadmap_example,
        copied["id"] != ROADMAP_ID,
        without_id(copied["document"]) == without_id(roadmap_example),
    ) == (True, True, True, True)


async def test_create_returns_201_with_revision_0(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    response = await client.post("/api/roadmaps", json=roadmap_example)

    assert (response.status_code, response.json()["revision"]) == (201, 0)


async def test_NF_3_invalid_document_body_returns_plain_422(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    roadmap_example["items"][0]["end"] = "2026-01-01"

    response = await client.post("/api/roadmaps", json=roadmap_example)

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Item PAY-142 has an end date before its start date",
    )


async def test_G_2_patch_409_on_stale_base_version(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)
    await rename(client, 0, "First")

    response = await rename(client, 0, "Second")

    assert (response.status_code, response.json()) == (
        409,
        {"detail": "This roadmap changed somewhere else. Reload to see the latest version."},
    )


async def test_G_2_patch_returns_revision_and_file_name(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)

    response = await rename(client, 0, "Q3 Plan")

    assert (response.status_code, response.json()) == (
        200,
        {"revision": 1, "fileName": "q3-plan.json"},
    )


async def test_G_2_patch_422_lists_op_path(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)

    response = await client.patch(
        f"/api/roadmaps/{ROADMAP_ID}",
        json={"baseVersion": 0, "ops": [{"op": "set", "path": "/id", "value": "x"}]},
    )

    assert (response.status_code, response.json()["errors"]) == (
        422,
        [{"path": "/id", "message": "The document's id, kind and schema version can't be changed"}],
    )


async def test_G_2_patch_with_no_ops_is_rejected(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)

    response = await client.patch(f"/api/roadmaps/{ROADMAP_ID}", json={"baseVersion": 0, "ops": []})

    assert (response.status_code, isinstance(response.json()["detail"], str)) == (422, True)


async def test_RM_16_import_json_rejects_diagram_file(
    client: AsyncClient, diagram_example: dict[str, Any]
) -> None:
    response = await client.post("/api/roadmaps/import-json", files=json_file(diagram_example))

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "This file is a swimlane diagram, not a roadmap",
    )


async def test_RM_16_import_json_invalid_json(client: AsyncClient) -> None:
    files = {"file": ("plan.json", b"{oops", "application/json")}

    response = await client.post("/api/roadmaps/import-json", files=files)

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "This file isn't valid JSON",
    )


async def test_RM_16_import_json_migrates_v0(client: AsyncClient) -> None:
    from tests.conftest import load_example

    response = await client.post(
        "/api/roadmaps/import-json", files=json_file(load_example("roadmap.v0.json"))
    )

    assert (response.status_code, response.json()["document"]["schemaVersion"]) == (201, 1)


async def test_download_has_attachment_file_name(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)

    response = await client.get(f"/api/roadmaps/{ROADMAP_ID}/document")

    assert response.headers["content-disposition"] == (
        'attachment; filename="payments-platform-h1-2027.json"'
    )


async def test_list_returns_summaries_with_file_name(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)

    summaries = (await client.get("/api/roadmaps")).json()

    assert [
        (summary["id"], summary["name"], summary["fileName"], summary["revision"])
        for summary in summaries
    ] == [(ROADMAP_ID, "Payments Platform H1 2027", "payments-platform-h1-2027.json", 0)]


async def test_delete_impact_then_delete(
    client: AsyncClient, roadmap_example: dict[str, Any], diagram_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)
    await client.post("/api/diagrams/import-json", files=json_file(diagram_example))

    impact = (await client.get(f"/api/roadmaps/{ROADMAP_ID}/delete-impact")).json()
    deleted = await client.delete(f"/api/roadmaps/{ROADMAP_ID}")
    after = await client.get(f"/api/roadmaps/{ROADMAP_ID}")

    assert (
        impact["unlinks"],
        deleted.status_code,
        deleted.json()["message"],
        after.status_code,
    ) == (
        [{"id": DIAGRAM_ID, "kind": "diagram", "name": "Customer refund flow"}],
        200,
        impact["message"],
        404,
    )


async def test_get_missing_returns_404_detail(client: AsyncClient) -> None:
    response = await client.get(f"/api/roadmaps/{ROADMAP_ID}")

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "We couldn't find that roadmap. It may have been deleted."},
    )


async def test_import_json_route_is_not_read_as_an_id(client: AsyncClient) -> None:
    response = await client.get("/api/roadmaps/import-json")

    assert response.status_code in {405, 422}
