"""Suggest a roadmap status for each Jira status in an export (IMP-7)."""

from collections import Counter
from collections.abc import Iterable, Mapping
from typing import Final

from app.schemas.imports import StatusSuggestion

UNKNOWN_STATUS_ID: Final = "not-started"

# Skill §5, keyed by the lower-cased Jira status.
DEFAULT_STATUS_MAP: Final[dict[str, str]] = {
    "to do": "not-started",
    "open": "not-started",
    "backlog": "not-started",
    "selected for development": "not-started",
    "in progress": "in-progress",
    "in review": "in-progress",
    "in qa": "in-progress",
    "code review": "in-progress",
    "blocked": "at-risk",
    "impeded": "at-risk",
    "on hold": "at-risk",
    "done": "done",
    "closed": "done",
    "resolved": "done",
    "released": "done",
}


def map_statuses(
    row_statuses: Iterable[str], template_map: Mapping[str, str] | None = None
) -> list[StatusSuggestion]:
    """One suggestion per distinct status in `row_statuses` (each row's value), in file order.

    A saved template entry wins, then the default table; unknown statuses are Not started.
    Blank values are skipped.
    """
    counts = Counter(status.strip() for status in row_statuses if status.strip())
    template_by_lower = {
        jira.lower(): status_id for jira, status_id in (template_map or {}).items()
    }
    return [
        StatusSuggestion(
            jira_status=jira_status,
            count=count,
            status_id=template_by_lower.get(jira_status.lower())
            or DEFAULT_STATUS_MAP.get(jira_status.lower(), UNKNOWN_STATUS_ID),
        )
        for jira_status, count in counts.items()
    ]
