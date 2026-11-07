import subprocess
import sys
from datetime import date
from pathlib import Path

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.db import get_session
from app.models import Document

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_FILE = "product_studio.db"


async def test_client_uses_temporary_database(api_app: FastAPI, client: AsyncClient) -> None:
    await client.get("/api/health")

    assert get_session in api_app.dependency_overrides


def test_importing_app_does_not_create_default_database(tmp_path: Path) -> None:
    # A fresh interpreter in an empty directory: the default SQLite URL is relative to cwd.
    subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=tmp_path,
        env={"PYTHONPATH": str(BACKEND_DIR)},
        check=True,
    )

    assert not (tmp_path / DEFAULT_DATABASE_FILE).exists()


def test_updated_at_moves_on_update(db_session: Session) -> None:
    db_session.add(
        Document(
            id="00000000-0000-0000-0000-000000000001",
            kind="roadmap",
            name="Before",
            schema_version=1,
            revision=0,
            body={},
        )
    )
    db_session.commit()
    clock.freeze(date(2026, 11, 7))

    row = db_session.scalars(select(Document)).one()
    row.name = "After"
    db_session.commit()

    assert row.updated_at.date() == date(2026, 11, 7)
