import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from sqlalchemy import select

from app.core.db import SessionLocal
from app.ml import inference
from app.models import Image as StoredImage
from tests.conftest import jpeg_bytes, make_client

FIXTURES = Path(__file__).parent / "fixtures"
META = json.loads((inference.MODEL_DIR / "model.json").read_text(encoding="utf-8"))


def upload(client, data: bytes, crop_code="tomato", name="leaf.jpg", mime="image/jpeg"):
    return client.post("/analyses", data={"crop_code": crop_code}, files={"image": (name, data, mime)})


def test_real_model_identifies_tomato_early_blight(farmer_client):
    r = upload(farmer_client, (FIXTURES / "tomato__early_blight.jpg").read_bytes())
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["status"] == "ok"
    assert a["prediction"]["class_code"] == "tomato__early_blight"
    assert a["prediction"]["name_hi"]
    assert a["confidence"] >= META["conf_accept"]
    assert a["model"] == {"version": META["version"], "provenance": "trained_in_house"}
    assert a["policy"] == {"accept_threshold": META["conf_accept"], "uncertain_floor": META["conf_floor"]}
    assert a["top_k"][0]["class_code"] == "tomato__early_blight" and a["top_k"][0]["name"]
    assert farmer_client.get(f"/analyses/{a['id']}").json() == a
    assert [x["id"] for x in farmer_client.get("/me/analyses").json()] == [a["id"]]
    reminders = farmer_client.get("/me/reminders").json()
    assert len(reminders) == 1 and reminders[0]["source"] == "system"


def test_real_model_identifies_maize_common_rust(farmer_client):
    a = upload(farmer_client, (FIXTURES / "maize__common_rust.jpg").read_bytes(), crop_code="maize").json()
    assert a["status"] == "ok" and a["prediction"]["class_code"] == "maize__common_rust"


def test_crop_mismatch_is_uncertain(farmer_client):
    # A maize leaf submitted as tomato must not come back as a confident tomato diagnosis.
    a = upload(farmer_client, (FIXTURES / "maize__common_rust.jpg").read_bytes(), crop_code="tomato").json()
    assert a["status"] == "uncertain"
    assert a["prediction"]["crop_code"] == "maize"


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


def test_quality_gate_uses_configured_thresholds(farmer_client, settings):
    settings.BRIGHT_MIN = 0.5
    a = upload(farmer_client, jpeg_bytes(color=(5, 5, 5))).json()
    assert a["status"] == "rejected_quality"
    assert a["quality"]["reasons"] == ["too_dark"]


def test_model_unavailable_returns_503_and_rest_of_api_works(farmer_client, monkeypatch):
    def broken():
        raise RuntimeError("model file missing")

    monkeypatch.setattr(inference, "_model", broken)
    r = upload(farmer_client, jpeg_bytes())
    assert r.status_code == 503 and r.json()["error"]["code"] == "UNAVAILABLE"
    assert make_client().get("/readyz").json()["model"] == {"loaded": False}
    assert farmer_client.get("/me/crops").status_code == 200


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


def test_readyz_reports_real_model():
    r = make_client().get("/readyz").json()
    assert r["db"] == "ok"
    assert r["model"] == {"loaded": True, "version": META["version"], "provenance": "trained_in_house"}


# --- confidence policy (plan §9.7), on synthetic probabilities ---

CLASSES = ["tomato__early_blight", "tomato__late_blight", "tomato__healthy", "maize__common_rust"]


def probs(*values):
    return np.array(values, dtype=np.float32)


def test_policy_confident_matching_crop_is_ok():
    status, top, top_k = inference.apply_policy(probs(0.9, 0.05, 0.03, 0.02), CLASSES, "tomato", 0.5, 0.3)
    assert (status, top) == ("ok", 0) and top_k[0] == ("tomato__early_blight", 0.9)


def test_policy_low_confidence_is_uncertain():
    assert inference.apply_policy(probs(0.45, 0.25, 0.2, 0.1), CLASSES, "tomato", 0.5, 0.3)[0] == "uncertain"


def test_policy_two_likely_diseases_is_uncertain():
    assert inference.apply_policy(probs(0.6, 0.35, 0.03, 0.02), CLASSES, "tomato", 0.5, 0.3)[0] == "uncertain"


def test_policy_other_crop_is_uncertain():
    assert inference.apply_policy(probs(0.05, 0.03, 0.02, 0.9), CLASSES, "tomato", 0.5, 0.3)[0] == "uncertain"


def test_policy_below_floor_shows_no_guesses():
    assert inference.apply_policy(probs(0.28, 0.27, 0.25, 0.2), CLASSES, "tomato", 0.5, 0.3) == ("unsupported", None, [])


def test_preprocess_shape_and_normalisation():
    x = inference.preprocess(Image.new("RGB", (300, 200), (124, 116, 104)), META["preprocess"])
    assert x.shape == (1, 3, 224, 224) and x.dtype == np.float32
    assert np.abs(x).max() < 0.01  # the ImageNet mean colour normalises to ~0
