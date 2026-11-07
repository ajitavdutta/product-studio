"""Uploaded logos: type sniffed from the bytes, SVG sanitised, deduplicated by sha256 (NF-3)."""

import hashlib
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.limits import MAX_LOGO_BYTES, MAX_LOGO_MESSAGE
from app.models import Asset
from app.repositories import assets as repository
from app.schemas.assets import AssetKind, AssetRead
from app.services.errors import NotFoundError, PayloadTooLargeError
from app.services.svg_sanitizer import sanitize_svg

LOGO_KIND: AssetKind = "logo"
SVG_MIME = "image/svg+xml"
NOT_FOUND_MESSAGE = "We couldn't find that file. It may have been deleted."

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"
RIFF_SIGNATURE = b"RIFF"
WEBP_SIGNATURE = b"WEBP"
# A WebP file is RIFF, a 4-byte size, then WEBP.
WEBP_SIGNATURE_OFFSET = 8


def _raster_mime(data: bytes) -> str | None:
    """The image type the bytes start with, or `None` if they aren't PNG, JPEG or WebP."""
    if data.startswith(PNG_SIGNATURE):
        return "image/png"
    if data.startswith(JPEG_SIGNATURE):
        return "image/jpeg"
    webp_end = WEBP_SIGNATURE_OFFSET + len(WEBP_SIGNATURE)
    if data.startswith(RIFF_SIGNATURE) and data[WEBP_SIGNATURE_OFFSET:webp_end] == WEBP_SIGNATURE:
        return "image/webp"
    return None


def _to_read(row: Asset) -> AssetRead:
    return AssetRead(
        id=row.id, kind=LOGO_KIND, mime=row.mime, size=len(row.bytes), sha256=row.sha256
    )


def upload_logo(session: Session, data: bytes) -> AssetRead:
    """Store a logo and return it; the same (sanitised) bytes return the existing asset.

    Raises `PayloadTooLargeError` over 2 MB and `UnsupportedMediaTypeError` for anything
    that isn't PNG, SVG, JPEG or WebP, whatever the client said the type was.
    """
    if len(data) > MAX_LOGO_BYTES:
        raise PayloadTooLargeError(MAX_LOGO_MESSAGE)
    mime = _raster_mime(data)
    stored = data
    if mime is None:
        stored = sanitize_svg(data)
        mime = SVG_MIME
    sha256 = hashlib.sha256(stored).hexdigest()
    existing = repository.get_by_sha256(session, sha256)
    if existing is not None:
        return _to_read(existing)
    row = Asset(id=str(uuid4()), kind=LOGO_KIND, mime=mime, bytes=stored, sha256=sha256)
    repository.add(session, row)
    session.commit()
    return _to_read(row)


def get_asset_content(session: Session, asset_id: UUID) -> tuple[bytes, str]:
    """The stored bytes and their sniffed MIME type."""
    row = repository.get(session, str(asset_id))
    if row is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return row.bytes, row.mime
