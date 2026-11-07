"""Slugs for ids and file names, safe for URLs and file systems."""

import re

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    """Lower-case `text`, collapse every non-[a-z0-9] run to "-" and trim the dashes."""
    return _NON_ALPHANUMERIC.sub("-", text.lower()).strip("-")
