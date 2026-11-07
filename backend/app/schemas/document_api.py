"""API envelopes around documents: autosave ops, reads, summaries and delete impact.

camelCase on the wire, like the documents themselves.
"""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator
from pydantic.alias_generators import to_camel

from app.documents.defaults import DEFAULT_DIAGRAM_NAME
from app.schemas.documents import DiagramDocument, DocumentKind, RoadmapDocument


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DocumentOp(ApiModel):
    op: Literal["set", "insert", "remove", "move"] = Field(..., description="What to do")
    path: str = Field(
        ...,
        pattern=r"^(/[^/]*)+$",
        description="RFC 6901 pointer; array elements with an `id` are addressed by that id",
    )
    value: JsonValue | None = Field(None, description="New value for set and insert")
    position: int | None = Field(None, ge=0, description="Index for insert and move")


class DocumentPatch(ApiModel):
    base_version: int = Field(..., ge=0, description="The revision these ops were made against")
    ops: list[DocumentOp] = Field(..., min_length=1, max_length=500)


class PatchResult(ApiModel):
    revision: int = Field(..., description="The document's new revision")
    file_name: str = Field(..., description="File name for Save JSON, which follows the name")


class DocumentSummary(ApiModel):
    id: UUID
    kind: DocumentKind
    name: str
    file_name: str = Field(..., description="File name Save JSON uses")
    schema_version: int
    revision: int
    updated_at: datetime


class RoadmapRead(ApiModel):
    id: UUID
    name: str
    file_name: str = Field(..., description="File name Save JSON uses")
    revision: int = Field(..., description="Send as baseVersion with the next PATCH")
    created_at: datetime
    updated_at: datetime
    document: RoadmapDocument


class DiagramRead(ApiModel):
    id: UUID
    name: str
    file_name: str = Field(..., description="File name Save JSON uses")
    revision: int = Field(..., description="Send as baseVersion with the next PATCH")
    created_at: datetime
    updated_at: datetime
    document: DiagramDocument


class LinkedDocument(ApiModel):
    id: UUID
    kind: DocumentKind
    name: str


class DeleteImpact(ApiModel):
    id: UUID
    kind: DocumentKind
    name: str
    unlinks: list[LinkedDocument] = Field(..., description="Documents that lose their link")
    message: str = Field(..., description="Plain sentence for the confirmation dialog")


class DiagramCreate(ApiModel):
    name: str = Field(DEFAULT_DIAGRAM_NAME, min_length=1, max_length=200)
    lanes_from: Literal["blank", "roadmap"] = Field(
        "blank", description="Start from three blank lanes or from a roadmap's teams"
    )
    roadmap_id: UUID | None = Field(None, description="Required when lanesFrom is roadmap")

    @model_validator(mode="after")
    def _roadmap_needed(self) -> Self:
        if self.lanes_from == "roadmap" and self.roadmap_id is None:
            raise ValueError("Choose the roadmap whose teams the diagram should use")
        return self
