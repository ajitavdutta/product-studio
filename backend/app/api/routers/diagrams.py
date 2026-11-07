from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.api.uploads import read_capped
from app.core.limits import MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE
from app.db import get_session
from app.schemas.document_api import (
    DeleteImpact,
    DiagramCreate,
    DiagramRead,
    DocumentPatch,
    DocumentSummary,
    PatchResult,
)
from app.schemas.documents import DiagramDocument
from app.services import documents as service

router = APIRouter(prefix="/diagrams", tags=["diagrams"])

# Routes returning a document use response_model_exclude_none: absent optional fields stay
# absent, as in the document format, so a document read here re-imports losslessly (ADR-4).

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[DocumentSummary])
def list_diagrams(session: SessionDep) -> list[DocumentSummary]:
    """Every diagram, most recently updated first."""
    return service.list_documents(session, "diagram")


@router.post(
    "",
    response_model=DiagramRead,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(404, 422),
)
def create_diagram(request: DiagramCreate, session: SessionDep) -> DiagramRead:
    """Start a diagram from three blank lanes or from a roadmap's teams (SW-21)."""
    return service.create_diagram(session, request)


# Declared before /{diagram_id} so "import-json" is never read as an id.
@router.post(
    "/import-json",
    response_model=DiagramRead,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(413, 422),
)
def import_diagram_json(file: UploadFile, session: SessionDep) -> DiagramRead:
    """Open a downloaded `.swimlane.json` as a new diagram."""
    data = read_capped(file, MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE)
    return service.import_json(session, "diagram", data)


@router.get(
    "/{diagram_id}",
    response_model=DiagramRead,
    response_model_exclude_none=True,
    responses=problem_responses(404),
)
def get_diagram(diagram_id: UUID, session: SessionDep) -> DiagramRead:
    return service.get_diagram(session, diagram_id)


@router.patch(
    "/{diagram_id}", response_model=PatchResult, responses=problem_responses(404, 409, 422)
)
def patch_diagram(diagram_id: UUID, patch: DocumentPatch, session: SessionDep) -> PatchResult:
    """Autosave: apply ops made against `baseVersion` (G-2)."""
    return service.patch_document(session, "diagram", diagram_id, patch)


@router.get(
    "/{diagram_id}/delete-impact", response_model=DeleteImpact, responses=problem_responses(404)
)
def get_diagram_delete_impact(diagram_id: UUID, session: SessionDep) -> DeleteImpact:
    """What deleting this diagram would unlink, for the confirmation dialog."""
    return service.delete_impact(session, "diagram", diagram_id)


@router.delete("/{diagram_id}", response_model=DeleteImpact, responses=problem_responses(404, 409))
def delete_diagram(diagram_id: UUID, session: SessionDep) -> DeleteImpact:
    """Delete the diagram and remove it from its roadmap's links (the roadmap is kept)."""
    return service.delete_document(session, "diagram", diagram_id)


@router.get(
    "/{diagram_id}/document", response_model=DiagramDocument, responses=problem_responses(404)
)
def download_diagram(diagram_id: UUID, session: SessionDep) -> JSONResponse:
    """The exact diagram document, as a `.swimlane.json` attachment (Save JSON)."""
    body, file_name = service.download(session, "diagram", diagram_id)
    # file_name comes from file_name_for, so it is already limited to [a-z0-9.-].
    return JSONResponse(
        content=body, headers={"Content-Disposition": f'attachment; filename="{file_name}"'}
    )
