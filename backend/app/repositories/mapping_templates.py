"""Rows of the `mapping_templates` table."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MappingTemplate


def get(session: Session, template_id: str) -> MappingTemplate | None:
    return session.get(MappingTemplate, template_id)


def list_all(session: Session) -> list[MappingTemplate]:
    """Alphabetical, for the template picker; id breaks ties."""
    return list(
        session.scalars(select(MappingTemplate).order_by(MappingTemplate.name, MappingTemplate.id))
    )


def add(session: Session, row: MappingTemplate) -> None:
    session.add(row)


def delete(session: Session, row: MappingTemplate) -> None:
    session.delete(row)
