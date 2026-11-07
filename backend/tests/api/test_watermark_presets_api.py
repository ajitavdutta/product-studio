import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient

from app.documents.defaults import DEFAULT_WATERMARK_OPACITY

REPO_ROOT = Path(__file__).resolve().parents[3]
TOKENS = json.loads((REPO_ROOT / "shared" / "design-tokens.json").read_text(encoding="utf-8"))
MISSING_ID = "00000000-0000-4000-8000-000000000000"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def text_preset(name: str = "Confidential", **overrides: Any) -> dict[str, Any]:
    return {"name": name, "type": "text", "text": "CONFIDENTIAL · {user}", **overrides}


async def create(client: AsyncClient, body: dict[str, Any]) -> dict[str, Any]:
    response = await client.post("/api/watermark-presets", json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def default_flags(client: AsyncClient) -> dict[str, bool]:
    presets = (await client.get("/api/watermark-presets")).json()
    return {preset["name"]: preset["isDefault"] for preset in presets}


async def test_G_4_setting_default_preset_clears_previous_default(client: AsyncClient) -> None:
    await create(client, text_preset("Confidential", isDefault=True))
    draft = await create(client, text_preset("Draft"))

    await client.patch(f"/api/watermark-presets/{draft['id']}", json={"isDefault": True})

    assert await default_flags(client) == {"Confidential": False, "Draft": True}


async def test_G_4_creating_default_preset_clears_previous_default(client: AsyncClient) -> None:
    await create(client, text_preset("Confidential", isDefault=True))

    await create(client, text_preset("Draft", isDefault=True))

    assert await default_flags(client) == {"Confidential": False, "Draft": True}


async def test_text_preset_requires_text(client: AsyncClient) -> None:
    response = await client.post(
        "/api/watermark-presets", json={"name": "Empty", "type": "text", "text": "  "}
    )

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "A text watermark needs some text",
    )


async def test_patch_to_image_without_logo_422(client: AsyncClient) -> None:
    preset = await create(client, text_preset())

    response = await client.patch(f"/api/watermark-presets/{preset['id']}", json={"type": "image"})

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "An image watermark needs a logo",
    )


async def test_opacity_bounds_5_to_50_percent(client: AsyncClient) -> None:
    statuses = [
        (await client.post("/api/watermark-presets", json=text_preset(opacity=opacity))).status_code
        for opacity in (0.04, 0.05, 0.5, 0.51)
    ]

    assert statuses == [422, 201, 201, 422]


async def test_image_preset_requires_existing_asset(client: AsyncClient) -> None:
    response = await client.post(
        "/api/watermark-presets",
        json={"name": "Logo", "type": "image", "imageAssetId": MISSING_ID},
    )

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "That logo no longer exists. Upload it again.",
    )


async def test_image_preset_with_uploaded_logo(client: AsyncClient) -> None:
    files = {"file": ("logo.png", PNG_BYTES, "image/png")}
    asset = (await client.post("/api/assets", files=files)).json()

    preset = await create(
        client, {"name": "Company logo", "type": "image", "imageAssetId": asset["id"]}
    )

    assert preset["imageAssetId"] == asset["id"]


async def test_deleting_default_preset_clears_setting(client: AsyncClient) -> None:
    preset = await create(client, text_preset(isDefault=True))
    before = (await client.get("/api/settings")).json()["defaultPresetId"]

    await client.delete(f"/api/watermark-presets/{preset['id']}")
    after = (await client.get("/api/settings")).json()["defaultPresetId"]

    assert (before, after) == (preset["id"], None)


async def test_default_opacity_matches_design_tokens(client: AsyncClient) -> None:
    preset = await create(client, text_preset())

    assert (
        preset["opacity"],
        DEFAULT_WATERMARK_OPACITY,
    ) == (TOKENS["watermark"]["defaultOpacity"],) * 2


async def test_preset_colors_match_design_tokens(client: AsyncClient) -> None:
    statuses = {
        color: (
            await client.post("/api/watermark-presets", json=text_preset(color=color))
        ).status_code
        for color in TOKENS["watermark"]["colors"]
    }

    assert set(statuses.values()) == {201}


async def test_watermark_preset_404(client: AsyncClient) -> None:
    response = await client.get(f"/api/watermark-presets/{MISSING_ID}")

    assert response.status_code == 404
