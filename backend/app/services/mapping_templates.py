"""Saved Jira field-mapping templates (IMP-9): create, read, update and delete."""

from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.documents.errors import to_problem
from app.models import MappingTemplate
from app.repositories import mapping_templates as repository
from app.schemas.mapping_templates import (
    MappingTemplateCreate,
    MappingTemplateRead,
    MappingTemplateUpdate,
)
from app.services.errors import NotFoundError

NOT_FOUND_MESSAGE = "We couldn't find that mapping template. It may have been deleted."


def _require_row(session: Session, template_id: UUID) -> MappingTemplate:
    row = repository.get(session, str(template_id))
    if row is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return row


def list_templates(session: Session) -> list[MappingTemplateRead]:
    return [MappingTemplateRead.model_validate(row) for row in repository.list_all(session)]


def get_template(session: Session, template_id: UUID) -> MappingTemplateRead:
    return MappingTemplateRead.model_validate(_require_row(session, template_id))


def create_template(session: Session, request: MappingTemplateCreate) -> MappingTemplateRead:
    row = MappingTemplate(id=str(uuid4()), **request.model_dump())
    repository.add(session, row)
    session.commit()
    return MappingTemplateRead.model_validate(row)


def update_template(
    session: Session, template_id: UUID, update: MappingTemplateUpdate
) -> MappingTemplateRead:
    """Change only the fields sent; the merged template must still be valid."""
    row = _require_row(session, template_id)
    current = MappingTemplateCreate.model_validate(row, from_attributes=True)
    merged_fields = {**current.model_dump(), **update.model_dump(exclude_unset=True)}
    try:
        merged = MappingTemplateCreate.model_validate(merged_fields)
    except ValidationError as exc:
        raise to_problem(exc) from exc
    for field, value in merged.model_dump().items():
        setattr(row, field, value)
    session.commit()
    return MappingTemplateRead.model_validate(row)


def delete_template(session: Session, template_id: UUID) -> MappingTemplateRead:
    """Delete the template. Roadmaps that name it keep working (dangling ids are tolerated)."""
    row = _require_row(session, template_id)
    deleted = MappingTemplateRead.model_validate(row)
    repository.delete(session, row)
    session.commit()
    return deleted
