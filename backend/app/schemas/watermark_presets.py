"""Reusable export watermarks (EX-3). camelCase on the wire."""

from typing import Literal, Self

from pydantic import ConfigDict, Field, model_validator

from app.documents.defaults import DEFAULT_WATERMARK_OPACITY
from app.schemas.document_api import ApiModel

WatermarkType = Literal["text", "image"]
WatermarkPosition = Literal["diagonal", "tiled", "corner"]
# The `watermark.colors` keys of shared/design-tokens.json.
WatermarkColor = Literal["red", "grey", "blue", "black"]

MIN_OPACITY = 0.05
MAX_OPACITY = 0.5


class _WatermarkPresetFields(ApiModel):
    name: str = Field(..., min_length=1, max_length=80)
    type: WatermarkType
    text: str | None = Field(None, max_length=200, description="May contain {user} and {date}")
    image_asset_id: str | None = Field(None, description="An uploaded logo from POST /api/assets")
    position: WatermarkPosition = "diagonal"
    opacity: float = Field(DEFAULT_WATERMARK_OPACITY, ge=MIN_OPACITY, le=MAX_OPACITY)
    color: WatermarkColor = "red"
    is_default: bool = False


class WatermarkPresetCreate(_WatermarkPresetFields):
    @model_validator(mode="after")
    def _content_matches_type(self) -> Self:
        if self.type == "text" and not (self.text or "").strip():
            raise ValueError("A text watermark needs some text")
        if self.type == "image" and not self.image_asset_id:
            raise ValueError("An image watermark needs a logo")
        return self


class WatermarkPresetUpdate(ApiModel):
    """Only the fields sent are changed; the merged preset must still be valid."""

    name: str | None = Field(None, min_length=1, max_length=80)
    type: WatermarkType | None = None
    text: str | None = Field(None, max_length=200)
    image_asset_id: str | None = None
    position: WatermarkPosition | None = None
    opacity: float | None = Field(None, ge=MIN_OPACITY, le=MAX_OPACITY)
    color: WatermarkColor | None = None
    is_default: bool | None = None


class WatermarkPresetRead(_WatermarkPresetFields):
    # No content check here: a stored preset must always read back, even if its logo is gone.
    model_config = ConfigDict(from_attributes=True)

    id: str
