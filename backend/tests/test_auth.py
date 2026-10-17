from datetime import UTC, datetime, timedelta

from tests.conftest import jpeg_bytes, make_client, register


def test_register_sets_session_and_me_works():
    client = make_client()
    user = register(client, language="hi")
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == user["id"]
    assert me.json()["language"] == "hi"
    assert "password_hash" not in me.json()


def test_session_cookie_flags():
    client = make_client()
    r = client.post("/auth/register", json={"name": "A", "phone": "9876543210", "password": "correct-horse",
                                            "role": "farmer", "state": "Delhi", "district": "New Delhi"})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_duplicate_phone_is_conflict_with_error_envelope():
    client = make_client()
    user = register(client)
    r = make_client().post("/auth/register", json={"name": "B", "phone": user["phone"], "password": "another-pass",
                                                   "role": "farmer", "state": "Delhi", "district": "New Delhi"})
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "CONFLICT" and err["request_id"]


def test_cannot_self_register_as_admin():
    r = make_client().post("/auth/register", json={"name": "X", "phone": "9876543211", "password": "correct-horse",
                                                   "role": "admin", "state": "Delhi", "district": "New Delhi"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_customer_type_rules():
    base = {"name": "X", "password": "correct-horse", "state": "Delhi", "district": "New Delhi"}
    c = make_client()
    assert c.post("/auth/register", json={**base, "phone": "9876543212", "role": "customer"}).status_code == 422
    assert c.post("/auth/register", json={**base, "phone": "9876543213", "role": "farmer",
                                          "customer_type": "retail"}).status_code == 422


def test_login_logout():
    user = register(make_client())
    client = make_client()
    assert client.post("/auth/login", json={"phone": user["phone"], "password": "wrong-password"}).status_code == 401
    assert client.post("/auth/login", json={"phone": "9999999999", "password": "whatever-1"}).status_code == 401
    assert client.post("/auth/login", json={"phone": user["phone"], "password": user["password"]}).status_code == 200
    assert client.get("/auth/me").status_code == 200
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_tampered_session_is_rejected():
    client = make_client()
    client.cookies.set("session", "not-a-jwt")
    r = client.get("/auth/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_role_isolation():
    customer = make_client()
    register(customer, role="customer")
    assert customer.get("/me/crops").status_code == 403
    r = customer.post("/analyses", data={"crop_code": "tomato"}, files={"image": ("a.jpg", jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 403
    assert make_client().get("/me/crops").status_code == 401


def test_farmer_cannot_touch_another_farmers_data(farmer_client):
    crop = farmer_client.post("/me/crops", json={"crop_code": "tomato", "area_acres": "1.5",
                                                 "sowing_date": "2026-09-01", "stage": "development"}).json()
    reminder = farmer_client.post("/me/reminders", json={
        "title": "Spray check", "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()}).json()
    analysis = farmer_client.post("/analyses", data={"crop_code": "tomato"},
                                  files={"image": ("a.jpg", jpeg_bytes(), "image/jpeg")}).json()

    other = make_client()
    register(other)
    assert other.patch(f"/me/crops/{crop['id']}", json={"stage": "mid"}).status_code == 404
    assert other.delete(f"/me/crops/{crop['id']}").status_code == 404
    assert other.patch(f"/me/reminders/{reminder['id']}", json={"done": True}).status_code == 404
    assert other.get(f"/analyses/{analysis['id']}").status_code == 404
    assert other.get("/me/analyses").json() == []
    assert other.post("/analyses", data={"crop_code": "tomato", "farm_crop_id": crop["id"]},
                      files={"image": ("a.jpg", jpeg_bytes(), "image/jpeg")}).status_code == 404


def test_crop_and_reminder_flow(farmer_client):
    crop = farmer_client.post("/me/crops", json={"crop_code": "potato", "area_acres": "2",
                                                 "sowing_date": "2026-09-15", "stage": "initial"})
    assert crop.status_code == 201
    crop_id = crop.json()["id"]
    assert farmer_client.patch(f"/me/crops/{crop_id}", json={"stage": "mid"}).json()["stage"] == "mid"
    assert farmer_client.post("/me/crops", json={"crop_code": "potato", "area_acres": "0",
                                                 "sowing_date": "2026-09-15", "stage": "initial"}).status_code == 422

    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    future = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    due = farmer_client.post("/me/reminders", json={"title": "Water", "due_at": past, "farm_crop_id": crop_id})
    farmer_client.post("/me/reminders", json={"title": "Later", "due_at": future})
    assert [r["title"] for r in farmer_client.get("/me/reminders?due=true").json()] == ["Water"]
    farmer_client.patch(f"/me/reminders/{due.json()['id']}", json={"done": True})
    assert farmer_client.get("/me/reminders?due=true").json() == []
    assert farmer_client.post("/me/reminders", json={"title": "Naive", "due_at": "2026-10-20T10:00:00"}).status_code == 422

    assert farmer_client.delete(f"/me/crops/{crop_id}").status_code == 204
    assert farmer_client.get("/me/crops").json() == []
