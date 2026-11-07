from datetime import datetime

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.db import Base


class MappingTemplate(Base):
    """A saved Jira column → roadmap field mapping, applied first on the next import (IMP-9)."""

    __tablename__ = "mapping_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    jira_site: Mapped[str | None] = mapped_column(String(255))
    column_map: Mapped[dict[str, str]] = mapped_column(JSON)
    status_map: Mapped[dict[str, str]] = mapped_column(JSON)
    # Same clock-driven defaults as Document.updated_at, so tests can freeze them.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=clock.now,
        onupdate=clock.now,
        server_default=func.now(),
        index=True,
    )
