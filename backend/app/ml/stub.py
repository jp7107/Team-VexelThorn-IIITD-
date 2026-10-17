"""Stub inference adapter — contract testing only.

THIS IS NOT A MODEL. It returns deterministic outputs so the API contract and
the confidence-state handling can be built and tested before ML exists
(IMPLEMENTATION_PLAN.md §14.3, §8.6). Every response is labelled with
`model_version="stub-0.0.0"` and the API exposes `model: "stub"` on /healthz.

Selection rule (intentionally dumb, so tests are deterministic):
  1. crop_hint not in SUPPORTED_CROPS  -> unsupported_crop, no label
  2. image_key contains "uncertain"    -> uncertain (low p_max), label retained
  3. image_key contains "unsupported"  -> unsupported, no label
  4. otherwise                         -> confident, the documented demo label

Removal criteria: deleted in the ML phase (plan ML-06) when the real ONNX
adapter is wired; the contract it satisfies must not change.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import get_settings

MODEL_VERSION = "stub-0.0.0"
THRESHOLDS_VERSION = "policy-v1"

# Educational subset only. The real 38-class list is produced in the ML phase
# (plan §8.3, D-03); nothing here claims to be that list.
SUPPORTED_CROPS = ("tomato", "potato", "maize", "pepper")

_DEMO_PREDICTION = {
    "label": "Tomato___Early_blight",
    "display_name": "Tomato — early blight",
    "crop": "tomato",
}


@dataclass(frozen=True)
class InferenceOutput:
    status: str
    label: str | None
    display_name: str | None
    crop: str | None
    p_max: float | None
    margin: float | None
    model_version: str = MODEL_VERSION
    thresholds_version: str = THRESHOLDS_VERSION

    def has_prediction(self) -> bool:
        return self.status in ("confident", "uncertain")


def infer_stub(image_key: str, crop_hint: str | None) -> InferenceOutput:
    settings = get_settings()

    hint = (crop_hint or "").strip().lower()
    if hint and hint not in SUPPORTED_CROPS:
        return InferenceOutput(
            status="unsupported_crop", label=None, display_name=None, crop=hint, p_max=None, margin=None
        )

    key = image_key.lower()
    if "uncertain" in key:
        return InferenceOutput(
            status="uncertain",
            label=_DEMO_PREDICTION["label"],
            display_name=_DEMO_PREDICTION["display_name"],
            crop=_DEMO_PREDICTION["crop"],
            p_max=max(0.0, settings.ml_low_p_max),
            margin=0.05,
        )
    if "unsupported" in key:
        return InferenceOutput(
            status="unsupported", label=None, display_name=None, crop=hint or None, p_max=None, margin=None
        )

    return InferenceOutput(
        status="confident",
        label=_DEMO_PREDICTION["label"],
        display_name=_DEMO_PREDICTION["display_name"],
        crop=_DEMO_PREDICTION["crop"],
        p_max=0.87,
        margin=0.62,
    )
