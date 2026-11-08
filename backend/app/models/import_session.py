from datetime import datetime, timedelta
from typing import Any, Final

from sqlalchemy import JSON, CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.db import Base

# ASSUMPTION: an upload purges older sessions first and a commit deletes its own session.
IMPORT_SESSION_TTL: Final = timedelta(hours=1)


class ImportSession(Base):
    """A parsed Jira export kept between upload, live preview and commit (IMP-1 to IMP-12)."""

    __tablename__ = "import_sessions"
    __table_args__ = (
        CheckConstraint("format in ('csv','json','xml')", name="ck_import_sessions_format"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    file_name: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(8))
    encoding: Mapped[str] = mapped_column(String(16))
    size: Mapped[int] = mapped_column(Integer)
    row_count: Mapped[int] = mapped_column(Integer)
    # ImportColumn dicts plus each column's source indexes.
    columns: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    # Per row, per kept column, the values of its repeated cells; ignored columns are dropped.
    rows: Mapped[list[list[list[str]]]] = mapped_column(JSON)
    # {sprintWindows: {name: [start, end]}, releaseDates: {name: date}} from JSON/XML exports,
    # plus ignoredColumns and statuses: upload-time results kept here so the table needs no
    # extra columns.
    extras: Mapped[dict[str, Any]] = mapped_column(JSON)
    template_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=clock.now, server_default=func.now(), index=True
    )
