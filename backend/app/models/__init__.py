"""SQLAlchemy tables. Importing this package registers every model on `Base.metadata`."""

from app.models.asset import Asset
from app.models.document import Document
from app.models.import_session import ImportSession
from app.models.mapping_template import MappingTemplate
from app.models.roadmap_resync import RoadmapResync
from app.models.setting import Setting
from app.models.watermark_preset import WatermarkPreset

__all__ = [
    "Asset",
    "Document",
    "ImportSession",
    "MappingTemplate",
    "RoadmapResync",
    "Setting",
    "WatermarkPreset",
]
