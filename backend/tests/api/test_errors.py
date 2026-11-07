from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.errors import register_error_handlers
from app.schemas.errors import ErrorItem
from app.services.errors import InvalidInputError, NotFoundError


def app_raising(error: Exception) -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise error

    return app


async def get_boom(app: FastAPI) -> tuple[int, object]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/boom")
    return response.status_code, response.json()


async def test_not_found_error_returns_problem_json() -> None:
    result = await get_boom(app_raising(NotFoundError("We couldn't find that roadmap.")))

    assert result == (404, {"detail": "We couldn't find that roadmap."})


async def test_NF_3_invalid_input_error_lists_paths() -> None:
    error = InvalidInputError("Bad", [ErrorItem(path="/items/0/end", message="Bad")])

    result = await get_boom(app_raising(error))

    assert result == (
        422,
        {"detail": "Bad", "errors": [{"path": "/items/0/end", "message": "Bad"}]},
    )
