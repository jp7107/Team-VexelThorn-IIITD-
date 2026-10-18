"""Local prediction service so the Next.js frontend can exercise the model.

This is a *development harness*, not the product backend. It wraps Predictor in
the smallest possible HTTP surface and enables CORS for the Next dev server.

    uvicorn ml.serve:app --host 127.0.0.1 --port 8000

Then from the frontend:  POST http://127.0.0.1:8000/api/predict  (multipart, field "file")

The response is exactly Predictor.to_api_dict() plus a few convenience fields.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ml.inference.predictor import (
    InferenceTimeoutError,
    ModelUnavailableError,
    Predictor,
)
from ml.inference.preprocessing import InvalidImageError

ARTIFACT = Path(os.environ.get("ML_ARTIFACT_DIR", "ml/artifacts/plantvillage_model_v1"))

app = FastAPI(title="PlantVillage inference (dev)", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_predictor: Predictor | None = None
_load_error: str | None = None


@app.on_event("startup")
def _load() -> None:
    global _predictor, _load_error
    try:
        _predictor = Predictor(ARTIFACT, intra_op_threads=2, timeout_s=5.0)
    except ModelUnavailableError as exc:
        _load_error = str(exc)
        _predictor = None


@app.get("/health")
def health():
    if _predictor is None:
        return JSONResponse({"loaded": False, "error": _load_error}, status_code=503)
    return _predictor.health()


@app.post("/api/predict")
async def predict(file: UploadFile = File(...), crop_hint: str | None = Form(None)):
    if _predictor is None:
        raise HTTPException(503, detail=f"model unavailable: {_load_error}")
    data = await file.read()
    try:
        result = _predictor.predict_bytes(data, crop_hint=crop_hint)
    except InvalidImageError as exc:
        code = 415 if "TYPE" in exc.code else 422
        raise HTTPException(code, detail=f"{exc.code}: {exc.detail}") from exc
    except InferenceTimeoutError as exc:
        raise HTTPException(504, detail="INFERENCE_TIMEOUT") from exc
    except ModelUnavailableError as exc:
        raise HTTPException(503, detail="INFERENCE_UNAVAILABLE") from exc

    payload = result.to_api_dict()
    payload["top_k"] = result.top_k
    payload["crop"] = result.crop
    return payload
