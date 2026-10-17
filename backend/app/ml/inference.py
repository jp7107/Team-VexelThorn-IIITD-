"""Leaf disease inference (plan §8.3, §9.7) on the ONNX model described by model/model.json.

The model is produced by ml/export_onnx.py. `predict` never raises for bad input: it returns a status instead.
"""

import hashlib
import io
import json
import logging
import time
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter, ImageStat
from pydantic import BaseModel

from app.core.config import get_settings

log = logging.getLogger(__name__)

Status = Literal["ok", "uncertain", "unsupported", "rejected_quality", "error"]
# "mock" stays valid so analyses stored before the real model shipped can still be read.
Provenance = Literal["trained_in_house", "third_party_pretrained", "mock"]

MODEL_DIR = Path(__file__).parent / "model"
TOP_K = 3
MULTI_DISEASE_P = 0.30  # second class this likely too -> "uncertain" (plan §9.7)


class Prediction(BaseModel):
    class_code: str
    crop_code: str
    name: str
    name_hi: str
    is_healthy: bool


class TopK(BaseModel):
    class_code: str
    p: float
    # Display names are filled in from labels when the result is served (not stored).
    name: str | None = None
    name_hi: str | None = None


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


@lru_cache
def _model() -> tuple[ort.InferenceSession, dict]:
    meta = json.loads((MODEL_DIR / "model.json").read_text(encoding="utf-8"))
    onnx_bytes = (MODEL_DIR / meta["file"]).read_bytes()
    if hashlib.sha256(onnx_bytes).hexdigest() != meta["sha256"]:
        raise RuntimeError("model file does not match the sha256 in model.json")
    unknown = set(meta["classes"]) - {c["code"] for c in labels()}
    if unknown:
        raise RuntimeError(f"model classes missing from labels.json: {sorted(unknown)}")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2  # small server; matches the latency bench in ml/export_onnx.py
    return ort.InferenceSession(onnx_bytes, opts, providers=["CPUExecutionProvider"]), meta


def is_ready() -> bool:
    try:
        _model()
        return True
    except Exception:
        log.exception("disease model failed to load")
        return False


def model_info() -> ModelInfo | None:
    if not is_ready():
        return None
    meta = _model()[1]
    return ModelInfo(version=meta["version"], provenance=meta["provenance"])


def preprocess(img: Image.Image, cfg: dict) -> np.ndarray:
    """Same as torchvision's MobileNet_V2_Weights.IMAGENET1K_V2.transforms() on a PIL image:
    resize shorter side (bilinear), center crop, scale to [0, 1], normalise. Returns NCHW float32."""
    img = img.convert("RGB")
    w, h = img.size
    short, crop = cfg["resize"], cfg["crop"]
    size = (short, int(short * h / w)) if w <= h else (int(short * w / h), short)
    img = img.resize(size, Image.Resampling.BILINEAR)
    left = int(round((size[0] - crop) / 2.0))
    top = int(round((size[1] - crop) / 2.0))
    img = img.crop((left, top, left + crop, top + crop))
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - np.array(cfg["mean"], dtype=np.float32)) / np.array(cfg["std"], dtype=np.float32)
    return x.transpose(2, 0, 1)[None]


def softmax(logits: np.ndarray, temperature: float) -> np.ndarray:
    z = logits / temperature
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


def apply_policy(probs: np.ndarray, classes: list[str], crop_code: str, accept: float, floor: float
                 ) -> tuple[Status, int | None, list[tuple[str, float]]]:
    """Plan §9.7 decision on calibrated probabilities. Returns (status, predicted index, top-k)."""
    crop_of = {c["code"]: c["crop_code"] for c in labels()}
    order = np.argsort(probs)[::-1]
    top = int(order[0])
    top_k = [(classes[i], round(float(probs[i]), 4)) for i in order[:TOP_K]]
    if probs[top] < floor:
        return "unsupported", None, []  # could not identify: show no guesses
    if crop_of[classes[top]] != crop_code:  # looks like a different crop than the farmer picked
        return "uncertain", top, top_k
    if probs[top] < accept or probs[order[1]] >= MULTI_DISEASE_P:
        return "uncertain", top, top_k
    return "ok", top, top_k


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


def _prediction(code: str) -> Prediction:
    label = next(c for c in labels() if c["code"] == code)
    return Prediction(class_code=code, crop_code=label["crop_code"], name=label["name_en"],
                      name_hi=label["name_hi"], is_healthy=label["is_healthy"])


def predict(image_bytes: bytes, crop_code: str) -> InferenceResult:
    """Callers check is_ready() first; the route answers 503 when the model is unavailable."""
    s = get_settings()
    start = time.perf_counter()
    session, meta = _model()
    accept = s.CONF_ACCEPT if s.CONF_ACCEPT is not None else meta["conf_accept"]
    floor = s.CONF_FLOOR if s.CONF_FLOOR is not None else meta["conf_floor"]
    policy = Policy(accept_threshold=accept, uncertain_floor=floor)
    info = ModelInfo(version=meta["version"], provenance=meta["provenance"])

    def result(status: Status, **kw) -> InferenceResult:
        return InferenceResult(status=status, policy=policy, model=info, message_key=f"diagnosis.{status}",
                               latency_ms=round((time.perf_counter() - start) * 1000), **kw)

    if crop_code not in supported_crops():
        return result("unsupported")
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
        quality = _quality(img)
        if not quality.passed:
            return result("rejected_quality", quality=quality)
        # ponytail: no per-request timeout; CPU inference is ~tens of ms. Add one if a bigger model ships.
        logits = session.run(None, {"image": preprocess(img, meta["preprocess"])})[0][0]
        probs = softmax(logits, meta["temperature"])
        status, top, top_k = apply_policy(probs, meta["classes"], crop_code, accept, floor)
        return result(
            status, quality=quality, top_k=[TopK(class_code=c, p=p) for c, p in top_k],
            prediction=_prediction(meta["classes"][top]) if top is not None else None,
            confidence=round(float(probs[top]), 4) if top is not None else None,
        )
    except Exception:
        log.exception("inference failed")
        return result("error")
