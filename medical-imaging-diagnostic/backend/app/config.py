"""Application configuration, loaded from environment / .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Medical Imaging Diagnostic Assistant"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"

    secret_is_ephemeral: bool = False

    database_url: str = "sqlite:///./mid.db"

    # "mock" (default, runs anywhere) or "real" (needs requirements-ml.txt)
    ai_engine_mode: str = "mock"

    upload_dir: str = "./uploads"


_DEFAULT_SECRETS = {"dev-secret-change-me", "change-me-to-a-long-random-string"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Never sign JWTs with the built-in public default: if it's still in use,
    # substitute a random per-process secret. This closes the known-key forgery
    # attack while keeping zero-config local runs working (tokens simply don't
    # survive a restart until a real SECRET_KEY is set).
    if settings.secret_key in _DEFAULT_SECRETS:
        import secrets

        settings.secret_key = secrets.token_hex(32)
        settings.secret_is_ephemeral = True
    return settings
