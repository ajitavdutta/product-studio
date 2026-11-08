from datetime import date
from typing import Any

from httpx import AsyncClient

from app.core import clock

MISSING_ID = "00000000-0000-4000-8000-000000000000"


def template_body(name: str = "Payments Jira") -> dict[str, Any]:
    return {
        "name": name,
        "jiraSite": "acme.atlassian.net",
        "columnMap": {"Issue key": "key", "customfield_10016": "points"},
        "statusMap": {"In QA": "in-progress"},
    }


async def test_mapping_template_crud(client: AsyncClient) -> None:
    created = (await client.post("/api/mapping-templates", json=template_body())).json()
    template_url = f"/api/mapping-templates/{created['id']}"
    clock.freeze(date(2026, 11, 7))

    patched = (await client.patch(template_url, json={"name": "Payments v2"})).json()
    listed = (await client.get("/api/mapping-templates")).json()
    fetched = (await client.get(template_url)).json()
    deleted = await client.delete(template_url)
    after_delete = await client.get(template_url)

    assert (
        created["updatedAt"].startswith("2026-11-06"),
        patched["name"],
        patched["columnMap"] == template_body()["columnMap"],
        patched["updatedAt"].startswith("2026-11-07"),
        [template["id"] for template in listed],
        fetched == patched,
        deleted.status_code,
        after_delete.status_code,
    ) == (True, "Payments v2", True, True, [created["id"]], True, 200, 404)


async def test_mapping_template_patch_null_clears_jira_site(client: AsyncClient) -> None:
    created = (await client.post("/api/mapping-templates", json=template_body())).json()

    patched = await client.patch(f"/api/mapping-templates/{created['id']}", json={"jiraSite": None})

    assert patched.json().get("jiraSite") is None


async def test_mapping_template_patch_null_name_422(client: AsyncClient) -> None:
    created = (await client.post("/api/mapping-templates", json=template_body())).json()

    patched = await client.patch(f"/api/mapping-templates/{created['id']}", json={"name": None})

    assert (patched.status_code, patched.json()["errors"][0]["path"]) == (422, "/name")


async def test_mapping_templates_listed_by_name(client: AsyncClient) -> None:
    await client.post("/api/mapping-templates", json=template_body("Zeta"))
    await client.post("/api/mapping-templates", json=template_body("Alpha"))

    listed = (await client.get("/api/mapping-templates")).json()

    assert [template["name"] for template in listed] == ["Alpha", "Zeta"]


async def test_mapping_template_404(client: AsyncClient) -> None:
    response = await client.get(f"/api/mapping-templates/{MISSING_ID}")

    assert (response.status_code, response.json()) == (
        404,
        {"detail": "We couldn't find that mapping template. It may have been deleted."},
    )


async def test_mapping_template_empty_name_422(client: AsyncClient) -> None:
    response = await client.post("/api/mapping-templates", json=template_body(""))

    assert response.status_code == 422


async def test_IMP_9_column_map_rejects_unknown_field(client: AsyncClient) -> None:
    body = {**template_body(), "columnMap": {"Issue key": "key", "Story Points": "effort"}}

    response = await client.post("/api/mapping-templates", json=body)

    assert (response.status_code, response.json()["detail"]) == (
        422,
        "“Story Points” is mapped to “effort”, which isn't a roadmap field. Use one of: key, "
        "title, type, epic, team, status, sprint, release, points, start, end, tags, ignore.",
    )


async def test_IMP_9_column_map_patch_rejects_unknown_field(client: AsyncClient) -> None:
    created = (await client.post("/api/mapping-templates", json=template_body())).json()

    response = await client.patch(
        f"/api/mapping-templates/{created['id']}", json={"columnMap": {"Sprint": "iteration"}}
    )

    assert (response.status_code, response.json()["errors"][0]["path"]) == (422, "/columnMap")
