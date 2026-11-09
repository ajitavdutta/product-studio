import json
import logging
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.documents.geometry import LANE_MIN_HEIGHT, MIN_WIDTH
from app.schemas.documents import DiagramDocument, RoadmapDocument, TeamColor, dump_document
from tests.conftest import REPO_ROOT

TOKENS = json.loads((REPO_ROOT / "shared" / "design-tokens.json").read_text(encoding="utf-8"))


def item(document: dict[str, Any], key: str) -> dict[str, Any]:
    return next(entry for entry in document["items"] if entry["key"] == key)


def connector(document: dict[str, Any], connector_id: str) -> dict[str, Any]:
    return next(entry for entry in document["connectors"] if entry["id"] == connector_id)


def roadmap_error(document: dict[str, Any]) -> str:
    with pytest.raises(ValidationError) as caught:
        RoadmapDocument.model_validate(document)
    return str(caught.value.errors()[0]["msg"])


def diagram_error(document: dict[str, Any]) -> str:
    with pytest.raises(ValidationError) as caught:
        DiagramDocument.model_validate(document)
    return str(caught.value.errors()[0]["msg"])


def test_NF_3_roadmap_example_validates(roadmap_example: dict[str, Any]) -> None:
    document = RoadmapDocument.model_validate(roadmap_example)

    assert document.name == "Payments Platform H1 2027"


def test_NF_3_diagram_example_validates(diagram_example: dict[str, Any]) -> None:
    document = DiagramDocument.model_validate(diagram_example)

    assert document.name == "Customer refund flow"


def test_RM_16_roadmap_dump_equals_example_json(roadmap_example: dict[str, Any]) -> None:
    dumped = dump_document(RoadmapDocument.model_validate(roadmap_example))

    assert dumped == roadmap_example


def test_SW_21_diagram_dump_equals_example_json(diagram_example: dict[str, Any]) -> None:
    dumped = dump_document(DiagramDocument.model_validate(diagram_example))

    assert dumped == diagram_example


def test_SW_21_connector_from_is_serialised_as_from(diagram_example: dict[str, Any]) -> None:
    dumped = dump_document(DiagramDocument.model_validate(diagram_example))

    assert dumped["connectors"][0]["from"] == "S"


