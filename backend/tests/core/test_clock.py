from datetime import UTC, date, datetime

from app.core import clock


def test_today_is_frozen_in_tests() -> None:
    assert clock.today() == date(2026, 11, 6)


def test_freeze_none_restores_real_date() -> None:
    clock.freeze(None)

    assert clock.today() == datetime.now(UTC).date()
