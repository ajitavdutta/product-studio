from typing import Annotated

from fastapi import APIRouter, Depends, Form, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.api.uploads import read_capped
from app.core.limits import MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE
from app.db import get_session
from app.schemas.document_api import (
    DeleteImpact,
    DocumentPatch,
    DocumentSummary,
    PatchResult,
    RoadmapRead,
)
from app.schemas.documents import RoadmapDocument
from app.schemas.resync import ResyncApply, RoadmapResyncRead
from app.services import documents as service
from app.services import resync as resync_service
from app.services.resync import ResyncMapping

router = APIRouter(prefix="/roadmaps", tags=["roadmaps"])

# Routes returning a document use response_model_exclude_none: absent optional fields stay
# absent, as in the document format, so a document read here re-imports losslessly (ADR-4).

SessionDep = Annotated[Session, Depends(get_session)]
TemplateIdForm = Annotated[
    str | None,
    Form(alias="templateId", description="Mapping template to use instead of the roadmap's own"),
]
ResyncMappingForm = Annotated[
    ResyncMapping,
    Form(
        description=(
            "template (default): templateId, else the roadmap's own template. "
            "auto: no template; columns are matched by name only. Don't send templateId with it."
        )
    ),
]


@router.get("", response_model=list[DocumentSummary])
def list_roadmaps(session: SessionDep) -> list[DocumentSummary]:
    """Every roadmap, most recently updated first."""
    return service.list_documents(session, "roadmap")


@router.post(
    "",
    response_model=RoadmapRead,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422),
)
def create_roadmap(document: RoadmapDocument, session: SessionDep) -> RoadmapRead:
    """Save a roadmap document. Its id is kept unless already taken."""
    return service.create_document(session, document)


# Declared before /{roadmap_id} so "import-json" is never read as an id.
@router.post(
    "/import-json",
    response_model=RoadmapRead,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(413, 422),
)
def import_roadmap_json(file: UploadFile, session: SessionDep) -> RoadmapRead:
    """Open a downloaded roadmap `.json` (any supported schemaVersion) as a new roadmap."""
    data = read_capped(file, MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE)
    return service.import_json(session, "roadmap", data)


@router.get(
    "/{roadmap_id}",
    response_model=RoadmapRead,
    response_model_exclude_none=True,
    responses=problem_responses(404),
)
def get_roadmap(roadmap_id: str, session: SessionDep) -> RoadmapRead:
    return service.get_roadmap(session, service.parse_document_id(roadmap_id, "roadmap"))


@router.patch(
    "/{roadmap_id}", response_model=PatchResult, responses=problem_responses(404, 409, 422)
)
def patch_roadmap(roadmap_id: str, patch: DocumentPatch, session: SessionDep) -> PatchResult:
    """Autosave: apply ops made against `baseVersion` (G-2)."""
    return service.patch_document(
        session, "roadmap", service.parse_document_id(roadmap_id, "roadmap"), patch
    )


@router.get(
    "/{roadmap_id}/delete-impact", response_model=DeleteImpact, responses=problem_responses(404)
)
def get_roadmap_delete_impact(roadmap_id: str, session: SessionDep) -> DeleteImpact:
    """What deleting this roadmap would unlink, for the confirmation dialog."""
    return service.delete_impact(
        session, "roadmap", service.parse_document_id(roadmap_id, "roadmap")
    )


@router.delete("/{roadmap_id}", response_model=DeleteImpact, responses=problem_responses(404, 409))
def delete_roadmap(roadmap_id: str, session: SessionDep) -> DeleteImpact:
    """Delete the roadmap and unlink its diagrams (they are kept)."""
    return service.delete_document(
        session, "roadmap", service.parse_document_id(roadmap_id, "roadmap")
    )


@router.get(
    "/{roadmap_id}/document", response_model=RoadmapDocument, responses=problem_responses(404)
)
def download_roadmap(roadmap_id: str, session: SessionDep) -> JSONResponse:
    """The exact roadmap document, as a `.json` attachment (Save JSON)."""
    body, file_name = service.download(
        session, "roadmap", service.parse_document_id(roadmap_id, "roadmap")
    )
    # file_name comes from file_name_for, so it is already limited to [a-z0-9.-].
    return JSONResponse(
        content=body, headers={"Content-Disposition": f'attachment; filename="{file_name}"'}
    )


@router.post(
    "/{roadmap_id}/resync",
    response_model=RoadmapResyncRead,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(404, 413, 422),
)
def create_roadmap_resync(
    roadmap_id: str,
    file: UploadFile,
    session: SessionDep,
    template_id: TemplateIdForm = None,
    mapping: ResyncMappingForm = "template",
) -> RoadmapResyncRead:
    """Diff the roadmap against a newer Jira export (20 MB at most); nothing is written yet."""
    parsed_id = service.parse_document_id(roadmap_id, "roadmap")
    data = read_capped(file, MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE)
    return resync_service.create_resync(
        session, parsed_id, file.filename, data, template_id, mapping
    )


@router.post(
    "/{roadmap_id}/resync/{resync_id}/apply",
    response_model=RoadmapRead,
    response_model_exclude_none=True,
    responses=problem_responses(404, 409, 422),
)
def apply_roadmap_resync(
    roadmap_id: str, resync_id: str, request: ResyncApply, session: SessionDep
) -> RoadmapRead:
    """Apply the chosen changes of a re-sync made against the current revision (RM-15)."""
    return resync_service.apply_resync(
        session,
        service.parse_document_id(roadmap_id, "roadmap"),
        resync_service.parse_resync_id(resync_id),
        request,
    )
