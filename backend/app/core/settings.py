from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from `PS_*` environment variables or `.env`."""

    model_config = SettingsConfigDict(env_prefix="PS_", env_file=".env")

    database_url: str = "sqlite:///./product_studio.db"
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
