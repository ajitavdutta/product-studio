import datetime as dt

import pytest

from app.importers.jira.dates import detect_dayfirst, parse_jira_date


def test_jira_date_16_Nov_26_parses_to_iso() -> None:
    assert parse_jira_date("16/Nov/26 12:00 AM", dayfirst=False) == dt.date(2026, 11, 16)


def test_jira_date_without_time_parses() -> None:
    assert parse_jira_date("06/Nov/26", dayfirst=False) == dt.date(2026, 11, 6)


def test_iso_date_parses() -> None:
    assert parse_jira_date("2026-11-16", dayfirst=True) == dt.date(2026, 11, 16)


@pytest.mark.parametrize(
    "value",
    ["2026-11-16T23:30:00.000-0800", "2026-11-16T00:15:00+1300", "2026-11-16 09:00"],
)
def test_iso_datetime_keeps_date(value: str) -> None:
    assert parse_jira_date(value, dayfirst=False) == dt.date(2026, 11, 16)


@pytest.mark.parametrize(
    "value", ["Mon, 16 Nov 2026 00:00:00 +0000", "Mon, 16 Nov 2026 23:30:00 -0800"]
)
def test_IMP_1_xml_rfc_2822_date_keeps_date(value: str) -> None:
    # Jira's XML view writes every date this way (<created>, <due>, date custom fields).
    assert parse_jira_date(value, dayfirst=False) == dt.date(2026, 11, 16)


def test_numeric_dates_dayfirst_detected_from_samples() -> None:
    samples = ["03/04/2026", "16/11/2026", ""]

    dayfirst = detect_dayfirst(samples)

    assert (dayfirst, parse_jira_date("03/04/2026", dayfirst)) == (True, dt.date(2026, 4, 3))


def test_numeric_dates_month_first_without_evidence() -> None:
    samples = ["03/04/2026", "11/12/2026", "16/Nov/26 12:00 AM", "2026-11-16"]

    dayfirst = detect_dayfirst(samples)

    assert (dayfirst, parse_jira_date("03/04/2026", dayfirst)) == (False, dt.date(2026, 3, 4))


@pytest.mark.parametrize(
    "value",
    ["", "   ", "Sprint 24", "S3", "24", "PAY-142", "2026-13-40", "31/Feb/26", "soon"],
)
def test_non_dates_parse_to_none(value: str) -> None:
    assert parse_jira_date(value, dayfirst=False) is None
