from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # backend/.env regardless of the working directory the server is started from
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore")

    ENV: Literal["dev", "test", "prod"] = "dev"
    DATABASE_URL: str = "postgresql+psycopg://kisan:kisan@localhost:5432/kisan"
    JWT_SECRET: str
    JWT_TTL_HOURS: int = 12
    COOKIE_SECURE: bool = False

    BLUR_MIN: float | None = None
    BRIGHT_MIN: float | None = None
    BRIGHT_MAX: float | None = None
    # Override the validated thresholds shipped in app/ml/model/model.json (plan §9.7).
    CONF_ACCEPT: float | None = None
    CONF_FLOOR: float | None = None

    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""  # Groq model ID from console.groq.com/docs/models (plan D-02)
    LLM_TIMEOUT_S: float = 25
    LLM_FORCE_FAIL: bool = False  # demo/test switch for the fallback path (plan §12 Path F)
    DATAGOV_API_KEY: str = ""
    # Razorpay test-mode keys (free account, no real money). Online payment is offered only when both are set.
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    # Optional first admin, created by `python -m app.seed` (there is no admin self-registration).
    ADMIN_PHONE: str = ""
    ADMIN_PASSWORD: str = ""
    ADMIN_NAME: str = "Admin"

    SEED_DEMO_PASSWORD: str = ""

    @field_validator("BLUR_MIN", "BRIGHT_MIN", "BRIGHT_MAX", "CONF_ACCEPT", "CONF_FLOOR", mode="before")
    @classmethod
    def _blank_is_none(cls, v):
        return None if v == "" else v

    @model_validator(mode="after")
    def _prod_guards(self):
        if self.ENV == "prod":
            if len(self.JWT_SECRET) < 32:
                raise ValueError("JWT_SECRET must be at least 32 characters in prod")
            if not self.COOKIE_SECURE:
                raise ValueError("COOKIE_SECURE must be true in prod")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
