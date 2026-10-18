"""Tests run against a real Postgres database `kisan_test`, built by the Alembic migrations."""

import io
import os

# Must be set before anything imports app settings.
ADMIN_URL = os.environ.get("TEST_ADMIN_DATABASE_URL", "postgresql://kisan:kisan@localhost:5432/kisan")
TEST_DB = "kisan_test"
os.environ["DATABASE_URL"] = f"postgresql+psycopg://kisan:kisan@localhost:5432/{TEST_DB}"
os.environ["ENV"] = "test"
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-0000"
os.environ["COOKIE_SECURE"] = "false"
# Blank the LLM and price-API keys too: tests must never call real providers, even if backend/.env has keys.
for key in ("BLUR_MIN", "BRIGHT_MIN", "BRIGHT_MAX", "CONF_ACCEPT", "CONF_FLOOR", "LLM_API_KEY", "LLM_MODEL",
            "DATAGOV_API_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "ADMIN_PHONE", "ADMIN_PASSWORD"):
    os.environ[key] = ""
os.environ["LLM_FORCE_FAIL"] = "false"

import psycopg  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core import platform, ratelimit  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        conn.execute(f"CREATE DATABASE {TEST_DB}")
    cfg = Config("alembic.ini")
    cfg.attributes["url"] = os.environ["DATABASE_URL"]
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))
        # The migration's starting crop catalogue: configuration the app needs, restored for every test.
        conn.execute(text("INSERT INTO crop_catalogue (code, name_en, name_hi, mandi_commodity, sort_order) VALUES "
                          "('tomato', 'Tomato', 'टमाटर', 'Tomato', 1), ('potato', 'Potato', 'आलू', 'Potato', 2), "
                          "('maize', 'Maize', 'मक्का', 'Maize', 3)"))
    ratelimit.reset()
    platform.reset_cache()
    yield


@pytest.fixture
def settings():
    """Live settings object. Tests may change attributes; they are restored afterwards."""
    s = get_settings()
    saved = s.model_dump()
    yield s
    for key, value in saved.items():
        setattr(s, key, value)


def make_client() -> TestClient:
    return TestClient(app, base_url="http://testserver/api/v1")


_phone = iter(range(9100000000, 9199999999))


def register(client: TestClient, role: str = "farmer", **extra) -> dict:
    body = {"name": "Test User", "phone": str(next(_phone)), "password": "correct-horse",
            "role": role, "state": "Delhi", "district": "New Delhi", **extra}
    if role == "customer":
        body.setdefault("customer_type", "retail")
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {**r.json(), "phone": body["phone"], "password": body["password"]}


@pytest.fixture
def farmer_client():
    client = make_client()
    register(client)
    return client


def jpeg_bytes(size=(64, 64), color=(40, 140, 60), exif=None) -> bytes:
    out = io.BytesIO()
    img = Image.new("RGB", size, color)
    if exif is None:
        img.save(out, "JPEG")
    else:
        img.save(out, "JPEG", exif=exif)
    return out.getvalue()
