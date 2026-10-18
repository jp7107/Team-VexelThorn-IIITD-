# PlantVillage model v1 — handoff

This is the ML-only deliverable from the `feat/ml-plantvillage-v1` branch. It
does not touch the backend, frontend, marketplace or LLM work.

## What you receive

```
ml/artifacts/plantvillage_model_v1/
├── model.onnx
├── class_names.json
├── model_config.json
├── preprocessing.json
├── confidence_thresholds.json
├── model_card.json
├── SHA256SUMS.txt
├── README.md
└── export_report.json
```

The sibling archive `plantvillage_model_v1.zip` is a portable copy of the same folder.

## Integration into FastAPI

The predictor is deliberately framework-agnostic. Create it once at application
startup and reuse the ONNX session; do not construct it per request.

```python
from ml.inference.predictor import Predictor, ModelUnavailableError, InferenceTimeoutError
from ml.inference.preprocessing import InvalidImageError

# create once, e.g. in app lifespan startup
predictor = Predictor(
    "ml/artifacts/plantvillage_model_v1",
    intra_op_threads=2,
    timeout_s=5.0,
)

@app.post("/diagnoses")
async def diagnose(file: UploadFile, crop_hint: str | None = None):
    data = await file.read()
    try:
        result = predictor.predict_bytes(data, crop_hint=crop_hint)
    except InvalidImageError as exc:
        # exc.code is one of IMAGE_INVALID / IMAGE_TOO_LARGE / UNSUPPORTED_IMAGE_TYPE
        return JSONResponse({"error": exc.code}, status_code=415 if "TYPE" in exc.code else 422)
    except InferenceTimeoutError:
        return JSONResponse({"error": "INFERENCE_TIMEOUT"}, status_code=504)
    except ModelUnavailableError:
        return JSONResponse({"error": "INFERENCE_UNAVAILABLE"}, status_code=503)
    return result.to_api_dict()          # matches plan §14.3 DiagnosisResult.prediction
```

### Status semantics

| status | meaning | `prediction` present |
|---|---|---|
| `confident` | p_max and margin both above validation-tuned thresholds | yes |
| `uncertain` | model made a call but not confidently | yes |
| `unsupported` | p_max below the floor; no disease label should be shown | no |
| `unsupported_crop` | a crop hint was given that the model does not cover | no |

Infrastructure failures never come back as a status: they raise and map to the
HTTP error codes listed above. That is intentional — the plan forbids returning a
diagnosis when inference did not actually happen.

## Health check

```python
predictor.health()
# {'loaded': True, 'model_version': 'mobilenet_v2-v1', 'num_classes': 38,
#  'model_sha256': '...', 'input_shape': [1, 3, 192, 192], ...}
```

Use it for the `/health` route. It does not run inference but it does hash and
read the model file, so call it sparingly and cache the result.

## Contract notes for the backend owner

- Input tensor: `float32`, NCHW, `[1, 3, H, W]`, ImageNet mean/std, RGB.
- Output: raw logits, shape `[N, 38]`. Apply softmax; the temperature is in
  `confidence_thresholds.json`.
- Class order is frozen in `class_names.json`; index → label must never be re-sorted.
- Everything the predictor needs is inside the artifact folder. Copy that folder
  as a unit.

## What was NOT done

- No trained model is integrated into the backend in this branch.
- No OOD detector was validated.
- No field-condition evaluation exists; see `ml/reports/limitations.md`.
