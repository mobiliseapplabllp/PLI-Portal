"""Application configuration, loaded from environment / .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Medical Imaging Diagnostic Assistant"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"

    database_url: str = "sqlite:///./mid.db"

    # "mock" (default, runs anywhere) or "real" (needs requirements-ml.txt)
    ai_engine_mode: str = "mock"

    upload_dir: str = "./uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
