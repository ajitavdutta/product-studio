from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import health
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

    api_router = APIRouter(prefix="/api")
    api_router.include_router(health.router)
    app.include_router(api_router)
    return app


app = create_app()
