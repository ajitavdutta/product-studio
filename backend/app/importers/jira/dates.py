"""Parse the date formats Jira exports use into `datetime.date` (IMP-1, IMP-8).

Handles ISO dates and datetimes (`2026-11-16`, `2026-11-16T09:00:00.000+0000`), Jira's
`16/Nov/26 12:00 AM`, the XML view's RFC 2822 `Mon, 16 Nov 2026 00:00:00 +0000`, and
numeric `16/11/2026`, whose day/month order comes from the samples.
"""

import datetime as dt
import re
from collections.abc import Iterable
from typing import Final

from dateutil import parser as date_parser

_ISO_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$")
_MONTH_NAME_DATE = re.compile(r"^\d{1,2}[/ -][A-Za-z]{3,9}[/ -]\d{2,4}(?:\s.*)?$")
# Jira's XML view: an optional weekday, then `16 Nov 2026`, then the time and offset.
_RFC_2822_DATE = re.compile(r"^(?:[A-Za-z]{3},\s*)?(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})(?:\s.*)?$")
_NUMERIC_DATE = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}(?:\s.*)?$")

# Months run 1-12, so a first part above this can only be a day.
_MAX_MONTH: Final = 12
# dateutil fills missing parts from a default; pinning it keeps parsing independent of today.
_PARSE_DEFAULT: Final = dt.datetime(2000, 1, 1)


def parse_jira_date(value: str, dayfirst: bool) -> dt.date | None:
    """Return the calendar date in `value`, or None when it is empty or not a date.

    An ISO datetime keeps its own date; the time and offset are ignored, not converted.
    Only date-shaped text reaches dateutil, so `Sprint 24` never becomes the 24th of a month.
    """
    text = value.strip()
    iso = _ISO_DATE.match(text)
    if iso:
        try:
            return dt.date.fromisoformat(iso.group(1))
        except ValueError:
            return None
    rfc_2822 = _RFC_2822_DATE.match(text)
    if rfc_2822:
        # Like an ISO datetime, the written day is kept; the offset is not applied.
        try:
            return dt.datetime.strptime(rfc_2822.group(1), "%d %b %Y").date()
        except ValueError:
            return None
    if not (_MONTH_NAME_DATE.match(text) or _NUMERIC_DATE.match(text)):
        return None
    try:
        return date_parser.parse(text, dayfirst=dayfirst, default=_PARSE_DEFAULT).date()
    except (ValueError, OverflowError):
        return None


def detect_dayfirst(samples: Iterable[str]) -> bool:
    """True when some numeric `a/b/yy` sample has a first part above 12, so it reads day first.

    Month-name and ISO dates are unambiguous and don't count. With no evidence, month first.
    """
    for sample in samples:
        numeric = _NUMERIC_DATE.match(sample.strip())
        if numeric and int(numeric.group(1)) > _MAX_MONTH:
            return True
    return False
