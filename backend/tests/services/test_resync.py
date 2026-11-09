"""RM-15: the re-sync warning that items end after the last PI, combined into one line."""

import pytest

from app.services.resync import pi_overflow_warnings

SUFFIX = "after the last PI — add one in Manage PIs"


@pytest.mark.parametrize(
    ("keys", "expected"),
    [
        ([], []),
        (["PAY-200"], [f"PAY-200 ends {SUFFIX}"]),
        (["PAY-200", "PAY-201"], [f"PAY-200 and PAY-201 end {SUFFIX}"]),
        (["PAY-200", "PAY-201", "PAY-202"], [f"PAY-200, PAY-201 and PAY-202 end {SUFFIX}"]),
        (
            [f"PAY-{number}" for number in range(200, 214)],
            [f"PAY-200, PAY-201 and 12 more end {SUFFIX}"],
        ),
    ],
    ids=["none", "one", "two", "three", "many"],
)
def test_RM_15_pi_overflow_warning_is_one_line(keys: list[str], expected: list[str]) -> None:
    assert pi_overflow_warnings(keys) == expected
