from typing import Any

from httpx import AsyncClient

MISSING_ID = "00000000-0000-4000-8000-000000000000"


async def create_preset(client: AsyncClient, name: str) -> dict[str, Any]:
    response = await client.post(
        "/api/watermark-presets", json={"name": name, "type": "text", "text": name.upper()}
    )
    created: dict[str, Any] = response.json()
    return created


async def test_G_4_settings_defaults(client: AsyncClient) -> None:
    response = await client.get("/api/settings")

    assert response.json() == {
        "displayName": "",
        "jiraBaseUrl": None,
        "defaultPresetId": None,
        "piCadence": {"sprintsPerPi": 6, "ipSprint": True},
    }


async def test_G_4_put_display_name_persists(client: AsyncClient) -> None:
    await client.put("/api/settings", json={"displayName": "Priya Nair"})

    settings = (await client.get("/api/settings")).json()

    assert settings["displayName"] == "Priya Nair"


async def test_G_4_put_jira_url_and_cadence_persist(client: AsyncClient) -> None:
    await client.put(
        "/api/settings",
        json={
            "jiraBaseUrl": "https://acme.atlassian.net",
            "piCadence": {"sprintsPerPi": 5, "ipSprint": False},
        },
    )

    settings = (await client.get("/api/settings")).json()

    # HttpUrl normalises a bare host by appending "/", so the stored value gains it.
    assert (settings["jiraBaseUrl"], settings["piCadence"]) == (
        "https://acme.atlassian.net/",
        {"sprintsPerPi": 5, "ipSprint": False},
    )


async def test_G_4_put_partial_keeps_other_fields(client: AsyncClient) -> None:
    await client.put(
        "/api/settings",
        json={
            "displayName": "Priya Nair",
            "jiraBaseUrl": "https://acme.atlassian.net/",
            "piCadence": {"sprintsPerPi": 5, "ipSprint": False},
        },
    )

    response = await client.put("/api/settings", json={"displayName": "Sam Lee"})

    assert response.json() == {
        "displayName": "Sam Lee",
        "jiraBaseUrl": "https://acme.atlassian.net/",
        "defaultPresetId": None,
        "piCadence": {"sprintsPerPi": 5, "ipSprint": False},
    }


async def test_G_4_put_null_resets_to_default(client: AsyncClient) -> None:
    await client.put("/api/settings", json={"jiraBaseUrl": "https://acme.atlassian.net/"})

    response = await client.put("/api/settings", json={"jiraBaseUrl": None})

    assert response.json()["jiraBaseUrl"] is None


async def test_G_4_unknown_default_preset_422(client: AsyncClient) -> None:
    response = await client.put("/api/settings", json={"defaultPresetId": MISSING_ID})

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "That watermark preset doesn't exist",
    )


async def test_G_4_default_preset_setting_marks_preset_default(client: AsyncClient) -> None:
    confidential = await create_preset(client, "Confidential")
    draft = await create_preset(client, "Draft")

    settings = (await client.put("/api/settings", json={"defaultPresetId": draft["id"]})).json()
    presets = (await client.get("/api/watermark-presets")).json()

    assert (
        settings["defaultPresetId"],
        {preset["id"]: preset["isDefault"] for preset in presets},
    ) == (draft["id"], {confidential["id"]: False, draft["id"]: True})


async def test_G_4_display_name_over_80_characters_422(client: AsyncClient) -> None:
    response = await client.put("/api/settings", json={"displayName": "x" * 81})

    assert response.status_code == 422


async def test_G_4_invalid_jira_url_422(client: AsyncClient) -> None:
    response = await client.put("/api/settings", json={"jiraBaseUrl": "not a url"})

    assert response.status_code == 422
