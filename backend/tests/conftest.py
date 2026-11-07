from collections.abc import AsyncIterator, Iterator
from datetime import date
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import clock
from app.main import create_app

FROZEN_TODAY = date(2026, 11, 6)


@pytest.fixture(autouse=True)
def frozen_today() -> Iterator[date]:
    clock.freeze(FROZEN_TODAY)
    yield FROZEN_TODAY
    clock.freeze(None)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as async_client:
        yield async_client


@pytest.fixture
def tmp_database_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'test.db'}"
