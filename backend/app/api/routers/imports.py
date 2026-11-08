from typing import Annotated

from fastapi import APIRouter, Depends, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.api.uploads import read_capped
from app.core.limits import MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE
from app.db import get_session
from app.schemas.document_api import RoadmapRead
from app.schemas.imports import (
    ImportCommit,
    ImportMapping,
    ImportPreview,
    ImportSessionRead,
    SampleExportInfo,
)
from app.services import imports as service

router = APIRouter(prefix="/imports", tags=["imports"])

SessionDep = Annotated[Session, Depends(get_session)]
TemplateIdQuery = Annotated[
    str | None,
    Query(alias="templateId", description="Mapping template to apply first (IMP-9)"),
]


@router.post(
    "/jira",
    response_model=ImportSessionRead,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(413, 422),
)
def upload_jira_export(
    file: UploadFile, session: SessionDep, template_id: TemplateIdQuery = None
) -> ImportSessionRead:
    """Read a Jira CSV, JSON or XML export (20 MB at most) and suggest its mapping."""
    data = read_capped(file, MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE)
    return service.create_session(session, file.filename, data, template_id)


# The /jira/sample routes are declared before /{import_id}, so "jira" is never read as an id.
@router.get("/jira/sample", response_model=SampleExportInfo)
def get_sample_export_info() -> SampleExportInfo:
    """The bundled sample's file name and issue count, for the sample button."""
    return service.sample_info()


@router.post(
    "/jira/sample",
    response_model=ImportSessionRead,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422),
)
def start_sample_import(
    session: SessionDep, template_id: TemplateIdQuery = None
) -> ImportSessionRead:
    """Start an import from the bundled sample export."""
    return service.create_sample_session(session, template_id)


@router.get("/{import_id}", response_model=ImportSessionRead, responses=problem_responses(404))
def get_import(import_id: str, session: SessionDep) -> ImportSessionRead:
    """The import as uploaded, until it expires an hour later."""
    return service.get_session(session, import_id)


@router.post(
    "/{import_id}/preview", response_model=ImportPreview, responses=problem_responses(404, 422)
)
def preview_import(import_id: str, mapping: ImportMapping, session: SessionDep) -> ImportPreview:
    """The roadmap this mapping would create, with counts and warnings. Saves nothing."""
    return service.preview(session, import_id, mapping)


@router.post(
    "/{import_id}/commit",
    response_model=RoadmapRead,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(404, 422),
)
def commit_import(import_id: str, request: ImportCommit, session: SessionDep) -> RoadmapRead:
    """Create the roadmap, save the mapping template and end the import (IMP-12)."""
    return service.commit(session, import_id, request)
