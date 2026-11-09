"""RM-15: the `roadmap_resyncs` table, its repository and its cascade from a roadmap."""

from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models import RoadmapResync
from app.models.roadmap_resync import ROADMAP_RESYNC_TTL
from app.repositories import resyncs as resync_repository

ROADMAP_ID = "0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31"
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def resync_row(resync_id: str, created_at: datetime = NOW) -> RoadmapResync:
    return RoadmapResync(
        id=resync_id,
        roadmap_id=ROADMAP_ID,
        base_revision=0,
        file_name="jira-export-payments-2026-11-20.csv",
        template_id=None,
        changes=[{"id": "dates:PAY-155", "payload": {"start": "2027-03-12"}}],
        warnings=[],
        created_at=created_at,
    )


async def test_RM_15_deleting_roadmap_deletes_its_resyncs(
    client: AsyncClient, db_session: Session, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)
    resync_repository.add(db_session, resync_row("rs-1"))
    db_session.commit()

    await client.delete(f"/api/roadmaps/{ROADMAP_ID}")
    db_session.expire_all()

    assert resync_repository.get(db_session, "rs-1") is None


async def test_RM_15_resync_row_round_trips_changes(
    client: AsyncClient, db_session: Session, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)
    resync_repository.add(db_session, resync_row("rs-1"))
    db_session.commit()
    db_session.expire_all()

    row = resync_repository.get(db_session, "rs-1")

    assert row is not None and row.changes == resync_row("rs-1").changes


async def test_RM_15_purge_removes_only_expired_resyncs(
    client: AsyncClient, db_session: Session, roadmap_example: dict[str, Any]
) -> None:
    await client.post("/api/roadmaps", json=roadmap_example)
    expired_at = NOW - ROADMAP_RESYNC_TTL - timedelta(seconds=1)
    resync_repository.add(db_session, resync_row("rs-old", created_at=expired_at))
    resync_repository.add(db_session, resync_row("rs-new"))
    db_session.commit()

    resync_repository.purge_older_than(db_session, NOW - ROADMAP_RESYNC_TTL)
    db_session.commit()

    assert (
        resync_repository.get(db_session, "rs-old"),
        resync_repository.get(db_session, "rs-new") is not None,
    ) == (None, True)
