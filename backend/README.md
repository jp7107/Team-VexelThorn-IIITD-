# Backend (FastAPI)

Implements plan tasks S-02 (partial), BE-01–BE-05: schema for every table in plan §7, auth with role checks, profile/crops/reminders, and `/analyses` running the B0 disease model (ONNX, CPU) from `app/ml/model/`.

## Run locally

From the repo root:

```bash
docker compose up -d db
```

From `backend/`:

```bash
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
```
```bash
cp .env.example .env
```
```bash
.venv/Scripts/alembic upgrade head
```
```bash
SEED_DEMO_PASSWORD=pick-a-password .venv/Scripts/python -m app.seed
```
```bash
.venv/Scripts/uvicorn app.main:app --reload
```

API docs: http://localhost:8000/api/docs. Demo accounts (password = `SEED_DEMO_PASSWORD`): admin `9000000001`, farmers `9000000002`/`9000000003`, retail buyer `9000000004`, wholesaler `9000000005`. (On macOS/Linux use `.venv/bin/` instead of `.venv/Scripts/`.)

## Tests

Needs the Docker Postgres running. Tests create and migrate a separate `kisan_test` database.

```bash
.venv/Scripts/python -m pytest -q
```

## Notes for the frontend

- Auth is an httpOnly `session` cookie, so call the API same-origin through the Next.js `/api` rewrite (plan T-6).
- Every error is `{"error": {"code", "message", "details", "request_id"}}`.
- `/analyses` runs the model in `app/ml/model/` (exported by `ml/export_onnx.py`; thresholds and temperature live in `model.json`). To see `rejected_quality`, set `BRIGHT_MIN=0.5` and upload a dark photo. To see `uncertain`, upload a leaf under a different crop.
- Schema changes go through a new Alembic migration (`alembic revision --autogenerate`), never by editing `0001`.
