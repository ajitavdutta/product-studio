"""Rows of the `roadmap_resyncs` table."""

from datetime import datetime

from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.models import RoadmapResync


def add(session: Session, row: RoadmapResync) -> None:
    session.add(row)


def get(session: Session, resync_id: str) -> RoadmapResync | None:
    return session.get(RoadmapResync, resync_id)


def purge_older_than(session: Session, cutoff: datetime) -> None:
    """Delete every re-sync created before `cutoff`, without committing."""
    session.execute(sql_delete(RoadmapResync).where(RoadmapResync.created_at < cutoff))


def delete(session: Session, row: RoadmapResync) -> None:
    session.delete(row)
