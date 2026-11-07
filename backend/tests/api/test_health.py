from httpx import AsyncClient

VITE_DEV_ORIGIN = "http://localhost:5173"


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/health")

    assert (response.status_code, response.json()) == (200, {"status": "ok"})


async def test_cors_allows_vite_dev_origin(client: AsyncClient) -> None:
    response = await client.options(
        "/api/health",
        headers={"Origin": VITE_DEV_ORIGIN, "Access-Control-Request-Method": "GET"},
    )

    assert response.headers.get("access-control-allow-origin") == VITE_DEV_ORIGIN
