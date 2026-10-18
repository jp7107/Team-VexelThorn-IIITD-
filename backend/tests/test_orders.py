import hashlib
import hmac
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import update

from app.core.db import SessionLocal
from app.models import Order, User
from tests.conftest import make_client, register

LISTING = {"crop_code": "tomato", "title": "Tomatoes", "quantity": "100", "unit": "quintal", "price_per_unit": "50",
           "min_order_qty": "2"}


def market(**listing):
    f, c = make_client(), make_client()
    register(f, name="Yash Farmer")
    register(c, role="customer", name="JP Store")
    lst = f.post("/listings", json={**LISTING, **listing}).json()
    return f, c, lst


def enquire(c, listing_id, qty):
    r = c.post(f"/listings/{listing_id}/enquiries", json={"quantity": qty})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def admin_client():
    a = make_client()
    u = register(a, name="Root Admin")
    with SessionLocal() as db:
        db.execute(update(User).where(User.phone == u["phone"]).values(role="admin", customer_type=None))
        db.commit()
    return a


def test_accepting_takes_stock_off_and_cancelling_returns_it():
    f, c, lst = market()
    order = f.patch(f"/enquiries/{enquire(c, lst['id'], '10')}", json={"status": "accepted"}).json()
    assert order["order_status"] == "awaiting_payment"
    assert float(f.get(f"/listings/{lst['id']}").json()["quantity"]) == 90  # 100 - 10

    # A second buyer takes the rest: the listing becomes sold out and leaves the market.
    other = make_client()
    register(other, role="customer")
    eid = enquire(other, lst["id"], "90")
    f.patch(f"/enquiries/{eid}", json={"status": "accepted"})
    mine = f.get(f"/listings/{lst['id']}").json()
    assert float(mine["quantity"]) == 0 and mine["status"] == "sold_out"
    assert c.get("/listings").json() == []

    # The first buyer cancels before paying: stock comes back and the listing reopens.
    r = c.patch(f"/orders/{order['order_id']}", json={"action": "cancel", "reason": "Changed plans"})
    assert r.json()["status"] == "cancelled" and r.json()["cancelled_by"] == "buyer"
    mine = f.get(f"/listings/{lst['id']}").json()
    assert float(mine["quantity"]) == 10 and mine["status"] == "open"


def test_stock_and_minimum_order_are_enforced():
    f, c, lst = market(quantity="5")
    assert c.post(f"/listings/{lst['id']}/enquiries", json={"quantity": "1"}).json()["error"]["code"] == "BELOW_MIN_ORDER"
    assert c.post(f"/listings/{lst['id']}/enquiries", json={"quantity": "6"}).json()["error"]["code"] == "NOT_ENOUGH_STOCK"
    first = enquire(c, lst["id"], "4")
    other = make_client()
    register(other, role="customer")
    second = enquire(other, lst["id"], "3")
    assert f.patch(f"/enquiries/{first}", json={"status": "accepted"}).status_code == 200
    r = f.patch(f"/enquiries/{second}", json={"status": "accepted"})  # only 1 left
    assert r.status_code == 409 and r.json()["error"]["code"] == "NOT_ENOUGH_STOCK"
    assert f.get("/me/enquiries").json()[0]["status"] == "pending"  # nothing changed


