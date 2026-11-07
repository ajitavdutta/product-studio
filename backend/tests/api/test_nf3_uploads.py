"""NF-3 acceptance gaps: upload caps, no evaluation of JSON, SVG served sanitised."""

import json
from typing import Any

from httpx import AsyncClient

from app.core.limits import MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE

ASSET_CSP = "default-src 'none'; style-src 'unsafe-inline'"
PAYLOAD_NAME = "__import__('os').system('touch /tmp/pwned')"
HOSTILE_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'
    b"<script>alert(2)</script>"
    b'<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div>'
    b"</foreignObject>"
    b'<rect width="4" height="4"/>'
    b"</svg>"
)


def json_upload(content: bytes, file_name: str = "plan.json") -> dict[str, Any]:
    return {"file": (file_name, content, "application/json")}


async def test_NF_3_import_json_rejects_over_20mb(client: AsyncClient) -> None:
    # Valid JSON padded past the cap, so only the size can be the reason for the rejection.
    oversized = b"{}" + b" " * (MAX_UPLOAD_BYTES - 1)

    response = await client.post("/api/roadmaps/import-json", files=json_upload(oversized))

    assert (response.status_code, response.json()["detail"]) == (413, MAX_UPLOAD_MESSAGE)


async def test_NF_3_import_json_never_evaluates(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    roadmap_example["name"] = PAYLOAD_NAME
    roadmap_example["items"][0]["notes"] = PAYLOAD_NAME

    response = await client.post(
        "/api/roadmaps/import-json", files=json_upload(json.dumps(roadmap_example).encode())
    )
    document = response.json()["document"]

    assert (response.status_code, document["name"], document["items"][0]["notes"]) == (
        201,
        PAYLOAD_NAME,
        PAYLOAD_NAME,
    )


async def test_NF_3_import_json_code_in_unknown_field_fails_validation(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    roadmap_example["__class__"] = PAYLOAD_NAME

    response = await client.post(
        "/api/roadmaps/import-json", files=json_upload(json.dumps(roadmap_example).encode())
    )

    assert response.status_code == 422


async def test_NF_3_svg_upload_served_sanitised(client: AsyncClient) -> None:
    asset = (
        await client.post("/api/assets", files={"file": ("logo.svg", HOSTILE_SVG, "image/svg+xml")})
    ).json()

    served = await client.get(f"/api/assets/{asset['id']}")
    body = served.content.lower()

    assert (
        b"<script" in body,
        b"onload" in body,
        b"foreignobject" in body,
        b"<rect" in body,
        served.headers["content-security-policy"],
    ) == (False, False, False, True, ASSET_CSP)
