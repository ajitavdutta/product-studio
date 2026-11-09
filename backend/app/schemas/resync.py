"""Re-sync a roadmap from a newer Jira export: the diff and the apply request (RM-15).

camelCase on the wire. Validator messages are plain sentences shown to the user as they are.
"""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from app.schemas.document_api import ApiModel

ResyncChangeKind = Literal["new", "removed", "dates", "status", "progress", "stories"]


class ResyncChange(ApiModel):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Stable within one diff, e.g. dates:PAY-155")
    kind: ResyncChangeKind
    item_key: str = Field(..., description="Jira key of the item, e.g. PAY-155")
    item_title: str
    before: str | None = Field(None, description="Display string, e.g. 12 Mar 2027 or 0%")
    after: str | None = Field(None, description="Display string, e.g. 4 stories")
    conflict: bool = Field(..., description="The PM edited this by hand; unchecked by default")
    conflict_reason: str | None = Field(None, description="e.g. You changed the dates by hand")
    already_applied: bool = Field(
        ..., description="The roadmap already has the incoming value: shown, not selectable"
    )


class RoadmapResyncRead(ApiModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    roadmap_id: UUID
    base_revision: int = Field(..., description="Roadmap revision the diff was made against")
    file_name: str
    template_name: str | None = Field(None, description="Mapping template used, if any")
    changes: list[ResyncChange]
    unchanged: int = Field(..., ge=0, description="Items with no change")
    warnings: list[str]


class ResyncApply(ApiModel):
    base_version: int = Field(..., ge=0, description="Must still equal the roadmap's revision")
    change_ids: list[str] = Field(..., description="Ids of the changes to apply")

    @field_validator("change_ids")
    @classmethod
    def _at_least_one(cls, change_ids: list[str]) -> list[str]:
        if not change_ids:
            raise ValueError("Choose at least one change to apply")
        return change_ids
