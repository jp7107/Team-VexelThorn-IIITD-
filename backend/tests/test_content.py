from sqlalchemy import update

from app.core.db import SessionLocal
from app.models import User
from tests.conftest import make_client, register

SCHEME = {"name": "Test central scheme", "summary": "Income support.", "eligibility_text": "Landholding farmers.",
          "official_url": "https://example.gov.in/scheme", "last_verified_at": "2026-10-17", "published": True}


def admin_client():
    c = make_client()
    user = register(c, name="Asha Admin")
    with SessionLocal() as db:
        db.execute(update(User).where(User.phone == user["phone"]).values(role="admin"))
        db.commit()
    return c


def test_only_admins_write_content():
    farmer = make_client()
    register(farmer)
    for method, path, body in [("post", "/admin/schemes", SCHEME), ("post", "/admin/updates", {"title": "t", "body": "b"}),
                               ("get", "/admin/users", None), ("get", "/admin/listings", None)]:
        r = getattr(farmer, method)(path, **({"json": body} if body else {}))
        assert r.status_code == 403, path


def test_schemes_need_https_official_link_and_drafts_stay_hidden():
    a = admin_client()
    assert a.post("/admin/schemes", json={**SCHEME, "official_url": "http://example.gov.in"}).status_code == 422
    assert a.post("/admin/schemes", json={**SCHEME, "official_url": "javascript:alert(1)"}).status_code == 422
    assert a.post("/admin/schemes", json={k: v for k, v in SCHEME.items() if k != "last_verified_at"}).status_code == 422
    draft = a.post("/admin/schemes", json={**SCHEME, "name": "Draft scheme", "published": False}).json()
    live = a.post("/admin/schemes", json=SCHEME).json()

    farmer = make_client()
    register(farmer)
    assert [s["name"] for s in farmer.get("/schemes").json()] == ["Test central scheme"]
    assert farmer.get(f"/schemes/{draft['id']}").status_code == 404
    assert farmer.get(f"/schemes/{live['id']}").json()["official_url"] == "https://example.gov.in/scheme"

    assert a.patch(f"/admin/schemes/{draft['id']}", json={"published": True}).json()["published"] is True
    assert len(farmer.get("/schemes").json()) == 2
    assert a.patch(f"/admin/schemes/{live['id']}", json={"official_url": None}).status_code == 422
    assert a.delete(f"/admin/schemes/{live['id']}").status_code == 204
    assert [s["name"] for s in farmer.get("/schemes").json()] == ["Draft scheme"]


def test_scheme_state_filter_keeps_central_schemes():
    a = admin_client()
    a.post("/admin/schemes", json=SCHEME)
    a.post("/admin/schemes", json={**SCHEME, "name": "Punjab only", "states": ["Punjab"]})
    names = lambda state: sorted(s["name"] for s in a.get(f"/schemes?state={state}").json())  # noqa: E731
    assert names("Punjab") == ["Punjab only", "Test central scheme"]
    assert names("Bihar") == ["Test central scheme"]


def test_updates_publish_newest_first():
    a = admin_client()
    a.post("/admin/updates", json={"title": "First", "body": "One"})
    second = a.post("/admin/updates", json={"title": "Second", "body": "Two", "source_url": "https://example.gov.in/u"})
    assert second.status_code == 201
    farmer = make_client()
    register(farmer)
    assert [u["title"] for u in farmer.get("/updates").json()] == ["Second", "First"]
    assert a.post("/admin/updates", json={"title": "x", "body": "y", "source_url": "ftp://x"}).status_code == 422
    assert a.delete(f"/admin/updates/{second.json()['id']}").status_code == 204


def test_kb_records_who_verified_it_and_is_searchable():
    a = admin_client()
    body = {"title": "Early blight of tomato", "body": "Brown concentric rings on older leaves.", "topic": "disease",
            "language": "en", "disease_class_code": "tomato__early_blight", "crop_code": "tomato",
            "source_name": "Test extension", "source_url": "https://example.edu/early-blight"}
    created = a.post("/admin/kb", json=body).json()
    assert created["verified_by"] == "Asha Admin" and created["verified_at"]
    assert a.post("/admin/kb", json={**body, "source_url": ""}).status_code == 422

    farmer = make_client()
    register(farmer)
    assert [k["title"] for k in farmer.get("/kb?q=concentric").json()] == ["Early blight of tomato"]
    assert farmer.get("/kb?q=nothingmatches").json() == []
    edited = a.put(f"/admin/kb/{created['id']}", json={**body, "title": "Early blight (tomato)"}).json()
    assert edited["title"] == "Early blight (tomato)"
    assert a.delete(f"/admin/kb/{created['id']}").status_code == 204


def test_admin_lists_users_without_phones_and_all_listings():
    a = admin_client()
    f = make_client()
    farmer = register(f)
    lid = f.post("/listings", json={"crop_code": "tomato", "title": "T", "quantity": "1", "unit": "kg"}).json()["id"]
    users = a.get("/admin/users?role=farmer").json()
    assert [u["id"] for u in users] == [farmer["id"]] and "phone" not in users[0]
    a.patch(f"/listings/{lid}", json={"status": "hidden"})
    assert [l["id"] for l in a.get("/admin/listings?status=hidden").json()] == [lid]


def test_kb_seed_covers_every_class_and_crop_and_is_idempotent():
    from app.kb_articles import KB_ARTICLES, PRODUCTIVITY_ARTICLES
    from app.ml.inference import labels
    from app.seed import _seed_kb

    diseases = {c["code"] for c in labels() if not c["is_healthy"]}
    assert sorted(a["disease_class_code"] for a in KB_ARTICLES) == sorted(diseases)
    assert all(a["source_url"].startswith("https://") and "label" in a["body"] for a in KB_ARTICLES)
    assert sorted(a["crop_code"] for a in PRODUCTIVITY_ARTICLES) == ["maize", "potato", "tomato"]
    for _ in range(2):
        with SessionLocal() as db:
            _seed_kb(db)
            db.commit()
    farmer = make_client()
    register(farmer)
    kb = farmer.get("/kb", params={"crop_code": "maize"}).json()
    assert sorted(k["disease_class_code"] or k["topic"] for k in kb) == sorted(
        [d for d in diseases if d.startswith("maize")] + ["productivity"])
    from app.assistant.tools import SearchArgs, search_knowledge
    with SessionLocal() as db:
        disease = search_knowledge(db, None, SearchArgs(query="how to prevent grey leaf spot", crop_code="maize"), "en")
        growing = search_knowledge(db, None, SearchArgs(query="maize fertiliser and water schedule"), "en")
    assert disease and disease[0]["title"] == "Grey leaf spot of maize"
    assert growing and growing[0]["title"] == "Irrigated maize: good practices for higher yield"
