"""Apply autosave ops to a raw camelCase document (G-2). Pure: no I/O, input never mutated.

Mirrors `frontend/src/lib/documentOps/applyOps.ts`. Change one, change the other:
`shared/document-ops.cases.json` locks both. Semantics are in docs/data-model.md, "Autosave ops".
"""

import copy
import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.schemas.document_api import DocumentOp

PROTECTED_KEYS = frozenset({"id", "kind", "schemaVersion"})
PROTECTED_MESSAGE = "The document's id, kind and schema version can't be changed"
_ARRAY_INDEX = re.compile(r"^(0|[1-9][0-9]*)$")

Container = dict[str, Any] | list[Any]


class OpError(Exception):
    """An op that can't be applied. `path` is the op's path and `message` a plain sentence."""

    def __init__(self, path: str, message: str) -> None:
        super().__init__(f"{path}: {message}")
        self.path = path
        self.message = message


def parse_pointer(path: str) -> list[str]:
    """Split an RFC 6901 pointer into unescaped segments ("" is the whole document)."""
    if path == "":
        return []
    if not path.startswith("/"):
        raise OpError(path, "Paths must start with /")
    return [segment.replace("~1", "/").replace("~0", "~") for segment in path[1:].split("/")]


def apply_ops(body: Mapping[str, Any], ops: Sequence[DocumentOp]) -> dict[str, Any]:
    """Apply `ops` in order to a deep copy of `body` and return it. Raises `OpError`."""
    document: dict[str, Any] = copy.deepcopy(dict(body))
    for op in ops:
        _apply_op(document, op)
    return document


def _apply_op(document: dict[str, Any], op: DocumentOp) -> None:
    segments = parse_pointer(op.path)
    if not segments:
        raise OpError(op.path, "The whole document can't be replaced")
    if len(segments) == 1 and segments[0] in PROTECTED_KEYS:
        raise OpError(op.path, PROTECTED_MESSAGE)
    if op.op == "insert":
        _insert(_resolve(document, segments, op.path), op)
        return
    parent = _resolve(document, segments[:-1], op.path)
    if op.op == "set":
        _set(parent, segments[-1], op)
    elif op.op == "remove":
        _remove(parent, segments[-1], op)
    else:
        _move(parent, segments[-1], op)


def _element_index(array: list[Any], segment: str) -> int | None:
    """Index of the element `segment` names: by `id` for arrays of objects, else by position."""
    if any(isinstance(element, dict) and "id" in element for element in array):
        return next(
            (
                index
                for index, element in enumerate(array)
                if isinstance(element, dict) and element.get("id") == segment
            ),
            None,
        )
    if _ARRAY_INDEX.match(segment) and int(segment) < len(array):
        return int(segment)
    return None


def _child(container: Container, segment: str) -> Any:
    if isinstance(container, dict):
        return container.get(segment)
    index = _element_index(container, segment)
    return None if index is None else container[index]


def _resolve(document: dict[str, Any], segments: list[str], path: str) -> Container:
    current: Container = document
    for segment in segments:
        child = _child(current, segment)
        if not isinstance(child, dict | list):
            raise OpError(path, f"There's nothing at {path}")
        current = child
    return current


def _require_value(op: DocumentOp) -> Any:
    if op.value is None:
        raise OpError(op.path, "Use remove to clear a field")
    return copy.deepcopy(op.value)


def _set(parent: Container, segment: str, op: DocumentOp) -> None:
    value = _require_value(op)
    if isinstance(parent, dict):
        parent[segment] = value
        return
    index = _element_index(parent, segment)
    if index is None:
        raise OpError(op.path, f"There's nothing at {op.path}")
    parent[index] = value


def _insert(target: Container, op: DocumentOp) -> None:
    if not isinstance(target, list):
        raise OpError(op.path, "Insert needs a list")
    value = _require_value(op)
    is_duplicate = (
        isinstance(value, dict)
        and "id" in value
        and _element_index(target, str(value["id"])) is not None
    )
    if is_duplicate:
        raise OpError(op.path, f"Something with the id {value['id']} is already there")
    position = len(target) if op.position is None else op.position
    if position > len(target):
        raise OpError(op.path, f"Position {position} is past the end of the list")
    target.insert(position, value)


def _remove(parent: Container, segment: str, op: DocumentOp) -> None:
    if isinstance(parent, dict):
        if segment not in parent:
            raise OpError(op.path, f"There's nothing at {op.path}")
        del parent[segment]
        return
    index = _element_index(parent, segment)
    if index is None:
        raise OpError(op.path, f"There's nothing at {op.path}")
    del parent[index]


def _move(parent: Container, segment: str, op: DocumentOp) -> None:
    if not isinstance(parent, list):
        raise OpError(op.path, "Move needs a list element")
    index = _element_index(parent, segment)
    if index is None:
        raise OpError(op.path, f"There's nothing at {op.path}")
    if op.position is None or op.position >= len(parent):
        raise OpError(op.path, "Move needs a position inside the list")
    parent.insert(op.position, parent.pop(index))
