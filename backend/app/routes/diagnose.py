"""Diagnose route (plan 23.2). Accepts image + optional audio/text/location."""
from __future__ import annotations

import io
import json
import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.dependencies import get_optional_user, get_pipeline, get_whisper
from backend.app.schemas import DiagnoseResponse, WeatherOut
from backend.app.weather_client import get_current_weather
from backend.db.models import Diagnosis, User
from backend.db.session import get_db

router = APIRouter(tags=["diagnose"])


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose(
    image: UploadFile = File(...),
    audio: UploadFile | None = File(None),
    symptoms_text: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    pipe=Depends(get_pipeline),
):
    # ---- image validation ----
    data = await image.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image too large")
    try:
        pil = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or unreadable image")

    # ---- optional voice -> text (if no typed text) ----
    text = symptoms_text
    language = None
    if (not text) and audio is not None:
        audio_bytes = await audio.read()
        tmp = os.path.join(settings.upload_dir, f"audio_{uuid.uuid4().hex}")
        with open(tmp, "wb") as f:
            f.write(audio_bytes)
        try:
            tr = get_whisper().transcribe(tmp)
            text, language = tr["text"], tr["language"]
        except Exception:
            text = None
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    # ---- optional weather context (not a model input) ----
    weather = None
    weather_source = None
    if latitude is not None and longitude is not None:
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid coordinates")
        try:
            weather = get_current_weather(latitude, longitude)
            weather_source = "open-meteo"
        except Exception:
            weather = None  # weather failures must not break diagnosis

    # ---- persist uploaded image ----
    ext = os.path.splitext(image.filename or "")[1].lower() or ".jpg"
    img_name = f"img_{uuid.uuid4().hex}{ext}"
    img_path = os.path.join(settings.upload_dir, img_name)
    try:
        pil.save(img_path)
    except Exception:
        img_path = ""

    # ---- run model ----
    try:
        res = pipe.diagnose(pil, symptoms_text=text, weather=weather)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Model error: {e}")

    # ---- save diagnosis ----
    row = Diagnosis(
        user_id=user.id if user else None,
        image_path=img_path,
        predicted_class=res["prediction"],
        confidence=float(res["confidence"]),
        topk_json=json.dumps(res["topk"]),
        symptoms_text=text or "",
        transcription_language=language,
        temperature=(weather or {}).get("temperature"),
        humidity=(weather or {}).get("humidity"),
        rainfall=(weather or {}).get("rainfall"),
        wind_speed=(weather or {}).get("wind_speed"),
        weather_source=weather_source,
        model_version=res["model_version"],
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return DiagnoseResponse(
        prediction=res["prediction"],
        prediction_display=res["prediction_display"],
        confidence=res["confidence"],
        topk=res["topk"],
        symptoms_text=res["symptoms_text"],
        weather=WeatherOut(**weather) if weather else None,
        recommendations=res["recommendations"],
        low_confidence=res["low_confidence"],
        ood=res.get("ood", False),
        image_confidence=res.get("image_confidence"),
        message=res.get("message", ""),
        disclaimer=res.get("disclaimer", ""),
        model_version=res["model_version"],
        diagnosis_id=row.id,
    )
