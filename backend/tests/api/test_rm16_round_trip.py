"""RM-16: a v0 file imported through the API downloads as the expected v1 document."""

import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient

from tests.conftest import EXAMPLES_DIR

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "documents" / "fixtures"
V1_FROM_V0 = FIXTURES_DIR / "roadmap.v1-from-v0.json"


async def test_RM_16_v0_file_imports_then_downloads_as_v1(client: AsyncClient) -> None:
    v0_bytes = (EXAMPLES_DIR / "roadmap.v0.json").read_bytes()
    expected: dict[str, Any] = json.loads(V1_FROM_V0.read_text(encoding="utf-8"))

    created = await client.post(
        "/api/roadmaps/import-json",
        files={"file": ("roadmap.v0.json", v0_bytes, "application/json")},
    )
    downloaded = await client.get(f"/api/roadmaps/{created.json()['id']}/document")

    assert (created.status_code, downloaded.json()) == (201, expected)


async def test_RM_15_edited_fields_and_synced_at_round_trip(
    client: AsyncClient, roadmap_example: dict[str, Any]
) -> None:
    roadmap_example["items"][0]["editedFields"] = ["title", "start", "end"]
    roadmap_example["source"]["syncedAt"] = "2026-11-07T09:30:00+05:30"
    await client.post("/api/roadmaps", json=roadmap_example)
    roadmap_id = roadmap_example["id"]
    downloaded = (await client.get(f"/api/roadmaps/{roadmap_id}/document")).json()
    await client.delete(f"/api/roadmaps/{roadmap_id}")

    reimported = await client.post(
        "/api/roadmaps/import-json",
        files={"file": ("plan.json", json.dumps(downloaded).encode(), "application/json")},
    )

    assert (downloaded, reimported.json()["document"]) == (roadmap_example, roadmap_example)
