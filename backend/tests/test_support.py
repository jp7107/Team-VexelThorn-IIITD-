from sqlalchemy import update

from app.core.db import SessionLocal
from app.models import User
from tests.conftest import make_client, register


def test_users_raise_tickets_and_only_see_their_own():
    a, b = make_client(), make_client()
    register(a)
    register(b, role="customer")
    r = a.post("/support/tickets", json={"subject": "  Can't upload photo ", "message": "The camera button does nothing."})
    assert r.status_code == 201 and r.json()["subject"] == "Can't upload photo" and r.json()["status"] == "open"
    assert a.post("/support/tickets", json={"subject": "", "message": "x"}).status_code == 422
    assert [t["subject"] for t in a.get("/me/support/tickets").json()] == ["Can't upload photo"]
    assert b.get("/me/support/tickets").json() == []
    assert make_client().post("/support/tickets", json={"subject": "s", "message": "m"}).status_code == 401


def test_admin_sees_caller_details_and_closes_tickets():
    farmer = make_client()
    user = register(farmer, name="Ramesh Kumar")
    tid = farmer.post("/support/tickets", json={"subject": "Help", "message": "Please call me"}).json()["id"]
    assert farmer.get("/admin/support/tickets").status_code == 403
    assert farmer.patch(f"/admin/support/tickets/{tid}", json={"status": "closed"}).status_code == 403

    admin = make_client()
    a = register(admin)
    with SessionLocal() as db:
        db.execute(update(User).where(User.phone == a["phone"]).values(role="admin"))
        db.commit()
    rows = admin.get("/admin/support/tickets?status=open").json()
    assert rows[0]["user_name"] == "Ramesh Kumar" and rows[0]["user_phone"] == user["phone"]
    assert admin.patch(f"/admin/support/tickets/{tid}", json={"status": "closed"}).json()["status"] == "closed"
    assert admin.get("/admin/support/tickets?status=open").json() == []
    assert farmer.get("/me/support/tickets").json()[0]["status"] == "closed"
