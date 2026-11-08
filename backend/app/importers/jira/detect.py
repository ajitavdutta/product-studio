"""Decide which Jira export format an upload is, and decode its text (IMP-1, NF-3).

Both functions are pure. They raise `InvalidInputError` with a sentence the UI shows as is.
"""

import re
from typing import Final

from app.schemas.imports import ImportFormat, TextEncoding
from app.services.errors import InvalidInputError

EMPTY_FILE_MESSAGE: Final = "This file is empty"
# A file that parses but holds no issues, whatever its format (CSV, JSON or XML).
EMPTY_EXPORT_MESSAGE: Final = "This export has no issues in it"
NOT_JIRA_MESSAGE: Final = (
    "This file doesn't look like a Jira export. Upload a CSV, JSON or XML file exported from Jira."
)
UNDECODABLE_MESSAGE: Final = (
    "We couldn't read this file's text encoding. Save it as UTF-8 and try again."
)

# How many leading bytes callers should pass to `detect_format`. Enough for a 200-column
# CSV header, and for a REST response's paging fields that come before `issues`.
DETECT_HEAD_BYTES: Final = 64 * 1024

# Tried in order: Excel saves CSV as cp1252 when it isn't UTF-8.
ENCODINGS: Final[tuple[TextEncoding, ...]] = ("utf-8-sig", "cp1252")

CSV_EXTENSIONS: Final = (".csv", ".txt")
CSV_HEADER_MARKERS: Final = ("issue key", "summary")
_JSON_ISSUES_KEY = re.compile(r'"issues"\s*:')
_XML_RSS_ROOT = re.compile(r"<rss[\s>]", re.IGNORECASE)
_UTF8_BOM: Final = "﻿"
# Excel's "Unicode Text" saves UTF-16 with a BOM. Its text is fine, it just isn't UTF-8.
_UTF16_BOMS: Final = (b"\xff\xfe", b"\xfe\xff")


def decode(data: bytes) -> tuple[str, TextEncoding]:
    """Decode an upload as UTF-8 (BOM stripped), else cp1252, and say which one worked.

    Raises `InvalidInputError` when the data is empty, is UTF-16, holds NUL bytes, or neither
    encoding fits.
    """
    if not data.strip():
        raise InvalidInputError(EMPTY_FILE_MESSAGE)
    if data.startswith(_UTF16_BOMS):
        raise InvalidInputError(UNDECODABLE_MESSAGE)
    # Jira's CSV, JSON and XML exports never contain NUL, and almost every binary format
    # (PNG, xlsx, gzip) does. Without this, cp1252 decodes many small binaries as "text".
    if b"\x00" in data:
        raise InvalidInputError(NOT_JIRA_MESSAGE)
    for encoding in ENCODINGS:
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise InvalidInputError(UNDECODABLE_MESSAGE)


def detect_format(file_name: str, head: bytes) -> ImportFormat:
    """Name the export format from the file name and its first bytes.

    Content wins over the extension: a JSON object with `issues` is JSON, an `<rss>` document
    is XML. A `.csv`/`.txt` file, or one whose first line names `Issue key` or `Summary`, is
    CSV. Raises `InvalidInputError` for empty input or anything else.
    """
    # The head may end mid-character, and cp1252 files are ASCII in the parts checked here.
    text = head.decode("utf-8", errors="replace").lstrip(_UTF8_BOM).lstrip()
    if not text:
        raise InvalidInputError(EMPTY_FILE_MESSAGE)
    if text.startswith("{"):
        if _JSON_ISSUES_KEY.search(text):
            return "json"
        raise InvalidInputError(NOT_JIRA_MESSAGE)
    if text.startswith("<"):
        if _XML_RSS_ROOT.search(text):
            return "xml"
        raise InvalidInputError(NOT_JIRA_MESSAGE)
    if file_name.lower().endswith(CSV_EXTENSIONS):
        return "csv"
    first_line = text.splitlines()[0].lower()
    if any(marker in first_line for marker in CSV_HEADER_MARKERS):
        return "csv"
    raise InvalidInputError(NOT_JIRA_MESSAGE)