def test_price_needed_when_listing_has_none_and_fee_from_settings():
    admin = admin_client()
    cfg = admin.get("/admin/settings").json()
    cfg.pop("online_gateway_configured")
    assert admin.put("/admin/settings", json={**cfg, "platform_fee_percent": "2"}).status_code == 200
    assert float(make_client().get("/config").json()["platform_fee_percent"]) == 2

    f, c, lst = market(price_per_unit=None)
    eid = enquire(c, lst["id"], "3")
    r = f.patch(f"/enquiries/{eid}", json={"status": "accepted"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "PRICE_REQUIRED"
    order_id = f.patch(f"/enquiries/{eid}", json={"status": "accepted", "price_per_unit": "40"}).json()["order_id"]
    o = c.get(f"/orders/{order_id}").json()
    assert (o["subtotal"], o["platform_fee"], o["total"]) == ("120.00", "2.40", "122.40")


def test_upi_payment_confirmed_by_farmer_gives_a_receipt():
    f, c, lst = market()
    order_id = f.patch(f"/enquiries/{enquire(c, lst['id'], '10')}", json={"status": "accepted"}).json()["order_id"]
    assert c.get(f"/orders/{order_id}").json()["pay_methods"] == ["cash"]  # no UPI ID yet
    assert f.patch("/me", json={"upi_id": "not a vpa"}).status_code == 422
    assert f.patch("/me", json={"upi_id": "yash.farmer@okaxis"}).status_code == 200
    o = c.get(f"/orders/{order_id}").json()
    assert o["pay_methods"] == ["upi", "cash"] and o["farmer_upi_id"] == "yash.farmer@okaxis"
    assert o["farmer_phone"] and o["buyer_phone"] is None

    r = c.post(f"/orders/{order_id}/payment", json={"method": "upi"})
    assert r.json()["error"]["code"] == "UPI_REF_REQUIRED"
    r = c.post(f"/orders/{order_id}/payment", json={"method": "upi", "upi_ref": "412345678901"})
    assert r.json()["order"]["status"] == "payment_submitted"
    assert c.get(f"/orders/{order_id}/receipt").status_code == 404  # not until confirmed
    assert c.patch(f"/orders/{order_id}", json={"action": "confirm_payment"}).status_code == 409  # farmer's call

    paid = f.patch(f"/orders/{order_id}", json={"action": "confirm_payment"}).json()
    assert paid["status"] == "paid" and paid["receipt_no"].startswith(f"KM-{datetime.now(UTC):%Y}-")
    for who in (c, f):
        rec = who.get(f"/orders/{order_id}/receipt").json()
        assert rec["receipt_no"] == paid["receipt_no"] and rec["order"]["total"] == "500.00"
    stranger = make_client()
    register(stranger, role="customer")
    assert stranger.get(f"/orders/{order_id}/receipt").status_code == 404

    assert c.patch(f"/orders/{order_id}", json={"action": "cancel"}).status_code == 409  # paid: no cancelling
    assert c.patch(f"/orders/{order_id}", json={"action": "dispatch"}).status_code == 409  # farmer dispatches
    assert f.patch(f"/orders/{order_id}", json={"action": "dispatch"}).json()["status"] == "dispatched"
    assert f.patch(f"/orders/{order_id}", json={"action": "deliver"}).status_code == 409  # buyer confirms
    assert c.patch(f"/orders/{order_id}", json={"action": "deliver"}).json()["status"] == "delivered"
    assert [o["status"] for o in f.get("/me/orders").json()] == ["delivered"]


def test_farmer_can_reject_a_payment_that_never_arrived():
    f, c, lst = market()
    order_id = f.patch(f"/enquiries/{enquire(c, lst['id'], '2')}", json={"status": "accepted"}).json()["order_id"]
    c.post(f"/orders/{order_id}/payment", json={"method": "cash"})
    r = f.patch(f"/orders/{order_id}", json={"action": "reject_payment"}).json()
    assert r["status"] == "awaiting_payment" and r["payment_method"] is None


def test_online_payment_needs_a_valid_gateway_signature(monkeypatch, settings):
    settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET = "rzp_test_abc", "secret123"
    sent = []

    def fake_post(url, auth, json, timeout):
        sent.append((url, auth, json))
        return httpx.Response(200, json={"id": "order_TEST123"}, request=httpx.Request("POST", url))

    monkeypatch.setattr("app.routers.orders.httpx.post", fake_post)
    f, c, lst = market()
    order_id = f.patch(f"/enquiries/{enquire(c, lst['id'], '3')}", json={"status": "accepted"}).json()["order_id"]
    assert c.get(f"/orders/{order_id}").json()["pay_methods"][0] == "online"
    out = c.post(f"/orders/{order_id}/payment", json={"method": "online"}).json()
    assert out["gateway"] == {"key_id": "rzp_test_abc", "gateway_order_id": "order_TEST123", "amount": 15000,
                              "currency": "INR"}
    assert sent[0][0] == "https://api.razorpay.com/v1/orders" and sent[0][2]["amount"] == 15000

    bad = c.post(f"/orders/{order_id}/payment/verify", json={
        "razorpay_order_id": "order_TEST123", "razorpay_payment_id": "pay_1", "razorpay_signature": "0" * 64})
    assert bad.status_code == 400 and c.get(f"/orders/{order_id}").json()["status"] == "awaiting_payment"
    sig = hmac.new(b"secret123", b"order_TEST123|pay_1", hashlib.sha256).hexdigest()
    ok = c.post(f"/orders/{order_id}/payment/verify", json={
        "razorpay_order_id": "order_TEST123", "razorpay_payment_id": "pay_1", "razorpay_signature": sig}).json()
    assert ok["status"] == "paid" and ok["payment_ref"] == "pay_1" and ok["receipt_no"]


def test_unpaid_orders_expire_and_return_stock():
    f, c, lst = market()
    order_id = f.patch(f"/enquiries/{enquire(c, lst['id'], '10')}", json={"status": "accepted"}).json()["order_id"]
    with SessionLocal() as db:
        db.execute(update(Order).where(Order.id == order_id).values(created_at=datetime.now(UTC) - timedelta(days=3)))
        db.commit()
    o = c.get(f"/orders/{order_id}").json()
    assert o["status"] == "cancelled" and o["cancelled_by"] == "system"
    assert float(f.get(f"/listings/{lst['id']}").json()["quantity"]) == 100


def test_admin_blocks_users_and_manages_catalogue_prices_and_stats():
    admin = admin_client()
    f, c, lst = market()
    farmer_id = f.get("/auth/me").json()["id"]
    assert admin.patch(f"/admin/users/{farmer_id}", json={"is_active": False}).json()["is_active"] is False
    r = f.get("/me/listings")
    assert r.status_code == 403 and r.json()["error"]["code"] == "ACCOUNT_BLOCKED"
    assert admin.get("/admin/users?q=yash").json()[0]["is_active"] is False
    admin.patch(f"/admin/users/{farmer_id}", json={"is_active": True})
    assert f.get("/me/listings").status_code == 200

    assert f.post("/listings", json={**LISTING, "crop_code": "onion"}).json()["error"]["code"] == "CROP_NOT_LISTED"
    onion = {"code": "onion", "name_en": "Onion", "name_hi": "प्याज़", "mandi_commodity": "Onion"}
    assert admin.put("/admin/crops/onion", json=onion).status_code == 200
    assert [x["code"] for x in make_client().get("/crops").json()] == ["onion", "tomato", "potato", "maize"]
    assert f.post("/listings", json={**LISTING, "crop_code": "onion"}).status_code == 201
    assert make_client().get("/crops").json()[1]["leaf_check"] is True  # tomato: the model knows it

    price = {"commodity": "Onion", "state": "Maharashtra", "district": "Nashik", "market": "Lasalgaon",
             "arrival_date": datetime.now(UTC).date().isoformat(), "min_price": "1200", "max_price": "1800",
             "modal_price": "1500"}
    assert admin.post("/admin/prices", json={**price, "modal_price": "2000"}).status_code == 422
    assert admin.post("/admin/prices", json=price).status_code == 201
    rows = c.get("/market/prices?commodity=Onion").json()["rows"]
    assert rows[0]["market"] == "Lasalgaon" and rows[0]["is_demo"] is False and rows[0]["source"].startswith("Admin")

    eid = enquire(c, lst["id"], "10")
    f.patch(f"/enquiries/{eid}", json={"status": "accepted"})
    s = admin.get("/admin/stats?days=7").json()
    assert len(s["daily"]) == 7 and s["daily"][-1]["orders"] == 1 and s["daily"][-1]["signups"] >= 3
    assert [x["value"] for x in s["funnel"]] == ["1", "1", "0", "0"]
    assert s["totals"]["farmers"] == "1" and len(admin.get("/admin/orders").json()) == 1
    assert c.get("/admin/stats").status_code == 403
