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
    assert sent[0]["order_status"] == "awaiting_payment" and sent[0]["can_rate"] is False  # rate after delivery

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


# --- ratings (MKT-05) ---

def deliver(f, c, eid):
    """Accept, pay cash, confirm, receive: the whole sale, so the buyer may rate."""
    order_id = f.patch(f"/enquiries/{eid}", json={"status": "accepted"}).json()["order_id"]
    assert c.post(f"/orders/{order_id}/payment", json={"method": "cash"}).status_code == 200
    assert f.patch(f"/orders/{order_id}", json={"action": "confirm_payment"}).status_code == 200
    assert c.patch(f"/orders/{order_id}", json={"action": "deliver"}).json()["status"] == "delivered"


def accepted_enquiry():
    f, c, farmer, buyer, listing = setup()
    eid = c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).json()["id"]
    deliver(f, c, eid)
    return f, c, farmer, listing, eid


def test_buyer_rates_once_and_average_shows_on_listings():
    f, c, farmer, listing, eid = accepted_enquiry()
    r = c.post(f"/enquiries/{eid}/rating", json={"stars": 4, "comment": "  Good quality  "})
    assert r.status_code == 201 and r.json()["comment"] == "Good quality"
    assert c.post(f"/enquiries/{eid}/rating", json={"stars": 1}).status_code == 409  # once per enquiry

    sent = c.get("/me/enquiries").json()[0]
    assert sent["can_rate"] is False and sent["my_rating"] == 4
    assert c.get(f"/listings/{listing['id']}").json()["farmer"]["rating_avg"] == 4.0

    # A second accepted deal from another buyer moves the average.
    other = make_client()
    register(other, role="customer", name="Bina Store")
    eid2 = other.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).json()["id"]
    deliver(f, other, eid2)
    other.post(f"/enquiries/{eid2}/rating", json={"stars": 5})
    seller = c.get("/listings").json()[0]["farmer"]
    assert seller["rating_avg"] == 4.5 and seller["rating_count"] == 2

    reviews = c.get(f"/farmers/{farmer['id']}/ratings").json()
    assert reviews["avg"] == 4.5 and reviews["count"] == 2
    assert [(x["buyer_first_name"], x["stars"]) for x in reviews["recent"]] == [("Bina", 5), ("Asha", 4)]
    assert "phone" not in json.dumps(reviews)


def test_only_the_buyer_of_an_accepted_enquiry_can_rate():
    f, c, _, listing, eid = accepted_enquiry()
    assert f.post(f"/enquiries/{eid}/rating", json={"stars": 5}).status_code == 403  # farmers can't rate
    stranger = make_client()
    register(stranger, role="customer")
    assert stranger.post(f"/enquiries/{eid}/rating", json={"stars": 5}).status_code == 404
    for stars in (0, 6):
        assert c.post(f"/enquiries/{eid}/rating", json={"stars": stars}).status_code == 422

    pending = c.post(f"/listings/{listing['id']}/enquiries", json={"quantity": "1"}).json()["id"]
    assert c.post(f"/enquiries/{pending}/rating", json={"stars": 5}).status_code == 409
    assert c.get("/me/enquiries").json()[0]["can_rate"] is False  # newest is the pending one


def test_ratings_endpoint_only_for_farmers():
    _, c, _, _, _ = setup()
    buyer_id = c.get("/auth/me").json()["id"]
    assert c.get(f"/farmers/{buyer_id}/ratings").status_code == 404
