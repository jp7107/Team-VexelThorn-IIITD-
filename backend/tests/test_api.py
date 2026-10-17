"""Auth, authorization, error envelope, health, and diagnosis contract tests."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

# ---------------------------------------------------------------------------
# Health, OpenAPI, docs
# ---------------------------------------------------------------------------


def test_healthz_reports_real_database_status(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["components"]["database"]["status"] == "up"
    # Honesty check: the component is named stub, never "loaded"/"ready".
    assert body["components"]["model"]["status"] == "stub"


def test_healthz_is_503_when_database_is_down(monkeypatch):
    from fastapi.testclient import TestClient

    from app.api.routes import health as health_module
    from app.main import create_app

    # Patch where the route looks it up, and prove the patch is live.
    monkeypatch.setattr(
        health_module, "check_database", lambda: {"status": "down", "error": "OperationalError"}
    )
    assert health_module.check_database()["status"] == "down"
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/healthz")
    assert response.status_code == 503
    assert response.json()["status"] == "degraded"


def test_openapi_and_docs_render(client):
    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    for path in ("/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/me", "/healthz"):
        assert path in paths
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "swagger" in docs.text.lower()


def test_request_id_is_echoed_and_generated(client):
    echoed = client.get("/healthz", headers={"X-Request-ID": "abc-123"})
    assert echoed.headers["X-Request-ID"] == "abc-123"
    generated = client.get("/healthz")
    assert len(generated.headers["X-Request-ID"]) == 32


def test_error_envelope_shape_on_404(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "field", "request_id"}
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]


def test_error_envelope_on_validation(client):
    response = client.post("/api/v1/auth/register", json={"phone": "abc", "password": "x", "name": "A"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["field"] is not None


# ---------------------------------------------------------------------------
# Registration and login
# ---------------------------------------------------------------------------


def test_register_login_me_and_patch(client):
    body, headers = _register(client, "9876543210", role="farmer", crops=["tomato", "wheat"])
    assert body["user"]["role"] == "farmer"
    assert body["user"]["language"] == "hi"
    assert body["access_token"]

    login = client.post("/api/v1/auth/login", json={"phone": "9876543210", "password": "correct horse 42"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["phone"] == "9876543210"
    assert "password_hash" not in me.json()

    patched = client.patch(
        "/api/v1/auth/me", headers=headers, json={"name": "Ramesh", "village": "Sonipat", "lang": "en"}
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Ramesh"
    assert patched.json()["village"] == "Sonipat"
    assert patched.json()["language"] == "en"


def test_phone_is_normalized(client):
    _, _headers = _register(client, "+91 98765 43211")
    login = client.post("/api/v1/auth/login", json={"phone": "9876543211", "password": "correct horse 42"})
    assert login.status_code == 200


def test_wrong_password_is_rejected(client):
    _register(client, "9876543212")
    response = client.post("/api/v1/auth/login", json={"phone": "9876543212", "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_unknown_phone_and_wrong_password_look_identical(client):
    unknown = client.post("/api/v1/auth/login", json={"phone": "9876500000", "password": "whatever-pass"})
    _register(client, "9876543213")
    wrong = client.post("/api/v1/auth/login", json={"phone": "9876543213", "password": "whatever-pass"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["error"]["code"] == wrong.json()["error"]["code"]


def test_duplicate_phone_is_conflict(client):
    _register(client, "9876543214")
    response = client.post(
        "/api/v1/auth/register",
        json={"phone": "9876543214", "password": "correct horse 42", "name": "Someone", "role": "customer"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PHONE_TAKEN"
    assert response.json()["error"]["field"] == "phone"


def test_invalid_role_is_rejected(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"phone": "9876543215", "password": "correct horse 42", "name": "X", "role": "superuser"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    ("index", "role"), [(1, "farmer"), (2, "customer"), (3, "wholesaler")]
)
def test_self_registration_allowed_roles(client, index, role):
    _body, _headers = _register(client, f"98765433{index:02d}", role=role)


def test_admin_self_registration_is_forbidden(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"phone": "9876543220", "password": "correct horse 42", "name": "Sneaky", "role": "admin"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_NOT_ALLOWED"


def test_protected_route_requires_token(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "MISSING_TOKEN"


def test_tampered_token_is_rejected(client):
    _body, headers = _register(client, "9876543221")
    token = headers["Authorization"].split(" ", 1)[1]
    tampered = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


# ---------------------------------------------------------------------------
# Role isolation: T-SEC-01
# ---------------------------------------------------------------------------


def test_farmer_cannot_read_another_farmers_diagnosis(client):
    _a, headers_a = _register(client, "9876543230")
    _b, headers_b = _register(client, "9876543231")

    created = client.post(
        "/api/v1/diagnoses", headers=headers_a, json={"image_key": "uploads/a.jpg", "crop_hint": "tomato"}
    )
    assert created.status_code == 201, created.text
    diagnosis_id = created.json()["id"]

    own = client.get(f"/api/v1/diagnoses/{diagnosis_id}", headers=headers_a)
    assert own.status_code == 200

    other = client.get(f"/api/v1/diagnoses/{diagnosis_id}", headers=headers_b)
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "DIAGNOSIS_NOT_FOUND"

    listing_b = client.get("/api/v1/diagnoses", headers=headers_b)
    assert listing_b.status_code == 200
    assert listing_b.json() == []


def test_customer_cannot_create_a_diagnosis(client):
    _body, headers = _register(client, "9876543240", role="customer")
    response = client.post("/api/v1/diagnoses", headers=headers, json={"image_key": "uploads/a.jpg"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_FORBIDDEN"


# ---------------------------------------------------------------------------
# Stub diagnosis contract
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("index", "image_key", "crop_hint", "expected_status", "has_prediction"),
    [
        (1, "uploads/leaf.jpg", "tomato", "confident", True),
        (2, "uploads/uncertain_leaf.jpg", None, "uncertain", True),
        (3, "uploads/unsupported_thing.jpg", None, "unsupported", False),
        (4, "uploads/leaf.jpg", "banana", "unsupported_crop", False),
    ],
)
def test_stub_status_semantics(client, index, image_key, crop_hint, expected_status, has_prediction):
    _body, headers = _register(client, f"98765434{index:02d}")
    payload = {"image_key": image_key}
    if crop_hint:
        payload["crop_hint"] = crop_hint
    response = client.post("/api/v1/diagnoses", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    body = response.json()

    from app.schemas import DiagnosisResult

    DiagnosisResult.model_validate(body)  # schema-valid by construction

    assert body["status"] == expected_status
    assert (body["prediction"] is not None) is has_prediction
    if has_prediction:
        assert 0.0 <= body["prediction"]["confidence"] <= 1.0
        assert body["prediction"]["model_version"] == "stub-0.0.0"
        assert body["prediction"]["thresholds_version"] == "policy-v1"
    assert body["explanation"] is None
    assert "confirmed" not in body["disclaimer"].lower()


def test_diagnosis_persists_prediction_verbatim(client, db_session):
    _body, headers = _register(client, "9876543250")
    created = client.post(
        "/api/v1/diagnoses", headers=headers, json={"image_key": "uploads/leaf.jpg", "crop_hint": "tomato"}
    ).json()
    row = db_session.execute(
        text("SELECT label, status, p_max, model_version FROM diagnoses WHERE id = :id"),
        {"id": uuid.UUID(created["id"])},
    ).one()
    assert row.label == created["prediction"]["label"]
    assert row.status == "confident"
    assert str(row.model_version) == "stub-0.0.0"


# ---------------------------------------------------------------------------
# Database constraints
# ---------------------------------------------------------------------------


def _assert_constraint_fires(db_session, statement: str, params: dict | None = None) -> None:
    """Run a statement expected to fail; the savepoint keeps the outer transaction usable."""
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.execute(text(statement), params or {})


def test_role_check_constraint_fires(db_session):
    _assert_constraint_fires(
        db_session,
        "INSERT INTO users (phone, password_hash, name, role) VALUES ('9876500099', 'x', 'n', 'root')",
    )


def test_listing_quantity_constraint_fires(db_session):
    user_id = db_session.execute(
        text(
            "INSERT INTO users (phone, password_hash, name, role) "
            "VALUES ('9876500098', 'x', 'Farmer', 'farmer') RETURNING id"
        )
    ).scalar_one()
    _assert_constraint_fires(
        db_session,
        "INSERT INTO listings (farmer_id, crop, quantity, unit) VALUES (:fid, 'tomato', -1, 'kg')",
        {"fid": user_id},
    )


def test_diagnosis_label_required_for_confident_rows(db_session):
    user_id = db_session.execute(
        text(
            "INSERT INTO users (phone, password_hash, name, role) "
            "VALUES ('9876500097', 'x', 'Farmer', 'farmer') RETURNING id"
        )
    ).scalar_one()
    _assert_constraint_fires(
        db_session,
        "INSERT INTO diagnoses (farmer_id, image_key, status, model_version, thresholds_version) "
        "VALUES (:fid, 'k', 'confident', 'v', 'p')",
        {"fid": user_id},
    )


def _register(client, phone: str, role: str = "farmer", **extra):
    payload = {"phone": phone, "password": "correct horse 42", "name": "Test User", "role": role, **extra}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    return body, {"Authorization": f"Bearer {body['access_token']}"}
