# Handoff — feat/backend-foundation
_Last updated: 2026-10-17T22:02:38+05:30 · Tool: claude-code · Session: default_

## Active Task
Building the KisanSetu hackathon MVP (Agriculture & Rural Development) from `IMPLEMENTATION_PLAN.md`. Right now: crop condition updates (plan BE-09 rest + FE-07). The backend is done; the crop detail page in the frontend is next. Uncommitted BE-08 security work sits in the same tree.

## Current State
**Done (committed and pushed on `feat/backend-foundation`):**
- PRs #1–#3 merged into `main`. PR #4 (https://github.com/jp7107/Team-VexelThorn-IIITD-/pull/4) is OPEN with `288ebe7` (irrigation) and `22e8406` (help page + support tickets).
- Backend FastAPI app: auth/RBAC, crops/reminders, ONNX disease model (`backend/app/ml/inference.py`), LLM reports + chat on Groq (`backend/app/assistant/`), marketplace, ratings, mandi prices, content/admin, irrigation, support.
- Frontend Next.js 16 app: all farmer/buyer/admin pages, Hindi/English (`frontend/messages/*.json`).
- ML: `ml/prepare.py`, `ml/baseline_b0.py`, `ml/export_onnx.py`; B0 val macro-F1 0.921 (test split unused).

**In flight (uncommitted, all tests pass: 93):**
- BE-08 security: in-memory rate limiter `backend/app/core/ratelimit.py`, applied in `backend/app/routers/auth.py` (login per phone 5/min + per IP 20/10 min, register 10/10 min per IP), `analyses.py` (analyses 20/h, reports 30/h), `assistant.py` (chat 10/min, 100/day), `marketplace.py` (enquiries 30/h), `support.py` (tickets 5/h).
  - `AppError` now carries headers, for `Retry-After` (`backend/app/core/errors.py:30`).
  - Security headers and docs-off-in-prod in `backend/app/main.py`; no CORS middleware, by design.
  - Frontend headers in `frontend/next.config.ts`; 429 → `errors.rateLimited` in `frontend/lib/forms.ts`.
  - Tests in `backend/tests/test_security.py`; limiter reset per test in `backend/tests/conftest.py`.
  - Verified in the browser (Hindi 429 message, headers present, no `Access-Control-Allow-Origin`). Plan BE-08 marked Done; README updated.
- Crop updates backend: `GET /me/crops/{id}` (`backend/app/routers/me.py:86`), `GET/POST /me/crops/{id}/updates` (`me.py:122`, `me.py:129`), condition good/concern/bad + note ≤500. Test `test_crop_condition_updates_are_owner_only` in `backend/tests/test_auth.py`.

**Tried and rejected:**
- Native LLM function-calling for chat — replaced by a two-call plan/answer JSON flow; same whitelist guarantees, fewer provider-specific formats.
- Photos on crop updates — plan fallback taken (no photos); the diagnose flow already handles photos.
- Unverified content (Soil Health Card, PMKSY schemes; extra Kc values) — not written, because the official sites returned 403. Only verified facts are seeded.

## Next Steps
1. Create `frontend/app/farmer/crops/[id]/page.tsx`. It's a client page; wrap the `useParams` reader in `<Suspense>`, as `frontend/app/farmer/analyses/[id]/page.tsx` does, because of `cacheComponents`. It should show:
   - crop info from `GET /api/v1/me/crops/{id}`;
   - three large `ChoiceTile` buttons (good / concern / bad) with an optional note, POSTing to `/me/crops/{id}/updates`;
   - a timeline from `GET /me/crops/{id}/updates`;
   - quick reminders: POST `/me/reminders` with `{title, due_at: now+3d|+7d (ISO with tz), farm_crop_id}`;
   - this crop's open reminders (filter `GET /me/reminders` by `farm_crop_id`), with a Done button (`PATCH /me/reminders/{id} {done:true}`);
   - links to `/farmer/diagnose` and `/farmer/water`.
2. Add `CropUpdate` type to `frontend/lib/api.ts`, and strings (`crop.*`, conditions) to both `frontend/messages/en.json` and `hi.json`. Avoid setState synchronously inside `useEffect` (the lint rule `react-hooks/set-state-in-effect` fails the build).
3. In `frontend/app/farmer/page.tsx`, make each crop list item a `Link` to `/farmer/crops/{id}`.
4. Run checks (commands below). Restart the backend preview, then verify in the browser at phone width in Hindi.
5. Mark plan rows BE-09 and FE-07 as Done in `IMPLEMENTATION_PLAN.md` (task board §18).
6. Ask the user before committing. They commit with explicit messages and want **no Claude attribution** (no Co-Authored-By trailer, no "Generated with Claude Code" footer). Check `gh pr view 4 --json state` first: if PR #4 is merged, open a new PR instead of pushing to it.

