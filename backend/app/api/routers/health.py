from fastapi import APIRouter

from app.schemas.health import HealthRead

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthRead)
def read_health() -> HealthRead:
    """Liveness check used by the dev proxy, Docker and CI."""
    return HealthRead(status="ok")
