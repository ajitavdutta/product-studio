"""The single source of "today" and "now" for the backend.

Tests freeze the date at 2026-11-06 so timeline maths, the Today line and export
file names are deterministic. The renderer and services must call `today()` /
`now()` from here and never `date.today()` or `datetime.now()` directly.
"""

from datetime import UTC, date, datetime, time

_frozen_day: date | None = None


def freeze(day: date | None) -> None:
    """Pin `today()` and `now()` to `day` (midnight UTC); `None` restores the real clock."""
    global _frozen_day
    _frozen_day = day


def today() -> date:
    """Return the frozen date if one is set, otherwise the current UTC date."""
    if _frozen_day is not None:
        return _frozen_day
    return datetime.now(UTC).date()


def now() -> datetime:
    """Return a timezone-aware UTC datetime; midnight of the frozen date when frozen."""
    if _frozen_day is not None:
        return datetime.combine(_frozen_day, time.min, tzinfo=UTC)
    return datetime.now(UTC)
