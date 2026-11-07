from datetime import UTC, date, datetime

from app.core import clock


def test_today_is_frozen_in_tests() -> None:
    assert clock.today() == date(2026, 11, 6)


def test_freeze_none_restores_real_date() -> None:
    clock.freeze(None)

    # Capture both sides so a run that crosses midnight UTC still passes.
    before = datetime.now(UTC).date()
    today = clock.today()
    after = datetime.now(UTC).date()

    assert today in {before, after}
