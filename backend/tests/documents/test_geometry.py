from app.documents.geometry import anchor, lane_tops
from app.schemas.documents import DiagramLane, DiagramShape


def lane(lane_id: str, position: float, height: int) -> DiagramLane:
    return DiagramLane(id=lane_id, name=lane_id, position=position, height=height)


def test_lane_tops_follow_position_not_list_order() -> None:
    lanes = [lane("third", 3000, 132), lane("first", 1000, 200), lane("second", 2000, 150)]

    assert lane_tops(lanes) == {"first": 0, "second": 200, "third": 350}


def test_anchor_sides_for_task_and_decision() -> None:
    task = DiagramShape(id="A", type="task", lane_id="l", x=216, y=34)
    decision = DiagramShape(id="D", type="decision", lane_id="l", x=400, y=22)

    anchors = (
        anchor(task, "l", 0),
        anchor(task, "r", 0),
        anchor(decision, "t", 132),
        anchor(decision, "b", 132),
    )

    assert anchors == ((216, 66), (352, 66), (468, 154), (468, 242))
