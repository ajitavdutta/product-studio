from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.seed import EXAMPLES_DIR, seed_examples

ROADMAP_ID = "0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31"
DIAGRAM_ID = "5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50"


async def test_seed_creates_demo_documents_loadable_via_api(
    db_session: Session, client: AsyncClient
) -> None:
    seed_examples(db_session, EXAMPLES_DIR)

    roadmap = await client.get(f"/api/roadmaps/{ROADMAP_ID}")
    diagram = await client.get(f"/api/diagrams/{DIAGRAM_ID}")

    assert (
        roadmap.status_code,
        roadmap.json()["name"],
        diagram.status_code,
        diagram.json()["name"],
    ) == (200, "Payments Platform H1 2027", 200, "Customer refund flow")


def test_seed_is_idempotent(db_session: Session) -> None:
    first = seed_examples(db_session, EXAMPLES_DIR)

    second = seed_examples(db_session, EXAMPLES_DIR)

    assert (first, second) == ([ROADMAP_ID, DIAGRAM_ID], [])
