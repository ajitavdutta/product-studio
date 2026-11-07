from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.db import get_session
from app.schemas.mapping_templates import (
    MappingTemplateCreate,
    MappingTemplateRead,
    MappingTemplateUpdate,
)
from app.services import mapping_templates as service

router = APIRouter(prefix="/mapping-templates", tags=["mapping-templates"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[MappingTemplateRead])
def list_mapping_templates(session: SessionDep) -> list[MappingTemplateRead]:
    """Every saved mapping template, by name."""
    return service.list_templates(session)


@router.post(
    "",
    response_model=MappingTemplateRead,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422),
)
def create_mapping_template(
    request: MappingTemplateCreate, session: SessionDep
) -> MappingTemplateRead:
    return service.create_template(session, request)


@router.get("/{template_id}", response_model=MappingTemplateRead, responses=problem_responses(404))
def get_mapping_template(template_id: UUID, session: SessionDep) -> MappingTemplateRead:
    return service.get_template(session, template_id)


@router.patch(
    "/{template_id}", response_model=MappingTemplateRead, responses=problem_responses(404, 422)
)
def update_mapping_template(
    template_id: UUID, update: MappingTemplateUpdate, session: SessionDep
) -> MappingTemplateRead:
    """Change only the fields sent (Update mapping template)."""
    return service.update_template(session, template_id, update)


@router.delete(
    "/{template_id}", response_model=MappingTemplateRead, responses=problem_responses(404)
)
def delete_mapping_template(template_id: UUID, session: SessionDep) -> MappingTemplateRead:
    """Delete the template and return what was deleted."""
    return service.delete_template(session, template_id)