## Key Decisions
- **Decision:** No CORS middleware; the browser reaches the API same-origin via the Next.js `/api` rewrite, with an httpOnly SameSite=Lax cookie · **Why:** avoids credentialed CORS and token-in-localStorage · **Alternative considered:** a CORS allow-list (more surface, no benefit).
- **Decision:** In-memory rate limiter · **Why:** single backend instance, no new dependency · **Alternative considered:** slowapi/Redis (later, when scaling out).
- **Decision:** LLM provider is Groq (`openai/gpt-oss-120b`), key only in gitignored `backend/.env` · **Why:** the user supplied a Groq key · **Alternative considered:** Gemini (planned originally).
- **Decision:** The LLM never writes diagnosis fields; evidence refs are limited to rows the tools returned; uncited doses are dropped; confidence is capped at 99% · **Why:** safety and honesty rules in plan §10–§12.
- **Decision:** Mandi prices show labelled demo rows until `DATAGOV_API_KEY` is set · **Why:** no key yet; never present fake prices as real.

## Open Questions
- [ ] User to add a free data.gov.in key (`DATAGOV_API_KEY`) to verify the live mandi API response (see `docs/DATA_SOURCES.md`).
- [ ] Rotate the Groq key after the hackathon: it was pasted in chat.
- [ ] Hindi translations of scheme text (schemes are English-only).
- [ ] Deployment (plan DEP-01..06) not started; hosting accounts (Vercel/Render/Neon) unconfirmed.
- [ ] Team member names and roles (plan D-01) still placeholders.

## Working Environment
- Branch: `feat/backend-foundation` · Base: `main`
- Commands to run:
  - DB: `docker compose up -d db`
  - Backend tests: `cd backend && .venv/Scripts/python -m pytest -q` (93 pass; offline, LLM/data.gov.in/Open-Meteo stubbed)
  - Seed: `cd backend && SEED_DEMO_PASSWORD=demo-pass-123 .venv/Scripts/python -m app.seed`
  - Frontend: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
  - Dev servers: `.claude/launch.json` defines `backend` (uvicorn :8000) and `frontend` (npm dev :3000)
  - Demo logins: admin 9000000001, farmers 9000000002/3, buyers 9000000004/5 (password `demo-pass-123`); test farmer 9811122233 / `khet-2026-pass`
- Known broken / skipped: none. Git Bash `python -c` with multi-line code breaks via the pyenv shim; use script files. Isolated mode (`-I`) ignores `PYTHONIOENCODING`, so call `sys.stdout.reconfigure(encoding="utf-8")` in scripts. `.claude/` and `.enola/` are untracked on purpose; never commit them or `backend/.env`.
- Changed files (`git diff --stat HEAD`):
  ```
   IMPLEMENTATION_PLAN.md             |  2 +-
   backend/README.md                  |  1 +
   backend/app/core/errors.py         | 10 ++++++----
   backend/app/main.py                | 33 ++++++++++++++++++++++++++++++---
   backend/app/routers/analyses.py    |  7 +++++--
   backend/app/routers/assistant.py   |  4 +++-
   backend/app/routers/auth.py        |  8 ++++++--
   backend/app/routers/marketplace.py |  4 +++-
   backend/app/routers/me.py          | 37 ++++++++++++++++++++++++++++++++++++-
   backend/app/routers/support.py     |  4 +++-
   backend/tests/conftest.py          |  2 ++
   backend/tests/test_auth.py         | 18 ++++++++++++++++++
   frontend/lib/forms.ts              |  1 +
   frontend/messages/en.json          |  3 ++-
   frontend/messages/hi.json          |  3 ++-
   frontend/next.config.ts            | 12 ++++++++++++
   16 files changed, 131 insertions(+), 18 deletions(-)
  (untracked: backend/app/core/ratelimit.py, backend/tests/test_security.py)
  ```

## Context for the next tool (3-5 sentences)
KisanSetu is a Hindi-first farmer platform: FastAPI + Postgres backend in `backend/`, Next.js 16 frontend in `frontend/` with `cacheComponents` on, and an ML pipeline in `ml/`. All work follows `IMPLEMENTATION_PLAN.md`; its task board (§18) tracks status, and every external fact must be verified from an official source, never invented. The tree holds uncommitted but tested BE-08 security work plus the crop-updates backend. The only missing piece of this task is the farmer crop detail page described in Next Steps. This handoff was written by Claude Code before a context compaction; the next session (any tool) should build that page, verify it in the browser, then ask the user before committing, with no Claude attribution in commits or PRs.
