"""Defaults shared by new documents, the v0 migration and (in M2) the Jira importer."""

from typing import Final

from app.schemas.documents import RoadmapStatus, TeamColor

DEFAULT_STATUSES: Final[tuple[RoadmapStatus, ...]] = (
    RoadmapStatus(
        id="not-started",
        name="Not started",
        color="grey",
        jira_statuses=["To Do", "Open", "Backlog"],
    ),
    RoadmapStatus(
        id="in-progress",
        name="In progress",
        color="blue",
        jira_statuses=["In Progress", "In Review"],
    ),
    RoadmapStatus(id="at-risk", name="At risk", color="deepOrange", jira_statuses=["Blocked"]),
    RoadmapStatus(id="done", name="Done", color="green", jira_statuses=["Done", "Closed"]),
)

# Lanes take team colours in this order, wrapping after the sixth.
TEAM_COLOR_ORDER: Final[tuple[TeamColor, ...]] = (
    "blue",
    "deepOrange",
    "blueGrey",
    "purple",
    "teal",
    "brown",
)

# From the prototype's new-diagram flow (`newdg`).
BLANK_LANE_NAMES: Final = ("Lane 1", "Lane 2", "Lane 3")
DEFAULT_DIAGRAM_NAME: Final = "Untitled workflow"

DEFAULT_WATERMARK_OPACITY: Final = 0.14
