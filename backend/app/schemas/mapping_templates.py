"""Saved Jira field-mapping templates (IMP-9). camelCase on the wire."""

from datetime import UTC, datetime

from pydantic import ConfigDict, Field, field_validator

from app.schemas.document_api import ApiModel
from app.schemas.imports import RoadmapField, check_roadmap_fields


class MappingTemplateCreate(ApiModel):
    name: str = Field(..., min_length=1, max_length=120)
    jira_site: str | None = Field(None, max_length=255, description="e.g. acme.atlassian.net")
    column_map: dict[str, RoadmapField] = Field(
        ..., description="Jira column name or custom-field id → roadmap field"
    )
    status_map: dict[str, str] = Field(..., description="Jira status → roadmap status id")

    _fields = field_validator("column_map", mode="before")(check_roadmap_fields)


class MappingTemplateUpdate(ApiModel):
    """Only the fields sent are changed; an explicit `null` clears `jiraSite`."""

    name: str | None = Field(None, min_length=1, max_length=120)
    jira_site: str | None = Field(None, max_length=255)
    column_map: dict[str, RoadmapField] | None = None
    status_map: dict[str, str] | None = None

    _fields = field_validator("column_map", mode="before")(check_roadmap_fields)


class MappingTemplateRead(MappingTemplateCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    updated_at: datetime

    @field_validator("updated_at")
    @classmethod
    def _as_utc(cls, moment: datetime) -> datetime:
        # SQLite drops the offset; every stored time is UTC (see app/core/clock.py).
        return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
