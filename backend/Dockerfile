# Backend API image (CPU inference) — plan section 28
FROM python:3.11-slim

WORKDIR /app

# OpenCV / Pillow runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code + trained artifacts (models are packaged, NOT retrained at start)
COPY ml ./ml
COPY backend ./backend
COPY configs ./configs
COPY artifacts ./artifacts
COPY data/prototypes ./data/prototypes

ENV COTTON_DEVICE=cpu \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
