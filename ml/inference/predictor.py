"""ONNX inference interface for the PlantVillage classifier.

Designed to be wrapped by the FastAPI diagnosis route later (plan §14.3) without
imposing any API shape on it. The predictor owns:
  * one ONNX session, created once and reused
  * the same preprocessing used at training time (imported, not reimplemented)
  * the confidence policy: thresholds loaded from the artifact and versioned
  * a clean separation between *diagnosis statuses* and *infrastructure errors*

Diagnosis statuses (returned in a Prediction):
    confident | uncertain | unsupported | unsupported_crop

Infrastructure errors (raised, never mapped to a disease label):
    ModelUnavailableError  -- artifact missing / unloadable / input mismatch
    InferenceTimeoutError  -- inference exceeded the configured budget
    InvalidImageError      -- from preprocessing (IMAGE_INVALID, IMAGE_TOO_LARGE,
                              UNSUPPORTED_IMAGE_TYPE)
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort

from ml.inference.preprocessing import (
    InvalidImageError,
    PreprocessConfig,
    preprocess_bytes,
)

REQUIRED_FILES = (
    "model.onnx",
    "class_names.json",
    "model_config.json",
    "preprocessing.json",
    "confidence_thresholds.json",
    "model_card.json",
)


class ModelUnavailableError(RuntimeError):
    """Model artifact missing or cannot be loaded -> API INFERENCE_UNAVAILABLE (503)."""


class InferenceTimeoutError(RuntimeError):
    """Inference exceeded its budget -> API INFERENCE_TIMEOUT (504)."""


@dataclass
class Prediction:
    status: str
    label: str | None
    display_name: str | None
    crop: str | None
    confidence: float | None
    margin: float | None
    entropy: float | None
    top_k: list[dict]
    model_version: str
    thresholds_version: str
    latency_ms: float
    extra: dict[str, Any] = field(default_factory=dict)

    def to_api_dict(self) -> dict:
        """Shape-compatible with the DiagnosisResult.prediction block (plan §14.3).

        `prediction` is present iff status in {confident, uncertain}; `confidence`
        is always a number in [0,1] when present.
        """
        pred = None
        if self.status in ("confident", "uncertain") and self.label is not None:
            pred = {
                "label": self.label,
                "display_name": self.display_name,
                "crop": self.crop,
                "confidence": round(float(self.confidence), 4),
                "margin": round(float(self.margin), 4),
                "model_version": self.model_version,
                "thresholds_version": self.thresholds_version,
            }
        return {"status": self.status, "prediction": pred,
                "latency_ms": round(self.latency_ms, 1)}


class Predictor:
    """Loads one model folder and serves single-image predictions."""

    def __init__(self, artifact_dir: str | Path, *, intra_op_threads: int = 2,
                 timeout_s: float = 5.0):
        self.dir = Path(artifact_dir)
        self.timeout_s = timeout_s
        self._errors: list[str] = []

        for required in REQUIRED_FILES:
            if not (self.dir / required).exists():
                self._errors.append(f"missing {required}")
        if self._errors:
            raise ModelUnavailableError(
                f"artifact {self.dir} is incomplete: {', '.join(self._errors)}")

        try:
            self.class_names: list[str] = json.loads(
                (self.dir / "class_names.json").read_text(encoding="utf-8"))
            self.model_config: dict = json.loads(
                (self.dir / "model_config.json").read_text(encoding="utf-8"))
            self.pre_cfg = PreprocessConfig.from_dict(
                json.loads((self.dir / "preprocessing.json").read_text(encoding="utf-8")))
            self.thresholds: dict = json.loads(
                (self.dir / "confidence_thresholds.json").read_text(encoding="utf-8"))
            self.model_card: dict = json.loads(
                (self.dir / "model_card.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ModelUnavailableError(f"artifact unreadable: {exc}") from exc

        if not self.class_names:
            raise ModelUnavailableError("class_names.json is empty")
        if len(self.class_names) != int(self.model_config.get("num_classes", len(self.class_names))):
            raise ModelUnavailableError("class_names.json does not match num_classes")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = intra_op_threads
        opts.inter_op_num_threads = 1
        opts.log_severity_level = 3
        try:
            self.session = ort.InferenceSession(
                str(self.dir / "model.onnx"), sess_options=opts,
                providers=["CPUExecutionProvider"])
        except Exception as exc:  # ort raises many unrelated types on corrupt files
            raise ModelUnavailableError(f"ONNX session failed: {exc}") from exc

        self.input_name = self.session.get_inputs()[0].name
        shape = self.session.get_inputs()[0].shape
        if len(shape) != 4 or not isinstance(shape[1], int) or shape[1] != 3:
            raise ModelUnavailableError(f"unexpected input shape {shape}")

        self.model_version = self.model_config.get("model_version", "unknown")
        self.thresholds_version = self.thresholds.get("version", "unknown")

        crops = self.model_config.get("crops", {})
        self._crop_of: dict[str, str] = {}
        for crop, labels in crops.items():
            for lab in labels:
                self._crop_of[lab] = crop

    # ------------------------------------------------------------ helpers
    @staticmethod
    def _normalised_entropy(p: np.ndarray) -> float:
        """Entropy divided by log(K), in [0,1]. Reported for the confidence policy."""
        p = np.clip(p, 1e-12, 1.0)
        return float(-(p * np.log(p)).sum() / np.log(len(p)))

    def _status(self, p_max: float, margin: float, n_classes: int) -> str:
        t_high = float(self.thresholds.get("p_max_confident", 0.60))
        t_low = float(self.thresholds.get("p_max_unsupported", 0.35))
        t_margin = float(self.thresholds.get("margin_confident", 0.15))
        if p_max >= t_high and margin >= t_margin:
            return "confident"
        if p_max < t_low:
            return "unsupported"
        return "uncertain"

    def _display(self, label: str) -> tuple[str, str]:
        crop = label.split("___")[0]
        disease = label.split("___")[-1]
        crop_h = {"Corn_(maize)": "Maize"}.get(crop, crop.replace("_", " ").replace(",", ""))
        disease_h = disease.replace("_", " ").strip()
        return f"{crop_h} — {disease_h}", crop

    # ------------------------------------------------------------ predict
    def predict_bytes(self, data: bytes, *, crop_hint: str | None = None) -> Prediction:
        """Run inference on raw image bytes.

        Raises InvalidImageError for bad input, ModelUnavailableError if the session
        is unusable, InferenceTimeoutError if the budget is exceeded. Never returns
        a disease label for those cases.
        """
        t0 = time.perf_counter()
        x = preprocess_bytes(data, self.pre_cfg)

        if crop_hint:
            hint = crop_hint.strip().lower()
            known_crops = {c.lower() for c in self.model_config.get("crops", {})}
            if hint not in known_crops:
                return Prediction(
                    status="unsupported_crop", label=None, display_name=None, crop=None,
                    confidence=None, margin=None, entropy=None, top_k=[],
                    model_version=self.model_version,
                    thresholds_version=self.thresholds_version,
                    latency_ms=(time.perf_counter() - t0) * 1000,
                    extra={"crop_hint": crop_hint,
                           "supported_crops": sorted(known_crops)})

        try:
            logits = self.session.run(None, {self.input_name: x})[0]
        except Exception as exc:
            raise ModelUnavailableError(f"session run failed: {exc}") from exc

        elapsed = time.perf_counter() - t0
        if elapsed > self.timeout_s:
            raise InferenceTimeoutError(f"{elapsed:.2f}s exceeded {self.timeout_s}s budget")

        logits = logits[0]
        p = np.exp(logits - logits.max())
        p = p / p.sum()
        order = np.argsort(p)[::-1]
        top1, top2 = int(order[0]), int(order[1])
        p_max, p_second = float(p[top1]), float(p[top2])
        margin = p_max - p_second
        status = self._status(p_max, margin, len(p))
        label = self.class_names[top1]
        display, crop = self._display(label)
        top_k = [{"label": self.class_names[int(i)],
                  "display_name": self._display(self.class_names[int(i)])[0],
                  "probability": round(float(p[int(i)]), 4)}
                 for i in order[:3]]

        return Prediction(
            status=status, label=label, display_name=display, crop=crop,
            confidence=p_max, margin=margin,
            entropy=self._normalised_entropy(p), top_k=top_k,
            model_version=self.model_version,
            thresholds_version=self.thresholds_version,
            latency_ms=elapsed * 1000,
            extra={"image_size": self.pre_cfg.image_size})

    def predict_path(self, path: str | Path, **kwargs) -> Prediction:
        return self.predict_bytes(Path(path).read_bytes(), **kwargs)

    # ------------------------------------------------------------ health
    def health(self) -> dict:
        """Cheap liveness probe for the /health route; does not run inference."""
        sha = hashlib.sha256((self.dir / "model.onnx").read_bytes()).hexdigest()
        return {
            "loaded": True,
            "model_version": self.model_version,
            "thresholds_version": self.thresholds_version,
            "num_classes": len(self.class_names),
            "input_shape": list(self.session.get_inputs()[0].shape),
            "model_sha256": sha,
            "providers": self.session.get_providers(),
        }
