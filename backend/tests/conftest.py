import copy
import json
from collections.abc import AsyncIterator, Iterator
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core import clock
from app.db import Base, get_session
from app.main import create_app

FROZEN_TODAY = date(2026, 11, 6)
REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_DIR = REPO_ROOT / "docs" / "examples"


def load_example(file_name: str) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads((EXAMPLES_DIR / file_name).read_text(encoding="utf-8"))
    return loaded


@pytest.fixture
def roadmap_example() -> dict[str, Any]:
    """A fresh copy of docs/examples/roadmap.example.json; tests may mutate it."""
    return copy.deepcopy(load_example("roadmap.example.json"))


@pytest.fixture
def diagram_example() -> dict[str, Any]:
    """A fresh copy of docs/examples/diagram.example.json; tests may mutate it."""
    return copy.deepcopy(load_example("diagram.example.json"))


@pytest.fixture(autouse=True)
def frozen_today() -> Iterator[date]:
    clock.freeze(FROZEN_TODAY)
    yield FROZEN_TODAY
    clock.freeze(None)


@pytest.fixture
def tmp_database_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'test.db'}"


@pytest.fixture
def db_engine(tmp_database_url: str) -> Iterator[Engine]:
    # create_all is enough here; tests/db/test_migrations.py covers the Alembic path.
    engine = create_engine(tmp_database_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_sessionmaker(db_engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(db_engine, expire_on_commit=False)


@pytest.fixture
def db_session(db_sessionmaker: sessionmaker[Session]) -> Iterator[Session]:
    with db_sessionmaker() as session:
        yield session


@pytest.fixture
def api_app(db_sessionmaker: sessionmaker[Session]) -> FastAPI:
    """The app with `get_session` pointed at the temporary test database."""
    app = create_app()

    def override_get_session() -> Iterator[Session]:
        with db_sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    return app


@pytest.fixture
async def client(api_app: FastAPI) -> AsyncIterator[AsyncClient]:
    app = api_app
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as async_client:
        yield async_client
