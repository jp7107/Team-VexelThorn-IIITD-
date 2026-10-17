"""Inference interface frozen in plan §8.3. M2 swaps the mock for the ONNX model (ML-03) behind `predict`.

`predict` never raises for bad input: it returns a status instead.
"""

import io
import json
import time
from functools import lru_cache
from pathlib import Path
from typing import Literal

from PIL import Image, ImageFilter, ImageStat
from pydantic import BaseModel

from app.core.config import get_settings

Status = Literal["ok", "uncertain", "unsupported", "rejected_quality", "error"]
Provenance = Literal["trained_in_house", "third_party_pretrained", "mock"]

MOCK_VERSION = "mock-0"


class Prediction(BaseModel):
    class_code: str
    crop_code: str
    name: str
    is_healthy: bool


class TopK(BaseModel):
    class_code: str
    p: float


class Quality(BaseModel):
    blur_var: float | None = None
    brightness: float | None = None
    passed: bool = True
    reasons: list[str] = []


class Policy(BaseModel):
    accept_threshold: float | None
    uncertain_floor: float | None


class ModelInfo(BaseModel):
    version: str
    provenance: Provenance


class InferenceResult(BaseModel):
    status: Status
    prediction: Prediction | None = None
    confidence: float | None = None
    top_k: list[TopK] = []
    quality: Quality = Quality()
    policy: Policy
    model: ModelInfo
    message_key: str
    latency_ms: int


@lru_cache
def labels() -> list[dict]:
    return json.loads((Path(__file__).parent / "labels.json").read_text(encoding="utf-8"))["classes"]


def supported_crops() -> set[str]:
    return {c["crop_code"] for c in labels()}


def model_info() -> ModelInfo:
    return ModelInfo(version=MOCK_VERSION, provenance="mock")


def is_ready() -> bool:
    return True  # The mock is always loaded; the ONNX path will report real load state.


def _quality(img: Image.Image) -> Quality:
    s = get_settings()
    gray = img.convert("L")
    gray.thumbnail((512, 512))
    brightness = ImageStat.Stat(gray).mean[0] / 255
    # Variance of a Laplacian-filtered image: low variance means few edges, i.e. blur.
    lap = gray.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128))
    blur_var = ImageStat.Stat(lap).var[0]
    reasons = []
    if s.BLUR_MIN is not None and blur_var < s.BLUR_MIN:
        reasons.append("blurry")
    if s.BRIGHT_MIN is not None and brightness < s.BRIGHT_MIN:
        reasons.append("too_dark")
    if s.BRIGHT_MAX is not None and brightness > s.BRIGHT_MAX:
        reasons.append("too_bright")
    return Quality(blur_var=round(blur_var, 2), brightness=round(brightness, 3), passed=not reasons,
                   reasons=reasons)


def _prediction(label: dict) -> Prediction:
    return Prediction(class_code=label["code"], crop_code=label["crop_code"], name=label["name_en"],
                      is_healthy=label["is_healthy"])


def _mock_classify(crop_code: str) -> tuple[Status, Prediction | None, float | None, list[TopK]]:
    """Returns the status forced by MOCK_STATUS so the UI can exercise every state."""
    status = get_settings().MOCK_STATUS
    crop_labels = [c for c in labels() if c["crop_code"] == crop_code]
    sick = [c for c in crop_labels if not c["is_healthy"]]
    if status == "ok":
        return status, _prediction(sick[0]), 0.9, [TopK(class_code=sick[0]["code"], p=0.9)]
    if status == "uncertain":
        top = [TopK(class_code=sick[0]["code"], p=0.45), TopK(class_code=sick[1]["code"], p=0.4)]
        return status, _prediction(sick[0]), 0.45, top
    return status, None, None, []


def predict(image_bytes: bytes, crop_code: str) -> InferenceResult:
    s = get_settings()
    start = time.perf_counter()
    policy = Policy(accept_threshold=s.CONF_ACCEPT, uncertain_floor=s.CONF_FLOOR)

    def result(status: Status, **kw) -> InferenceResult:
        return InferenceResult(status=status, policy=policy, model=model_info(), message_key=f"diagnosis.{status}",
                               latency_ms=round((time.perf_counter() - start) * 1000), **kw)

    if crop_code not in supported_crops():
        return result("unsupported")
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
        quality = _quality(img)
        if not quality.passed:
            return result("rejected_quality", quality=quality)
        status, prediction, confidence, top_k = _mock_classify(crop_code)
        if status == "rejected_quality":
            quality = Quality(blur_var=quality.blur_var, brightness=quality.brightness, passed=False,
                              reasons=["mock_forced"])
        return result(status, prediction=prediction, confidence=confidence, top_k=top_k, quality=quality)
    except Exception:
        return result("error")
