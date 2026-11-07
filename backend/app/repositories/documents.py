"""Rows of the `documents` table."""

from typing import Any, cast

from sqlalchemy import CursorResult, select, update
from sqlalchemy import exists as sql_exists
from sqlalchemy.orm import Session

from app.core import clock
from app.models import Document
from app.schemas.documents import DocumentKind


def get(session: Session, kind: DocumentKind, document_id: str) -> Document | None:
    return session.scalars(
        select(Document).where(Document.id == document_id, Document.kind == kind)
    ).one_or_none()


def exists(session: Session, document_id: str) -> bool:
    return bool(session.scalar(select(sql_exists().where(Document.id == document_id))))


def list_by_kind(session: Session, kind: DocumentKind) -> list[Document]:
    """Most recently updated first; name then id break ties (rows can share `updated_at`)."""
    statement = (
        select(Document)
        .where(Document.kind == kind)
        .order_by(Document.updated_at.desc(), Document.name, Document.id)
    )
    return list(session.scalars(statement))


def add(session: Session, row: Document) -> None:
    session.add(row)


def update_if_revision(
    session: Session, document_id: str, base_revision: int, body: dict[str, Any], name: str
) -> bool:
    """Save `body` only if the row is still at `base_revision`; True when it was saved.

    One conditional UPDATE, so two concurrent saves can't both win (optimistic concurrency).
    `body` must be a new dict: the JSON column doesn't track in-place mutation.
    """
    statement = (
        update(Document)
        .where(Document.id == document_id, Document.revision == base_revision)
        .values(body=body, name=name, revision=Document.revision + 1, updated_at=clock.now())
        .execution_options(synchronize_session="fetch")
    )
    result = cast(CursorResult[Any], session.execute(statement))
    return result.rowcount == 1


def delete(session: Session, row: Document) -> None:
    session.delete(row)
