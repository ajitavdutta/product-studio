from datetime import datetime, timedelta
from typing import Any, Final

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.core import clock
from app.db import Base
from app.models.document import Document

# Same lifetime as an import session; purged when the next re-sync is created.
ROADMAP_RESYNC_TTL: Final = timedelta(hours=1)


class RoadmapResync(Base):
    """A diff between a roadmap and a newer Jira export, kept between upload and apply (RM-15)."""

    __tablename__ = "roadmap_resyncs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    base_revision: Mapped[int] = mapped_column(Integer)
    file_name: Mapped[str] = mapped_column(String(255))
    # No foreign key: deleting a template must not break a re-sync already under way.
    template_id: Mapped[str | None] = mapped_column(String(36))
    # Each ResyncChange dict plus its private `payload`: the values apply writes.
    changes: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    warnings: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=clock.now, server_default=func.now(), index=True
    )

    # SQLite only enforces ON DELETE CASCADE with PRAGMA foreign_keys, which the app doesn't
    # set, so the ORM deletes a roadmap's re-syncs too. Declared here to keep Document unaware.
    roadmap: Mapped[Document] = relationship(
        backref=backref("resyncs", cascade="all, delete-orphan")
    )
