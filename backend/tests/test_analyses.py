import io

from PIL import Image
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Image as StoredImage
from tests.conftest import jpeg_bytes, make_client


def upload(client, data: bytes, crop_code="tomato", name="leaf.jpg", mime="image/jpeg"):
    return client.post("/analyses", data={"crop_code": crop_code}, files={"image": (name, data, mime)})


def test_ok_result_matches_contract_and_is_labelled_mock(farmer_client):
    r = upload(farmer_client, jpeg_bytes())
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["status"] == "ok"
    assert a["prediction"]["crop_code"] == "tomato" and a["prediction"]["is_healthy"] is False
    assert a["prediction"]["name_hi"]  # Hindi name travels with the result
    assert a["model"] == {"version": "mock-0", "provenance": "mock"}
    assert a["message_key"] == "diagnosis.ok"
    assert a["quality"]["passed"] is True and a["quality"]["brightness"] is not None
    assert farmer_client.get(f"/analyses/{a['id']}").json() == a
    assert [x["id"] for x in farmer_client.get("/me/analyses").json()] == [a["id"]]
    reminders = farmer_client.get("/me/reminders").json()
    assert len(reminders) == 1 and reminders[0]["source"] == "system"


def test_exif_is_stripped_and_orientation_applied(farmer_client):
    exif = Image.Exif()
    exif[0x010F] = "TestPhoneMaker"  # Make
    exif[0x0112] = 6                 # Orientation: rotate 90° clockwise
    r = upload(farmer_client, jpeg_bytes(size=(80, 40), exif=exif.tobytes()))
    assert r.status_code == 201
    with SessionLocal() as db:
        stored = db.scalars(select(StoredImage)).one()
    img = Image.open(io.BytesIO(stored.data))
    assert img.format == "JPEG"
    assert dict(img.getexif()) == {}
    assert img.size == (40, 80)


def test_unsupported_crop(farmer_client):
    a = upload(farmer_client, jpeg_bytes(), crop_code="rice").json()
    assert a["status"] == "unsupported" and a["prediction"] is None
    assert farmer_client.get("/me/reminders").json() == []


def test_uncertain_shows_possibilities_and_creates_recheck(farmer_client, settings):
    settings.MOCK_STATUS = "uncertain"
    a = upload(farmer_client, jpeg_bytes(), crop_code="potato").json()
    assert a["status"] == "uncertain"
    assert len(a["top_k"]) == 2
    assert all(t["name"] and t["name_hi"] for t in a["top_k"])
    assert len(farmer_client.get("/me/reminders").json()) == 1


def test_quality_gate_uses_configured_thresholds(farmer_client, settings):
    settings.BRIGHT_MIN = 0.5
    a = upload(farmer_client, jpeg_bytes(color=(5, 5, 5))).json()
    assert a["status"] == "rejected_quality"
    assert a["quality"]["reasons"] == ["too_dark"]


def test_rejects_non_images_and_oversized_uploads(farmer_client):
    assert upload(farmer_client, b"MZ\x90\x00 definitely not an image", name="leaf.jpg").status_code == 415
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, "GIF")
    assert upload(farmer_client, gif.getvalue(), name="leaf.gif", mime="image/gif").status_code == 415
    too_big = jpeg_bytes() + b"\0" * (5 * 1024 * 1024)
    r = upload(farmer_client, too_big)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_rejects_huge_dimensions(farmer_client):
    out = io.BytesIO()
    Image.new("RGB", (5000, 10)).save(out, "PNG")
    assert upload(farmer_client, out.getvalue(), name="leaf.png", mime="image/png").status_code == 413


def test_readyz_reports_mock_model():
    r = make_client().get("/readyz").json()
    assert r["db"] == "ok"
    assert r["model"] == {"loaded": True, "version": "mock-0", "provenance": "mock"}