def test_NF_3_end_before_start_message(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["end"] = "2026-11-01"

    assert "Item PAY-142 has an end date before its start date" in roadmap_error(roadmap_example)


def test_NF_3_start_without_end_rejected(roadmap_example: dict[str, Any]) -> None:
    del item(roadmap_example, "PAY-142")["end"]

    assert "Item PAY-142 has a start date but no end date" in roadmap_error(roadmap_example)


def test_NF_3_unknown_lane_id_rejected(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["laneId"] = "nowhere"

    assert "Item PAY-142 is in a lane that doesn't exist (nowhere)" in roadmap_error(
        roadmap_example
    )


def test_NF_3_unknown_status_id_rejected(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["statusId"] = "parked"

    assert "Item PAY-142 has a status that doesn't exist (parked)" in roadmap_error(roadmap_example)


def test_NF_3_duplicate_item_ids_rejected(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-155")["id"] = "it-pay-142"

    assert "Two items share the id it-pay-142" in roadmap_error(roadmap_example)


def test_NF_3_freeze_needs_start_and_end(roadmap_example: dict[str, Any]) -> None:
    del roadmap_example["milestones"][2]["end"]

    assert "Freeze “Code freeze” needs a start and an end date" in roadmap_error(roadmap_example)


def test_NF_3_milestone_needs_date(roadmap_example: dict[str, Any]) -> None:
    del roadmap_example["milestones"][0]["date"]

    assert "Milestone “Beta launch” needs a date" in roadmap_error(roadmap_example)


def test_NF_3_issue_counts_cannot_exceed_total(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["issues"] = {"total": 3, "done": 2, "inProgress": 2}

    assert "more than the total" in roadmap_error(roadmap_example)


def test_NF_3_unknown_key_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["colour"] = "red"

    with pytest.raises(ValidationError):
        RoadmapDocument.model_validate(roadmap_example)


def test_NF_3_unknown_team_color_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["lanes"][0]["color"] = "pink"

    with pytest.raises(ValidationError):
        RoadmapDocument.model_validate(roadmap_example)


def test_NF_3_other_schema_version_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["schemaVersion"] = 2

    assert "schema version 1" in roadmap_error(roadmap_example)


def test_SW_21_lane_height_131_rejected(diagram_example: dict[str, Any]) -> None:
    diagram_example["lanes"][1]["height"] = 131

    assert "Lane “Support” is shorter than the 132px minimum" in diagram_error(diagram_example)


def test_SW_21_width_below_minimum_rejected(diagram_example: dict[str, Any]) -> None:
    diagram_example["width"] = 1015

    assert "narrower than the 1016px minimum" in diagram_error(diagram_example)


def test_SW_21_unknown_connector_target_rejected(diagram_example: dict[str, Any]) -> None:
    connector(diagram_example, "c1")["to"] = "ghost"

    assert "Connector c1 ends at a shape that doesn't exist (ghost)" in diagram_error(
        diagram_example
    )


def test_SW_21_non_orthogonal_connector_listed(diagram_example: dict[str, Any]) -> None:
    connector(diagram_example, "c9")["points"][1] = [830, 300]

    assert "Connector c9 isn't drawn correctly" in diagram_error(diagram_example)


def test_SW_21_endpoint_within_1px_accepted(diagram_example: dict[str, Any]) -> None:
    connector(diagram_example, "c3")["points"] = [[352, 199], [400, 199]]

    document = DiagramDocument.model_validate(diagram_example)

    assert document.connectors[2].points[0] == (352, 199)


def test_SW_21_endpoint_2px_off_rejected_lists_all_ids(diagram_example: dict[str, Any]) -> None:
    connector(diagram_example, "c3")["points"] = [[352, 200], [400, 200]]
    connector(diagram_example, "c5")["points"] = [[536, 64], [584, 64]]

    assert "Connectors c3, c5 aren't drawn correctly" in diagram_error(diagram_example)


def test_SW_21_single_point_connector_rejected(diagram_example: dict[str, Any]) -> None:
    connector(diagram_example, "c1")["points"] = [[168, 66]]

    assert "Connector c1 isn't drawn correctly" in diagram_error(diagram_example)


def test_SW_21_connector_without_points_accepted_with_warning(
    diagram_example: dict[str, Any], caplog: pytest.LogCaptureFixture
) -> None:
    connector(diagram_example, "c1")["points"] = []

    with caplog.at_level(logging.WARNING, logger="app.documents.geometry"):
        DiagramDocument.model_validate(diagram_example)

    assert "Connector c1 has no points" in caplog.text


def test_team_colors_match_design_tokens() -> None:
    assert set(TeamColor.__args__) == set(TOKENS["team"])


def test_lane_min_height_matches_design_tokens() -> None:
    assert (
        TOKENS["diagram"]["laneMinHeight"],
        TOKENS["diagram"]["minWidth"],
    ) == (LANE_MIN_HEIGHT, MIN_WIDTH)


def test_RM_15_edited_fields_round_trip(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["editedFields"] = ["start", "end"]
    roadmap_example["source"]["syncedAt"] = "2026-11-07T09:30:00+05:30"

    dumped = dump_document(RoadmapDocument.model_validate(roadmap_example))

    assert dumped == roadmap_example


def test_RM_15_duplicate_edited_field_rejected(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["editedFields"] = ["start", "title", "start"]

    assert "Item PAY-142 lists an edited field twice" in roadmap_error(roadmap_example)


def test_RM_15_unknown_edited_field_rejected(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["editedFields"] = ["notes"]

    with pytest.raises(ValidationError):
        RoadmapDocument.model_validate(roadmap_example)


def test_RM_4_overlapping_pis_rejected(roadmap_example: dict[str, Any]) -> None:
    # PI 4 · 2026 starts 2026-10-05 with 6 × 14 days, so it ends 2026-12-28.
    roadmap_example["timeline"]["pis"][1]["start"] = "2026-12-27"

    assert "PI 1 · 2027 starts before PI 4 · 2026 ends" in roadmap_error(roadmap_example)


def test_RM_4_overlap_checked_in_start_order(roadmap_example: dict[str, Any]) -> None:
    pis = roadmap_example["timeline"]["pis"]
    pis.reverse()
    pis[0]["start"] = "2027-03-01"  # PI 2 · 2027 now starts inside PI 1 · 2027

    assert "PI 2 · 2027 starts before PI 1 · 2027 ends" in roadmap_error(roadmap_example)


def test_RM_4_contiguous_and_gapped_pis_accepted(roadmap_example: dict[str, Any]) -> None:
    contiguous = RoadmapDocument.model_validate(roadmap_example)
    roadmap_example["timeline"]["pis"][2]["start"] = "2027-04-05"

    gapped = RoadmapDocument.model_validate(roadmap_example)

    assert (len(contiguous.timeline.pis), len(gapped.timeline.pis)) == (3, 3)


@pytest.mark.parametrize("blank_name", ["", "   "])
def test_RM_9_editor_blank_milestone_name_rejected(
    roadmap_example: dict[str, Any], blank_name: str
) -> None:
    roadmap_example["milestones"][0]["name"] = blank_name

    assert "Give the milestone a name" in roadmap_error(roadmap_example)


def test_RM_9_editor_milestone_name_over_120_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["milestones"][0]["name"] = "x" * 121

    with pytest.raises(ValidationError):
        RoadmapDocument.model_validate(roadmap_example)


def test_RM_9_editor_milestone_with_range_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["milestones"][0]["start"] = "2027-01-10"

    assert "Milestone “Beta launch” can't have both a date and a date range" in roadmap_error(
        roadmap_example
    )


def test_RM_9_editor_freeze_with_date_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["milestones"][2]["date"] = "2027-03-20"

    assert "Milestone “Code freeze” can't have both a date and a date range" in roadmap_error(
        roadmap_example
    )


def test_RM_4_v1_from_v0_fixture_still_validates() -> None:
    fixture = json.loads(
        (Path(__file__).parent / "fixtures" / "roadmap.v1-from-v0.json").read_text("utf-8")
    )

    assert RoadmapDocument.model_validate(fixture).kind == "roadmap"


DATE_RANGE_TEXT = "outside the supported range (1900-01-01 to 2999-12-31)"


def test_NF_3_milestone_date_year_7_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["milestones"][0]["date"] = "0007-11-01"

    assert f"Milestone “Beta launch” has a date {DATE_RANGE_TEXT}" in roadmap_error(roadmap_example)


def test_NF_3_freeze_end_after_2999_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["milestones"][2]["end"] = "3000-01-01"

    assert f"Freeze “Code freeze” has a date {DATE_RANGE_TEXT}" in roadmap_error(roadmap_example)


def test_NF_3_item_start_out_of_range_rejected(roadmap_example: dict[str, Any]) -> None:
    item(roadmap_example, "PAY-142")["start"] = "1899-12-31"

    assert f"Item PAY-142 has a date {DATE_RANGE_TEXT}" in roadmap_error(roadmap_example)


def test_NF_3_pi_start_out_of_range_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["timeline"]["pis"][2]["start"] = "3027-03-22"

    assert f"PI 2 · 2027 has a start date {DATE_RANGE_TEXT}" in roadmap_error(roadmap_example)


def test_NF_3_timeline_start_out_of_range_rejected(roadmap_example: dict[str, Any]) -> None:
    roadmap_example["timeline"]["start"] = "0026-11-01"

    assert f"The timeline has a start date {DATE_RANGE_TEXT}" in roadmap_error(roadmap_example)


@pytest.mark.parametrize("boundary", ["1900-01-01", "2999-12-31"])
def test_NF_3_milestone_on_range_boundary_accepted(
    roadmap_example: dict[str, Any], boundary: str
) -> None:
    roadmap_example["milestones"][0]["date"] = boundary

    assert RoadmapDocument.model_validate(roadmap_example).milestones[0].date is not None
