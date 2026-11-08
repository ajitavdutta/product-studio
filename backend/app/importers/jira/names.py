"""Column-name normalisation and the name tables the mapper matches against (IMP-5).

The tables are copied from `.claude/skills/jira-field-mapping/references/aliases.md`
and skill §3; change them there and here together. Every name is already normalised.
"""

import re
from typing import Final

from app.schemas.imports import RoadmapField

_WHITESPACE = re.compile(r"\s+")
_TRAILING_BRACKETS = re.compile(r"\s*\[[^\]]*\]\s*$")
_CUSTOM_FIELD_WRAPPER = re.compile(r"^custom field \((.*)\)$", re.IGNORECASE)


def _collapse(name: str) -> str:
    return _WHITESPACE.sub(" ", name).strip()


def display_label(name: str) -> str:
    """The header as the Map table shows it: `Custom field (Story Points)` → `Story Points`."""
    collapsed = _collapse(name)
    wrapped = _CUSTOM_FIELD_WRAPPER.match(collapsed)
    return _collapse(wrapped.group(1)) if wrapped else collapsed


def normalise_name(name: str) -> str:
    """Lower-case, trim and collapse whitespace; drop a `Custom field (…)` wrapper and `[…]`."""
    unbracketed = _TRAILING_BRACKETS.sub("", _collapse(name))
    return _TRAILING_BRACKETS.sub("", display_label(unbracketed)).lower()


# Exact standard Jira names (confidence `exact`). Components has no field of its own: it is
# only a Team candidate, sniffed, but its standard name keeps it listed as "Choose a field…".
STANDARD_NAMES: Final[dict[str, RoadmapField | None]] = {
    "issue key": "key",
    "summary": "title",
    "issue type": "type",
    "status": "status",
    "sprint": "sprint",
    "fix versions": "release",
    "fix version/s": "release",
    "parent": "epic",
    "parent id": "epic",
    "epic link": "epic",
    "labels": "tags",
    "components": None,
    "due date": "end",
}

# Contains-matched against the normalised name (confidence `alias`).
ALIASES: Final[dict[RoadmapField, tuple[str, ...]]] = {
    "key": ("issue key", "key"),
    "title": ("summary", "title", "name"),
    "type": ("issue type", "issuetype", "type"),
    "epic": ("parent", "parent id", "parent key", "epic link", "epic"),
    "team": ("team", "squad", "pod", "program team"),
    "status": ("status",),
    "sprint": ("sprint",),
    "release": ("fix version", "fixversion", "release"),
    "points": ("story point", "story points", "estimate", "sp"),
    "start": ("start date", "target start", "planned start", "start"),
    "end": ("due date", "due", "target end", "end date", "planned end"),
    "tags": ("labels", "label", "tags"),
}

# Key falls back to `issue id` only when the file has no `issue key` column.
KEY_FALLBACK_ALIAS: Final = "issue id"
# `status` must not match `status category`.
ALIAS_EXCLUSIONS: Final[dict[RoadmapField, tuple[str, ...]]] = {"status": ("status category",)}
# Matched as a whole word only, so `sp` doesn't hit `display` or `response`.
WHOLE_WORD_ALIASES: Final[frozenset[str]] = frozenset({"sp"})

# Never mapped to a field, by alias or by sniffing (otherwise Created would sniff as Start).
NEVER_MAP: Final[frozenset[str]] = frozenset(
    {
        "created",
        "updated",
        "resolved",
        "last viewed",
        "watchers",
        "assignee",
        "reporter",
        "description",
        "comment",
        "attachment",
        "environment",
        "votes",
        "log work",
        "time spent",
    }
)
# Jira's sum columns: Σ Time Spent, Σ Original Estimate, …
NEVER_MAP_PREFIXES: Final[tuple[str, ...]] = ("σ",)


def is_never_mapped(normalised: str) -> bool:
    """True for a normalised column name that must never get a roadmap field."""
    return normalised in NEVER_MAP or normalised.startswith(NEVER_MAP_PREFIXES)
