"""Test fixtures.

Isolation: every test runs in its own connection with an outer transaction that
is rolled back, and the application session is bound to that connection. Tests
that exercise `session.commit()` still roll back because the outer transaction
is never committed. The test database is never dropped or truncated.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

# Test fixture password; never a real credential.
TEST_PASSWORD = "correct horse 42"  # noqa: S105


def _read_env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    if _ENV_FILE.exists():
        for line in _ENV_FILE.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip()
    return values


def pytest_configure(config):
    """Force the test database and a test secret before app modules import settings.

    Runs before collection, so `app.config.get_settings()` sees these values.
    """
    file_env = _read_env_file()
    os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or file_env.get(
        "TEST_DATABASE_URL", ""
    )
    os.environ["JWT_SECRET"] = "test-secret-" + "0" * 40
    os.environ["ENVIRONMENT"] = "test"
    os.environ["LOG_LEVEL"] = "WARNING"
    if not os.environ["DATABASE_URL"]:
        raise pytest.UsageError(
            "TEST_DATABASE_URL is not set and backend/.env has no TEST_DATABASE_URL. "
            "Migrations must be applied to that database first."
        )


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    with eng.connect() as conn:
        current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert current, "Test database has no applied migrations."
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine) -> Session:
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session):
    from app.db import get_db
    from app.main import create_app

    app = create_app()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def register(client):
    """Helper: register a user and return (response_json, headers)."""

    def _register(phone: str, role: str = "farmer", password: str = TEST_PASSWORD, **extra):
        payload = {"phone": phone, "password": password, "name": "Test User", "role": role, **extra}
        response = client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 201, response.text
        body = response.json()
        return body, {"Authorization": f"Bearer {body['access_token']}"}

    return _register
