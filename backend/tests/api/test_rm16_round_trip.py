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
