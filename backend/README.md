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
- `POST /analyses/{id}/report` builds the farmer report once per language. With no `LLM_API_KEY`/`LLM_MODEL` it uses the templates in `app/assistant/templates/` (plan Path F). Set both to use Groq. `LLM_FORCE_FAIL=true` demos the fallback.
- `POST /assistant/chat` (any role): `{messages: [...last 10], language, analysis_id?}`. The LLM picks from six read-only tools in `app/assistant/tools.py`; the server validates and scopes each call to the logged-in user. Without an LLM, a keyword router answers from records. Each turn writes an `assistant_audit` row with no message content.
- Marketplace: `GET/POST /listings`, `GET/PATCH /listings/{id}`, `GET /me/listings`, `POST /listings/{id}/enquiries`, `GET /me/enquiries`, `PATCH /enquiries/{id}`. The farmer's phone appears only in the buyer's accepted enquiry. Admins can only hide or unhide listings. Ratings: `POST /enquiries/{id}/rating` (buyer, accepted enquiry, once) and `GET /farmers/{id}/ratings`. The seed adds three `[DEMO]` listings.
- `GET /market/prices?commodity=Tomato&state=…`: data.gov.in prices when `DATAGOV_API_KEY` is set, cached rows on failure, labelled demo rows otherwise (see `docs/DATA_SOURCES.md`).
- Content: `GET /schemes`, `/schemes/{id}`, `/updates`, `/kb?q=` for everyone; `/admin/schemes|updates|kb` (admin) for writes, `/admin/users` and `/admin/listings` for moderation. Scheme and KB links must be https. The seed adds three schemes written from their official pages (checked 2026-10-17).
- `GET /irrigation/estimate?farm_crop_id=…&lat=&lon=`: FAO-56 crop water need (Kc from Table 12) × Open-Meteo ET₀, minus 80% of forecast rain, over 7 days. Location comes from the query or the profile, rounded to 2 decimals. Always labelled an estimate.
- Support: `POST /support/tickets`, `GET /me/support/tickets`; admins use `GET/PATCH /admin/support/tickets` (shows the caller's phone for call-backs).
- Schema changes go through a new Alembic migration (`alembic revision --autogenerate`), never by editing `0001`.
