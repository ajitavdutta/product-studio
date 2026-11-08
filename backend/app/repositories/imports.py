"""Rows of the `import_sessions` table."""

from datetime import datetime

from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.models import ImportSession


def add(session: Session, row: ImportSession) -> None:
    session.add(row)


def get(session: Session, session_id: str) -> ImportSession | None:
    return session.get(ImportSession, session_id)


def delete(session: Session, row: ImportSession) -> None:
    session.delete(row)


def purge_older_than(session: Session, cutoff: datetime) -> None:
    """Delete every import session created before `cutoff`, without committing."""
    session.execute(sql_delete(ImportSession).where(ImportSession.created_at < cutoff))
