from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routers import (
    assets,
    diagrams,
    health,
    mapping_templates,
    roadmaps,
    watermark_presets,
)
from app.api.routers import settings as settings_router
from app.core.settings import get_settings


def create_app() -> FastAPI:
    """Build the FastAPI application with CORS and every `/api` router mounted."""
    settings = get_settings()
    app = FastAPI(title="Product Studio API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    api_router = APIRouter(prefix="/api")
    api_router.include_router(health.router)
    api_router.include_router(roadmaps.router)
    api_router.include_router(diagrams.router)
    api_router.include_router(mapping_templates.router)
    api_router.include_router(watermark_presets.router)
    api_router.include_router(settings_router.router)
    api_router.include_router(assets.router)
    app.include_router(api_router)
    return app


app = create_app()
