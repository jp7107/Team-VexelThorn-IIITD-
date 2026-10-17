"""Application settings, loaded once and validated at startup.

Every value comes from the environment (or a local, gitignored `.env`).
No credential ever has a usable default: the app refuses to start without a
proper JWT secret and database URL (IMPLEMENTATION_PLAN.md §19.1, §20.2).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_PREFIX = "CHANGE_ME"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Kisan Mitra API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"

    database_url: str = Field(min_length=1)
    database_echo: bool = False

    jwt_secret: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_access_token_ttl_minutes: int = Field(default=30, ge=1, le=1440)

    cors_origins: str = "http://localhost:3000"

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # LLM credentials are optional in P1a (no assistant yet). /healthz reports
    # only whether a key is present, never its value.
    llm_provider: str = "gemini"
    llm_api_key: SecretStr | None = None
    llm_model: str = ""

    # Inference thresholds (stub reads the low bound only; the real policy is
    # tuned in the ML phase, plan §8.8 / ML-07).
    ml_confident_p_max: float = 0.80
    ml_margin_min: float = 0.30
    ml_low_p_max: float = 0.45

    @field_validator("jwt_secret")
    @classmethod
    def reject_placeholder_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if secret.startswith(PLACEHOLDER_PREFIX):
            raise ValueError(
                "JWT_SECRET is still the placeholder from .env.example. "
                'Generate one with: python3 -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def database_url_for_alembic(self) -> str:
        """Alembic needs the raw URL; keep the secret out of logs by never printing it."""
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
