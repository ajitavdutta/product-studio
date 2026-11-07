from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.errors import problem_responses
from app.api.uploads import read_capped
from app.core.limits import MAX_LOGO_BYTES, MAX_LOGO_MESSAGE
from app.db import get_session
from app.schemas.assets import AssetRead
from app.services import assets as service

router = APIRouter(prefix="/assets", tags=["assets"])

SessionDep = Annotated[Session, Depends(get_session)]

# Served files never run as a page: no sniffing, no scripts, no external loads (NF-3).
ASSET_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
}
ASSET_CONTENT_TYPES = ("image/png", "image/jpeg", "image/webp", "image/svg+xml")


@router.post(
    "",
    response_model=AssetRead,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(413, 415),
)
def upload_asset(file: UploadFile, session: SessionDep) -> AssetRead:
    """Upload a logo (PNG, SVG, JPEG or WebP, 2 MB at most). The type is read from the bytes."""
    data = read_capped(file, MAX_LOGO_BYTES, MAX_LOGO_MESSAGE)
    return service.upload_logo(session, data)


@router.get(
    "/{asset_id}",
    response_class=Response,
    responses={
        200: {"content": {content_type: {} for content_type in ASSET_CONTENT_TYPES}},
        **problem_responses(404),
    },
)
def get_asset(asset_id: UUID, session: SessionDep) -> Response:
    """The uploaded file's bytes, served with its sniffed type."""
    content, mime = service.get_asset_content(session, asset_id)
    return Response(content=content, media_type=mime, headers=ASSET_HEADERS)
