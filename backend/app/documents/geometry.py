"""Pure diagram geometry used to check the resolved geometry a diagram saves (ADR-2).

Mirrors the swimlane editor's rules: lanes stack by `position` from y = 0, shape `x` is
absolute and `y` is relative to its lane top, and anchors are side midpoints.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.documents import (
        Connector,
        DiagramDocument,
        DiagramLane,
        DiagramShape,
        ShapeType,
        Side,
    )

logger = logging.getLogger(__name__)

LANE_MIN_HEIGHT = 132
MIN_WIDTH = 1016
ANCHOR_TOLERANCE_PX = 1

SHAPE_SIZES: dict[ShapeType, tuple[int, int]] = {
    "start": (40, 40),
    "end": (40, 40),
    "task": (136, 64),
    "sub": (136, 64),
    "doc": (136, 64),
    "decision": (136, 88),
    "data": (120, 72),
    "note": (184, 64),
}

Point = tuple[float, float]


def lane_tops(lanes: Iterable[DiagramLane]) -> dict[str, float]:
    """Absolute top of each lane by id: lanes sorted by `position`, heights accumulated."""
    tops: dict[str, float] = {}
    top = 0.0
    for lane in sorted(lanes, key=lambda lane: lane.position):
        tops[lane.id] = top
        top += lane.height
    return tops


def anchor(shape: DiagramShape, side: Side, lane_top: float) -> Point:
    """Absolute midpoint of `shape`'s `side`, given the top of the lane it sits in."""
    width, height = SHAPE_SIZES[shape.type]
    left = shape.x
    top = lane_top + shape.y
    if side == "l":
        return (left, top + height / 2)
    if side == "r":
        return (left + width, top + height / 2)
    if side == "t":
        return (left + width / 2, top)
    return (left + width / 2, top + height)


def bad_connector_ids(document: DiagramDocument) -> list[str]:
    """Ids of connectors whose saved route is not orthogonal or misses its anchors.

    Connectors with no points are skipped with a warning; the renderer falls back for them.
    """
    tops = lane_tops(document.lanes)
    shapes = {shape.id: shape for shape in document.shapes}
    bad_ids: list[str] = []
    for connector in document.connectors:
        if not connector.points:
            logger.warning(
                "Connector %s has no points; it will need a fallback route", connector.id
            )
            continue
        if not _is_drawn_correctly(connector, shapes, tops):
            bad_ids.append(connector.id)
    return bad_ids


def _is_drawn_correctly(
    connector: Connector, shapes: dict[str, DiagramShape], tops: dict[str, float]
) -> bool:
    points = connector.points
    if len(points) < 2 or not _is_orthogonal(points):
        return False
    start = _anchor_of(shapes.get(connector.from_), connector.from_side, tops)
    end = _anchor_of(shapes.get(connector.to), connector.to_side, tops)
    if start is None or end is None:
        return False
    return _near(points[0], start) and _near(points[-1], end)


def _is_orthogonal(points: list[Point]) -> bool:
    return all(x1 == x2 or y1 == y2 for (x1, y1), (x2, y2) in zip(points, points[1:], strict=False))


def _anchor_of(shape: DiagramShape | None, side: Side, tops: dict[str, float]) -> Point | None:
    if shape is None or shape.lane_id not in tops:
        return None
    return anchor(shape, side, tops[shape.lane_id])


def _near(point: Point, target: Point) -> bool:
    return math.hypot(point[0] - target[0], point[1] - target[1]) <= ANCHOR_TOLERANCE_PX
