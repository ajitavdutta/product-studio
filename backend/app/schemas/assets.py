"""Uploaded files, such as watermark logos. camelCase on the wire."""

from typing import Literal

from pydantic import Field

from app.schemas.document_api import ApiModel

AssetKind = Literal["logo"]


class AssetRead(ApiModel):
    id: str = Field(..., description="Fetch the bytes from GET /api/assets/{id}")
    kind: AssetKind
    mime: str = Field(..., description="Sniffed from the bytes, never from the upload")
    size: int = Field(..., description="Stored size in bytes, after SVG sanitising")
    sha256: str
