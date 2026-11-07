"""Rows of the `assets` table."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Asset


def get(session: Session, asset_id: str) -> Asset | None:
    return session.get(Asset, asset_id)


def exists(session: Session, asset_id: str) -> bool:
    return get(session, asset_id) is not None


def get_by_sha256(session: Session, sha256: str) -> Asset | None:
    return session.scalars(select(Asset).where(Asset.sha256 == sha256)).one_or_none()


def add(session: Session, row: Asset) -> None:
    session.add(row)
