"""App-wide settings (G-4). camelCase on the wire."""

from pydantic import Field, HttpUrl

from app.schemas.document_api import ApiModel

DISPLAY_NAME_MAX_LENGTH = 80


class PiCadence(ApiModel):
    """Defaults for new roadmaps; sprint length stays per roadmap (two weeks, RM-4)."""

    sprints_per_pi: int = Field(6, ge=1, le=12)
    ip_sprint: bool = Field(True, description="Whether the last sprint of each PI is an IP sprint")


class SettingsRead(ApiModel):
    display_name: str = Field(
        "", max_length=DISPLAY_NAME_MAX_LENGTH, description="Fills the {user} watermark token"
    )
    jira_base_url: HttpUrl | None = Field(None, description="Links item keys to Jira")
    default_preset_id: str | None = Field(None, description="The default watermark preset")
    pi_cadence: PiCadence = Field(default_factory=PiCadence)


class SettingsUpdate(ApiModel):
    """Only the fields sent are changed; an explicit `null` resets a field to its default."""

    display_name: str | None = Field(None, max_length=DISPLAY_NAME_MAX_LENGTH)
    jira_base_url: HttpUrl | None = None
    default_preset_id: str | None = None
    pi_cadence: PiCadence | None = None
