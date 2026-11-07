import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.documents.migrations import MIGRATIONS, detect_version, load_document
from app.schemas.documents import dump_document
from app.services.errors import InvalidInputError
from tests.conftest import load_example

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def roadmap_v0() -> dict[str, Any]:
    return copy.deepcopy(load_example("roadmap.v0.json"))


def load_error(raw: object, kind: str) -> InvalidInputError:
    with pytest.raises(InvalidInputError) as caught:
        load_document(raw, kind)  # type: ignore[call-overload]
    return caught.value


def test_RM_16_v0_example_migrates_to_expected_v1(roadmap_v0: dict[str, Any]) -> None:
    expected = json.loads((FIXTURES_DIR / "roadmap.v1-from-v0.json").read_text(encoding="utf-8"))

    assert dump_document(load_document(roadmap_v0, "roadmap")) == expected


def test_migration_does_not_mutate_input(roadmap_v0: dict[str, Any]) -> None:
    original = copy.deepcopy(roadmap_v0)

    load_document(roadmap_v0, "roadmap")

    assert roadmap_v0 == original


def test_migration_is_deterministic(roadmap_v0: dict[str, Any]) -> None:
    first = load_document(copy.deepcopy(roadmap_v0), "roadmap")
    second = load_document(copy.deepcopy(roadmap_v0), "roadmap")

    assert first.id == second.id


def test_v0_detected_despite_schema_version_1(roadmap_v0: dict[str, Any]) -> None:
    assert (roadmap_v0["schemaVersion"], detect_version(roadmap_v0)) == (1, 0)


def test_current_example_is_not_migrated(roadmap_example: dict[str, Any]) -> None:
    assert dump_document(load_document(roadmap_example, "roadmap")) == roadmap_example


def test_RM_16_newer_version_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["schemaVersion"] = 2

    assert load_error(roadmap_example, "roadmap").detail == (
        "This file was made by a newer version of Product Studio"
    )


def test_RM_16_missing_version_is_not_a_document(roadmap_example: dict[str, Any]) -> None:
    del roadmap_example["schemaVersion"]

    assert load_error(roadmap_example, "roadmap").detail == (
        "This file isn't a Product Studio document"
    )


def test_RM_16_diagram_v0_is_an_old_format(diagram_example: dict[str, Any]) -> None:
    diagram_example["schemaVersion"] = 0

    assert load_error(diagram_example, "diagram").detail == (
        "This file uses an old format Product Studio can't read"
    )


def test_RM_16_diagram_file_opened_as_roadmap(diagram_example: dict[str, Any]) -> None:
    assert load_error(diagram_example, "roadmap").detail == (
        "This file is a swimlane diagram, not a roadmap"
    )


def test_RM_16_roadmap_file_opened_as_diagram(roadmap_example: dict[str, Any]) -> None:
    assert load_error(roadmap_example, "diagram").detail == (
        "This file is a roadmap, not a swimlane diagram"
    )


@pytest.mark.parametrize("raw", [[], "roadmap", 3, None], ids=["list", "string", "number", "null"])
def test_RM_16_non_object_rejected(raw: object) -> None:
    assert load_error(raw, "roadmap").detail == "This file isn't a Product Studio document"


def test_RM_16_malformed_v0_is_an_old_format(roadmap_v0: dict[str, Any]) -> None:
    del roadmap_v0["source"]

    assert load_error(roadmap_v0, "roadmap").detail == (
        "This file uses an old format Product Studio can't read"
    )


def test_RM_16_validation_error_is_plain_language(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["items"][0]["end"] = "not-a-date"

    error = load_error(roadmap_example, "roadmap")

    assert ("Value error" not in error.detail, "pydantic" not in error.detail.lower()) == (
        True,
        True,
    )
    assert error.errors is not None and error.errors[0].path == "/items/0/end"


def test_RM_16_validator_message_loses_value_error_prefix(
    roadmap_example: dict[str, Any],
) -> None:
    roadmap_example["items"][0]["end"] = "2026-11-01"

    assert load_error(roadmap_example, "roadmap").detail == (
        "Item PAY-142 has an end date before its start date"
    )


def test_RM_16_many_errors_are_summarised(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["items"][0]["end"] = "not-a-date"
    roadmap_example["items"][1]["start"] = "not-a-date"

    assert load_error(roadmap_example, "roadmap").detail.startswith("2 problems found. The first:")


def test_every_migration_step_has_a_fixture() -> None:
    missing = [
        version
        for version in MIGRATIONS
        if not list(FIXTURES_DIR.glob(f"*.v{version + 1}-from-v{version}.json"))
    ]

    assert missing == []
