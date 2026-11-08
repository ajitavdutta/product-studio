import pytest

from app.importers.jira.detect import (
    EMPTY_FILE_MESSAGE,
    NOT_JIRA_MESSAGE,
    UNDECODABLE_MESSAGE,
    decode,
    detect_format,
)
from app.services.errors import InvalidInputError


@pytest.mark.parametrize(
    ("file_name", "head", "expected"),
    [
        ("export.csv", b"Summary,Issue key\nA,PAY-1\n", "csv"),
        ("export.txt", b"Key;Title\nPAY-1;A\n", "csv"),
        ("export", b"\xef\xbb\xbfIssue key,Summary\nPAY-1,A\n", "csv"),
        ("search.json", b'{"startAt": 0, "total": 1, "issues": [{"key": "PAY-1"}]}', "json"),
        ("download", b'  \n{"issues":[]}', "json"),
        ("jira.xml", b'<?xml version="1.0"?>\n<rss version="0.92"><channel>', "xml"),
        ("jira.xml", b"<rss><channel><item/></channel></rss>", "xml"),
    ],
)
def test_IMP_1_detects_csv_json_xml(file_name: str, head: bytes, expected: str) -> None:
    assert detect_format(file_name, head) == expected


@pytest.mark.parametrize(
    ("file_name", "head"),
    [
        ("notes.md", b"# Meeting notes\nNothing to see\n"),
        ("data.json", b'{"rows": [1, 2, 3]}'),
        ("page.html", b"<!doctype html><html><body></body></html>"),
    ],
)
def test_IMP_1_non_jira_file_rejected_in_plain_language(file_name: str, head: bytes) -> None:
    with pytest.raises(InvalidInputError) as error:
        detect_format(file_name, head)

    assert error.value.detail == NOT_JIRA_MESSAGE


@pytest.mark.parametrize("data", [b"", b"   \n\r\n", b"\xef\xbb\xbf"])
def test_IMP_1_empty_file_rejected(data: bytes) -> None:
    with pytest.raises(InvalidInputError) as error:
        detect_format("export.csv", data)

    assert error.value.detail == EMPTY_FILE_MESSAGE


def test_IMP_1_decode_empty_file_rejected() -> None:
    with pytest.raises(InvalidInputError) as error:
        decode(b"")

    assert error.value.detail == EMPTY_FILE_MESSAGE


def test_NF_3_utf8_bom_decoded_as_utf8_sig() -> None:
    text, encoding = decode("﻿Summary,Issue key\nCafé,PAY-1\n".encode())

    assert (text, encoding) == ("Summary,Issue key\nCafé,PAY-1\n", "utf-8-sig")


def test_NF_3_cp1252_fallback_reported() -> None:
    text, encoding = decode("Summary\nCafé – launch\n".encode("cp1252"))

    assert (text, encoding) == ("Summary\nCafé – launch\n", "cp1252")


def test_NF_3_undecodable_bytes_rejected_in_plain_language() -> None:
    # 0x81 is invalid UTF-8 on its own and undefined in cp1252.
    with pytest.raises(InvalidInputError) as error:
        decode(b"Summary\n\x81\x81\n")

    assert error.value.detail == UNDECODABLE_MESSAGE


@pytest.mark.parametrize(
    "data",
    [
        # PNG signature and IHDR start: decodes as cp1252 if NUL bytes were allowed through.
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x04",
        b"PK\x03\x04\x14\x00\x06\x00\x08\x00",
        b"Issue key,Summary\nPAY-1,A\x00B\n",
        # UTF-16 without a BOM: every ASCII character is followed by a NUL.
        "Issue key,Summary\n".encode("utf-16-le"),
    ],
    ids=["png", "xlsx", "csv-with-nul", "utf-16-no-bom"],
)
def test_NF_3_data_with_nul_bytes_rejected_as_not_jira(data: bytes) -> None:
    with pytest.raises(InvalidInputError) as error:
        decode(data)

    assert error.value.detail == NOT_JIRA_MESSAGE


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be"])
def test_NF_3_utf16_with_bom_asked_to_save_as_utf8(encoding: str) -> None:
    # Encoding U+FEFF first writes the BOM, as Excel's "Unicode Text" does.
    data = "﻿Issue key,Summary\nPAY-1,A\n".encode(encoding)

    with pytest.raises(InvalidInputError) as error:
        decode(data)

    assert error.value.detail == UNDECODABLE_MESSAGE
