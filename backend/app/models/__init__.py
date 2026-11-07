"""SQLAlchemy tables. Importing this package registers every model on `Base.metadata`."""

from app.models.document import Document

__all__ = ["Document"]
