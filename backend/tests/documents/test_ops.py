import copy
import json
from typing import Any

import pytest

from app.documents.ops import OpError, apply_ops, parse_pointer
from app.schemas.document_api import DocumentOp
from tests.conftest import REPO_ROOT

CASES: list[dict[str, Any]] = json.loads(
    (REPO_ROOT / "shared" / "document-ops.cases.json").read_text(encoding="utf-8")
)["cases"]


def parse_ops(raw_ops: list[dict[str, Any]]) -> list[DocumentOp]:
    return [DocumentOp.model_validate(raw_op) for raw_op in raw_ops]


def outcome(case: dict[str, Any]) -> dict[str, Any]:
    try:
        return {"after": apply_ops(case["before"], parse_ops(case["ops"]))}
    except OpError as error:
        return {"error": {"path": error.path}}


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_G_2_shared_op_cases(case: dict[str, Any]) -> None:
    expected = {key: case[key] for key in ("after", "error") if key in case}

    assert outcome(case) == expected


def test_apply_ops_does_not_mutate_input() -> None:
    before = CASES[0]["before"]
    original = copy.deepcopy(before)

    apply_ops(before, parse_ops([{"op": "remove", "path": "/items/it-1/stories/0"}]))

    assert before == original


def test_parse_pointer_unescapes_in_rfc_6901_order() -> None:
    assert parse_pointer("/a~01/b~1c") == ["a~1", "b/c"]


def test_G_2_set_null_message_says_use_remove() -> None:
    with pytest.raises(OpError) as caught:
        apply_ops({"name": "x"}, parse_ops([{"op": "set", "path": "/name", "value": None}]))

    assert caught.value.message == "Use remove to clear a field"
