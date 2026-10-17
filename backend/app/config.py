"""Backend settings. Values can be overridden via COTTON_* env vars or a .env.

DATABASE_URL defaults to SQLite for zero-setup local dev/tests; Docker/compose
sets a PostgreSQL URL (plan sections 19/20/28).
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./cotton.db"
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 1 day
    device: str = "cpu"  # inference on CPU first (plan 16/28)
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    upload_dir: str = "data/uploads"
    max_upload_mb: int = 10

    model_config = SettingsConfigDict(env_prefix="COTTON_", env_file=".env", extra="ignore")

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
