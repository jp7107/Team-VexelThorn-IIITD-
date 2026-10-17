import json

from sqlalchemy import update

from app.core.db import SessionLocal
from app.models import User
from tests.conftest import make_client, register

LISTING = {"crop_code": "tomato", "title": "Fresh tomatoes", "quantity": "5", "unit": "quintal",
           "price_per_unit": "1800", "min_order_qty": "1"}


def setup():
    f, c = make_client(), make_client()
    farmer = register(f, name="Ramesh Kumar")
    buyer = register(c, role="customer", customer_type="wholesale", name="Asha Traders")
    listing = f.post("/listings", json=LISTING).json()
    return f, c, farmer, buyer, listing


def make_admin(client):
    user = register(client)
    with SessionLocal() as db:
        db.execute(update(User).where(User.phone == user["phone"]).values(role="admin", customer_type=None))
        db.commit()
    return user


def test_farmer_lists_produce_with_profile_location():
    f, c, farmer, _, listing = setup()
    assert listing["state"] == "Delhi" and listing["district"] == "New Delhi"
    assert listing["is_mine"] is True and listing["pending_enquiries"] == 0
    assert listing["farmer"] == {"id": farmer["id"], "first_name": "Ramesh", "rating_avg": None, "rating_count": 0}
    assert c.post("/listings", json=LISTING).status_code == 403  # buyers can't list
    assert f.post("/listings", json={**LISTING, "min_order_qty": "9"}).status_code == 422
    assert f.post("/listings", json={**LISTING, "quantity": "0"}).status_code == 422


def test_browse_filters_and_never_exposes_phone():
    f, c, farmer, _, _ = setup()
    f.post("/listings", json={**LISTING, "crop_code": "potato", "quantity": "50", "unit": "kg"})
    rows = c.get("/listings").json()
    assert len(rows) == 2 and all(r["is_mine"] is False and r["pending_enquiries"] is None for r in rows)
    assert farmer["phone"] not in json.dumps(rows)
    assert [r["crop_code"] for r in c.get("/listings?crop_code=potato").json()] == ["potato"]
    # 5 quintal of tomato passes a 1-quintal minimum; 50 kg of potato does not, despite the bigger number.
    assert [r["crop_code"] for r in c.get("/listings?min_quintal=1").json()] == ["tomato"]
    assert c.get("/listings?min_quintal=6").json() == []
    assert c.get("/listings?state=Punjab").json() == []
    assert make_client().get("/listings").status_code == 401


def test_enquiry_accept_reveals_phone_only_to_that_buyer():
    f, c, farmer, buyer, listing = setup()
    r = c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "2", "message": "Can you deliver?"})
    assert r.status_code == 201 and r.json()["farmer_phone"] is None
    eid = r.json()["id"]
    assert c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).status_code == 409

    received = f.get("/me/enquiries").json()
    assert [e["id"] for e in received] == [eid]
    assert received[0]["buyer_first_name"] == "Asha" and received[0]["buyer_type"] == "wholesale"
    assert received[0]["farmer_phone"] is None
    assert f.get("/me/listings").json()[0]["pending_enquiries"] == 1

    accepted = f.patch(f"/enquiries/{eid}", json={"status": "accepted"})
    assert accepted.status_code == 200 and accepted.json()["farmer_phone"] is None  # farmer's own view
    sent = c.get("/me/enquiries").json()
    assert sent[0]["status"] == "accepted" and sent[0]["farmer_phone"] == farmer["phone"]
    assert sent[0]["can_rate"] is True

    other_buyer = make_client()
    register(other_buyer, role="customer")
    assert farmer["phone"] not in json.dumps(other_buyer.get("/me/enquiries").json())
    assert other_buyer.patch(f"/enquiries/{eid}", json={"status": "withdrawn"}).status_code == 404


def test_enquiry_state_machine():
    f, c, _, _, listing = setup()
    eid = c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).json()["id"]
    assert c.patch(f"/enquiries/{eid}", json={"status": "accepted"}).status_code == 409  # buyer can't accept
    assert f.patch(f"/enquiries/{eid}", json={"status": "withdrawn"}).status_code == 409  # farmer can't withdraw
    assert f.patch(f"/enquiries/{eid}", json={"status": "declined"}).status_code == 200
    assert f.patch(f"/enquiries/{eid}", json={"status": "accepted"}).status_code == 409  # already decided
    # After a decision the buyer may enquire again.
    assert c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).status_code == 201

    other_farmer = make_client()
    register(other_farmer)
    assert other_farmer.patch(f"/enquiries/{eid}", json={"status": "accepted"}).status_code == 404


def test_closed_listing_rejects_enquiries_and_leaves_browse():
    f, c, _, _, listing = setup()
    assert c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "9"}).status_code == 422  # > listed
    assert f.patch(f"/listings/{listing['id']}", json={"status": "closed"}).json()["status"] == "closed"
    assert c.get("/listings").json() == []
    assert c.get(f"/listings/{listing['id']}").status_code == 404
    assert f.get(f"/listings/{listing['id']}").status_code == 200  # owner still sees it
    assert c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).status_code == 404


def test_only_owner_edits_and_only_admin_hides():
    f, c, _, _, listing = setup()
    lid = listing["id"]
    other = make_client()
    register(other)
    assert other.patch(f"/listings/{lid}", json={"title": "Mine now"}).status_code == 404
    assert f.patch(f"/listings/{lid}", json={"status": "hidden"}).status_code == 403
    assert float(f.patch(f"/listings/{lid}", json={"price_per_unit": "2000"}).json()["price_per_unit"]) == 2000
    assert f.patch(f"/listings/{lid}", json={"quantity": "0.5"}).status_code == 422  # below min order qty

    admin = make_client()
    make_admin(admin)
    assert admin.patch(f"/listings/{lid}", json={"title": "Edited by admin"}).status_code == 403
    assert admin.patch(f"/listings/{lid}", json={"status": "hidden"}).json()["status"] == "hidden"
    assert c.get("/listings").json() == []
    assert f.patch(f"/listings/{lid}", json={"status": "open"}).status_code == 403  # owner can't unhide
    assert admin.patch(f"/listings/{lid}", json={"status": "open"}).json()["status"] == "open"
