import json
from typing import Any

from httpx import AsyncClient

ROADMAP_ID = "0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31"
DIAGRAM_ID = "5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50"


def json_file(body: object, file_name: str = "flow.swimlane.json") -> dict[str, Any]:
    return {"file": (file_name, json.dumps(body).encode(), "application/json")}


def connector(document: dict[str, Any], connector_id: str) -> dict[str, Any]:
    return next(entry for entry in document["connectors"] if entry["id"] == connector_id)


async def test_SW_21_round_trip_download_then_import_is_lossless(
    client: AsyncClient, diagram_example: dict[str, Any]
) -> None:
    await client.post("/api/diagrams/import-json", files=json_file(diagram_example))
    response = await client.get(f"/api/diagrams/{DIAGRAM_ID}/document")
    await client.delete(f"/api/diagrams/{DIAGRAM_ID}")

    reimported = await client.post("/api/diagrams/import-json", files=json_file(response.json()))

    assert (
        response.json() == diagram_example,
        response.headers["content-disposition"],
        reimported.json()["document"] == diagram_example,
    ) == (True, 'attachment; filename="customer-refund-flow.swimlane.json"', True)


async def test_SW_21_bad_geometry_422_lists_connector_ids(
    client: AsyncClient, diagram_example: dict[str, Any]
) -> None:
    connector(diagram_example, "c3")["points"] = [[352, 200], [400, 200]]
    connector(diagram_example, "c9")["points"][1] = [830, 300]

    response = await client.post("/api/diagrams/import-json", files=json_file(diagram_example))

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Connectors c3, c9 aren't drawn correctly: each segment must be horizontal or "
        "vertical and start and end on its shapes' anchors",
    )


async def test_SW_21_create_blank(client: AsyncClient) -> None:
    response = await client.post("/api/diagrams", json={})

    body = response.json()
    assert (response.status_code, body["name"], len(body["document"]["lanes"])) == (
        201,
        "Untitled workflow",
        3,
    )


async def test_SW_21_create_from_roadmap(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)

    created = await client.post(
        "/api/diagrams",
        json={"name": "Checkout flow", "lanesFrom": "roadmap", "roadmapId": ROADMAP_ID},
    )
    roadmap = (await client.get(f"/api/roadmaps/{ROADMAP_ID}")).json()

    diagram = created.json()
    assert (
        created.status_code,
        [lane["id"] for lane in diagram["document"]["lanes"]],
        diagram["document"]["linkedRoadmapId"],
        diagram["id"] in roadmap["document"]["linkedDiagrams"],
    ) == (201, ["checkout", "risk-fraud", "platform", "merchant-experience"], ROADMAP_ID, True)


async def test_SW_21_create_from_roadmap_needs_a_roadmap_id(client: AsyncClient) -> None:
    response = await client.post("/api/diagrams", json={"lanesFrom": "roadmap"})

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Choose the roadmap whose teams the diagram should use",
    )


async def test_G_2_patch_409_on_stale_base_version(
    client: AsyncClient, diagram_example: dict[str, Any]
) -> None:
    await client.post("/api/diagrams/import-json", files=json_file(diagram_example))
    patch = {"baseVersion": 0, "ops": [{"op": "set", "path": "/name", "value": "Renamed"}]}
    await client.patch(f"/api/diagrams/{DIAGRAM_ID}", json=patch)

    response = await client.patch(f"/api/diagrams/{DIAGRAM_ID}", json=patch)

    assert (response.status_code, response.json()["detail"]) == (
        409,
        "This diagram changed somewhere else. Reload to see the latest version.",
    )


async def test_G_2_patch_moves_a_shape_with_its_connector(
    client: AsyncClient, diagram_example: dict[str, Any]
) -> None:
    await client.post("/api/diagrams/import-json", files=json_file(diagram_example))
    ops = [
        {"op": "set", "path": "/shapes/N/x", "value": 600},
        {"op": "set", "path": "/connectors/c11/points", "value": [[536, 330], [600, 330]]},
    ]

    response = await client.patch(
        f"/api/diagrams/{DIAGRAM_ID}", json={"baseVersion": 0, "ops": ops}
    )
    saved = (await client.get(f"/api/diagrams/{DIAGRAM_ID}")).json()

    shape = next(entry for entry in saved["document"]["shapes"] if entry["id"] == "N")
    assert (response.status_code, shape["x"], saved["revision"]) == (200, 600, 1)


async def test_SW_21_patch_that_breaks_geometry_is_rejected(
    client: AsyncClient, diagram_example: dict[str, Any]
) -> None:
    await client.post("/api/diagrams/import-json", files=json_file(diagram_example))

    response = await client.patch(
        f"/api/diagrams/{DIAGRAM_ID}",
        json={"baseVersion": 0, "ops": [{"op": "set", "path": "/shapes/N/x", "value": 600}]},
    )

    assert (response.status_code, response.json()["detail"].startswith("Connector c11")) == (
        422,
        True,
    )


async def test_RM_16_import_json_rejects_roadmap_file(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    response = await client.post("/api/diagrams/import-json", files=json_file(roadmap_example))

    assert response.json()["detail"] == "This file is a roadmap, not a swimlane diagram"


async def test_get_missing_returns_404_detail(client: AsyncClient) -> None:
    response = await client.get(f"/api/diagrams/{DIAGRAM_ID}")

    assert (response.status_code, response.json()["detail"]) == (
        404,
        "We couldn't find that diagram. It may have been deleted.",
    )


async def test_NF_3_import_json_over_limit_returns_413(
    client: AsyncClient, monkeypatch: Any
) -> None:
    monkeypatch.setattr("app.api.routers.diagrams.MAX_UPLOAD_BYTES", 10)

    response = await client.post("/api/diagrams/import-json", files=json_file({"a": "0123456789"}))

    assert (response.status_code, response.json()["detail"]) == (
        413,
        "Files must be 20 MB or smaller",
    )
