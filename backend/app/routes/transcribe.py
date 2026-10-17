"""Transcription route (plan 23.3)."""
from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from backend.app.config import settings
from backend.app.dependencies import get_whisper
from backend.app.schemas import TranscribeResponse

router = APIRouter(tags=["transcribe"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Empty audio")
    os.makedirs(settings.upload_dir, exist_ok=True)
    tmp = os.path.join(settings.upload_dir, f"audio_{uuid.uuid4().hex}")
    with open(tmp, "wb") as f:
        f.write(data)
    try:
        tr = get_whisper().transcribe(tmp)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"ASR error: {e}")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    return TranscribeResponse(**tr)
