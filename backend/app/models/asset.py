from sqlalchemy import LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Asset(Base):
    """An uploaded file, such as a watermark logo. `bytes` is already sanitised."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    mime: Mapped[str] = mapped_column(String(32))
    bytes: Mapped[bytes] = mapped_column(LargeBinary)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
