"""Load the demo roadmap and diagram from `docs/examples/` (`make seed`).

A dev command: the Docker image doesn't contain `docs/`. Safe to run repeatedly, because
documents whose id already exists are skipped.
"""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.db import get_sessionmaker
from app.documents.migrations import load_document
from app.repositories import documents as document_repository
from app.schemas.documents import DocumentKind
from app.services.documents import create_document

EXAMPLES_DIR = Path(__file__).resolve().parents[2] / "docs" / "examples"
EXAMPLE_FILES: tuple[tuple[str, DocumentKind], ...] = (
    ("roadmap.example.json", "roadmap"),
    ("diagram.example.json", "diagram"),
)


def seed_examples(session: Session, examples_dir: Path) -> list[str]:
    """Create each example document unless its id exists; returns the ids created."""
    created: list[str] = []
    for file_name, kind in EXAMPLE_FILES:
        raw = json.loads((examples_dir / file_name).read_text(encoding="utf-8"))
        document = load_document(raw, kind)
        if document_repository.exists(session, str(document.id)):
            continue
        created.append(str(create_document(session, document).id))
    return created


def main() -> None:
    with get_sessionmaker()() as session:
        created = seed_examples(session, EXAMPLES_DIR)
    for document_id in created:
        print(f"Seeded {document_id}")
    if not created:
        print("Demo documents are already loaded")


if __name__ == "__main__":
    main()
