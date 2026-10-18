"""Tests for preprocessing and the ONNX predictor.

These run against the packaged artifact. If the artifact is absent the predictor
tests are skipped with an explicit reason rather than passing silently.

    pytest ml/tests -q
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.inference.preprocessing import (  # noqa: E402
    InvalidImageError, PreprocessConfig, open_image, preprocess_bytes, resize_and_crop,
)

ARTIFACT = ROOT / "ml" / "artifacts" / "plantvillage_model_v1"


# ---------------------------------------------------------------- fixtures
def _jpeg_bytes(size=(320, 240), color=(40, 120, 60)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


@pytest.fixture(scope="module")
def cfg() -> PreprocessConfig:
    return PreprocessConfig(image_size=192)


@pytest.fixture(scope="module")
def predictor():
    pytest.importorskip("onnxruntime")
    if not (ARTIFACT / "model.onnx").exists():
        pytest.skip("artifact not packaged yet")
    from ml.inference.predictor import Predictor
    return Predictor(ARTIFACT)


# ---------------------------------------------------------------- preprocessing
def test_magic_bytes_reject_text(cfg):
    with pytest.raises(InvalidImageError) as ei:
        open_image(b"not an image at all", cfg)
    assert ei.value.code == "UNSUPPORTED_IMAGE_TYPE"


def test_empty_payload_rejected(cfg):
    with pytest.raises(InvalidImageError) as ei:
        open_image(b"", cfg)
    assert ei.value.code == "IMAGE_INVALID"


def test_too_large_rejected(cfg):
    big = b"\xff\xd8\xff" + b"\x00" * (cfg.max_bytes + 1)
    with pytest.raises(InvalidImageError) as ei:
        open_image(big, cfg)
    assert ei.value.code == "IMAGE_TOO_LARGE"


def test_too_small_rejected(cfg):
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 10, 10)).save(buf, format="PNG")
    with pytest.raises(InvalidImageError) as ei:
        open_image(buf.getvalue(), cfg)
    assert ei.value.code == "IMAGE_INVALID"


def test_rgba_flattened_to_rgb(cfg):
    buf = io.BytesIO()
    Image.new("RGBA", (200, 200), (255, 0, 0, 0)).save(buf, format="PNG")
    im = open_image(buf.getvalue(), cfg)
    assert im.mode == "RGB"
    assert im.size == (200, 200)


def test_greyscale_promoted(cfg):
    buf = io.BytesIO()
    Image.new("L", (200, 200), 128).save(buf, format="PNG")
    assert open_image(buf.getvalue(), cfg).mode == "RGB"


def test_resize_crop_is_square(cfg):
    im = Image.new("RGB", (640, 360), (0, 90, 0))
    out = resize_and_crop(im, 192)
    assert out.size == (192, 192)


def test_preprocess_shape_and_range(cfg):
    x = preprocess_bytes(_jpeg_bytes(), cfg)
    assert x.shape == (1, 3, 192, 192)
    assert x.dtype == np.float32
    # normalised ImageNet data should not be in [0,1] anymore
    assert x.min() < 0 or x.max() > 1


def test_exif_orientation_applied(cfg):
    """A rotated EXIF tag must be honoured, so a landscape phone photo stays upright."""
    im = Image.new("RGB", (400, 200), (0, 0, 255))
    exif = im.getexif()
    exif[274] = 6  # rotate 90° CW on display
    buf = io.BytesIO()
    im.save(buf, format="JPEG", exif=exif)
    out = open_image(buf.getvalue(), cfg)
    assert out.size == (200, 400), "EXIF transpose not applied"


# ---------------------------------------------------------------- predictor
def test_artifact_has_required_files(predictor):
    from ml.inference.predictor import REQUIRED_FILES
    for f in REQUIRED_FILES:
        assert (ARTIFACT / f).exists(), f"missing {f}"


def test_valid_image_prediction_schema(predictor):
    p = predictor.predict_bytes(_jpeg_bytes())
    assert p.status in {"confident", "uncertain", "unsupported"}
    assert 0.0 <= p.confidence <= 1.0
    assert len(p.top_k) == 3
    d = p.to_api_dict()
    assert set(d) >= {"status", "prediction"}
    if d["status"] in ("confident", "uncertain"):
        assert d["prediction"] is not None
        assert 0.0 <= d["prediction"]["confidence"] <= 1.0
    else:
        assert d["prediction"] is None


def test_class_mapping_stable(predictor):
    names = json.loads((ARTIFACT / "class_names.json").read_text(encoding="utf-8"))
    assert len(names) == len(predictor.class_names) == 38
    assert len(set(names)) == 38


def test_unsupported_crop(predictor):
    p = predictor.predict_bytes(_jpeg_bytes(), crop_hint="banana")
    assert p.status == "unsupported_crop"
    assert p.label is None
    assert p.to_api_dict()["prediction"] is None


def test_invalid_image_raises_not_predicts(predictor):
    with pytest.raises(InvalidImageError):
        predictor.predict_bytes(b"garbage" * 20)


def test_missing_artifact_raises(tmp_path):
    from ml.inference.predictor import ModelUnavailableError, Predictor
    with pytest.raises(ModelUnavailableError):
        Predictor(tmp_path)


def test_partial_artifact_raises(tmp_path):
    from ml.inference.predictor import ModelUnavailableError, Predictor
    (tmp_path / "class_names.json").write_text("[]", encoding="utf-8")
    with pytest.raises(ModelUnavailableError) as ei:
        Predictor(tmp_path)
    assert "incomplete" in str(ei.value)
