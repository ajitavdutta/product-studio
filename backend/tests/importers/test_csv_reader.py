from pathlib import Path

import pytest

from app.importers.jira.csv_reader import NO_HEADER_MESSAGE, read_csv
from app.importers.jira.detect import EMPTY_EXPORT_MESSAGE, decode
from app.importers.jira.types import RawColumn
from app.services.errors import InvalidInputError

PAYMENTS_CSV = (
    Path(__file__).resolve().parents[3] / "docs" / "fixtures" / "jira" / "payments-export.csv"
)


def test_IMP_1_payments_fixture_has_55_rows_and_21_columns() -> None:
    text, encoding = decode(PAYMENTS_CSV.read_bytes())

    parsed = read_csv(text, encoding)

    assert (parsed.format, parsed.encoding, len(parsed.rows), len(parsed.columns)) == (
        "csv",
        "utf-8-sig",
        55,
        21,
    )


def test_IMP_1_payments_fixture_header_has_no_bom() -> None:
    text, encoding = decode(PAYMENTS_CSV.read_bytes())

    parsed = read_csv(text, encoding)

    assert parsed.columns[0] == RawColumn(name="Summary")


def test_IMP_1_semicolon_delimiter_sniffed() -> None:
    parsed = read_csv("Issue key;Summary;Status\nPAY-1;Checkout, saved cards;Done\n", "cp1252")

    assert parsed.rows == [[["PAY-1"], ["Checkout, saved cards"], ["Done"]]]


def test_IMP_1_comma_delimiter_with_quoted_semicolons() -> None:
    parsed = read_csv('Issue key,Summary\nPAY-1,"Wallet; cards"\n', "utf-8-sig")

    assert parsed.rows == [[["PAY-1"], ["Wallet; cards"]]]


def test_IMP_6_repeated_headers_kept_as_separate_raw_columns() -> None:
    parsed = read_csv(
        "Issue key,Sprint,Sprint,Labels\nPAY-1,PAY Sprint 25,PAY Sprint 26,\n", "utf-8-sig"
    )

    assert (parsed.columns, parsed.rows) == (
        [
            RawColumn(name="Issue key"),
            RawColumn(name="Sprint"),
            RawColumn(name="Sprint"),
            RawColumn(name="Labels"),
        ],
        [[["PAY-1"], ["PAY Sprint 25"], ["PAY Sprint 26"], []]],
    )


def test_IMP_1_short_rows_padded_long_rows_trimmed_blank_lines_skipped() -> None:
    parsed = read_csv("Issue key,Summary\r\nPAY-1\r\n\r\n,\r\nPAY-2,B,extra\r\n", "utf-8-sig")

    assert parsed.rows == [[["PAY-1"], []], [["PAY-2"], ["B"]]]


def test_IMP_1_quoted_multiline_cell_stays_one_value() -> None:
    parsed = read_csv('Issue key,Description\nPAY-1,"line one\r\nline two"\n', "utf-8-sig")

    assert parsed.rows == [[["PAY-1"], ["line one\r\nline two"]]]


def test_IMP_1_formula_like_cell_kept_as_plain_text() -> None:
    parsed = read_csv('Issue key,Summary\nPAY-1,=HYPERLINK("x")\n', "utf-8-sig")

    assert parsed.rows[0][1] == ['=HYPERLINK("x")']


@pytest.mark.parametrize("text", ["\n\n", ",,,\nPAY-1,A,B,C\n"])
def test_IMP_1_missing_header_rejected(text: str) -> None:
    with pytest.raises(InvalidInputError) as error:
        read_csv(text, "utf-8-sig")

    assert error.value.detail == NO_HEADER_MESSAGE


def test_IMP_1_header_only_csv_rejected_as_empty_export() -> None:
    with pytest.raises(InvalidInputError) as error:
        read_csv("Issue key,Summary\n\n", "utf-8-sig")

    assert error.value.detail == EMPTY_EXPORT_MESSAGE


def test_IMP_1_malformed_csv_rejected_in_plain_language() -> None:
    # csv.reader refuses a field over its 131072-character default limit.
    oversized_cell = "x" * 200_000
    with pytest.raises(InvalidInputError) as error:
        read_csv(f"Issue key,Description\nPAY-1,{oversized_cell}\n", "utf-8-sig")

    assert error.value.detail.startswith("We couldn't read line 2 of this CSV file.")
