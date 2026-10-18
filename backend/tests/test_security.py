from tests.conftest import jpeg_bytes, make_client, register


def test_login_is_limited_per_phone_with_retry_after():
    user = register(make_client())
    c = make_client()
    for _ in range(5):
        assert c.post("/auth/login", json={"phone": user["phone"], "password": "wrong-password"}).status_code == 401
    r = c.post("/auth/login", json={"phone": user["phone"], "password": user["password"]})
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
    assert int(r.headers["retry-after"]) >= 1
    # A different account from the same IP still works.
    other = register(make_client())
    assert c.post("/auth/login", json={"phone": other["phone"], "password": other["password"]}).status_code == 200


def test_login_ip_limit_holds_across_accounts():
    c = make_client()
    for i in range(20):
        c.post("/auth/login", json={"phone": f"98000000{i:02d}", "password": "whatever-1"})
    assert c.post("/auth/login", json={"phone": "9800000099", "password": "whatever-1"}).status_code == 429


def test_register_is_limited_per_ip():
    c = make_client()
    base = {"name": "X", "password": "correct-horse", "role": "farmer", "state": "Delhi", "district": "New Delhi"}
    codes = [c.post("/auth/register", json={**base, "phone": f"97000000{i:02d}"}).status_code for i in range(11)]
    assert codes[:10] == [201] * 10 and codes[10] == 429


def test_chat_is_limited_per_user_not_globally(farmer_client):
    msg = {"messages": [{"role": "user", "content": "hello"}], "language": "en"}
    codes = [farmer_client.post("/assistant/chat", json=msg).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429
    other = make_client()
    register(other)
    assert other.post("/assistant/chat", json=msg).status_code == 200


def test_analyses_are_limited_per_user(farmer_client):
    files = {"image": ("leaf.jpg", jpeg_bytes(), "image/jpeg")}
    codes = [farmer_client.post("/analyses", data={"crop_code": "tomato"}, files=files).status_code for _ in range(21)]
    assert codes[:20] == [201] * 20 and codes[20] == 429


def test_security_headers_and_no_cors():
    r = make_client().get("/healthz", headers={"Origin": "https://evil.example"})
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
    assert "access-control-allow-origin" not in r.headers
    pre = make_client().options("/auth/login", headers={"Origin": "https://evil.example",
                                                        "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in pre.headers
