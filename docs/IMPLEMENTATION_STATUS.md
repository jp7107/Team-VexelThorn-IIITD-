# Implementation Status

**Single source of truth for phase progress.** Updated at the end of every phase, before the phase report is delivered. If context is lost, read this file and `IMPLEMENTATION_PLAN.md` before touching code.

| Field | Value |
|---|---|
| Current phase | **P0 — Bootstrap and project setup: complete, awaiting owner review** |
| Last updated | 2026-10-17 |
| Repository | `github.com/jp7107/Team-VexelThorn-IIITD-`, branch `main` |
| Working-tree state | Additive changes only, **uncommitted** (owner has not authorized a commit) |
| Test baseline | No regression suite exists (documents-only repository before P0) |

---

## Phase log

### P0 — Bootstrap and project setup — ✅ COMPLETE (pending review)

**Scope executed:** repository audit, `.gitignore`, `.env.example`, three documents, frontend foundation (Next.js 15 App Router, JSX, Tailwind v4, EN/HI i18n), local 360 px verification.

**Deliverables**

| Deliverable | Path | State |
|---|---|---|
| OS / secret / build ignores | `.gitignore` | Done |
| Environment template (names + placeholders only) | `.env.example`, `web/.env.local.example` | Done |
| Verified baseline audit | `docs/REPOSITORY_AUDIT.md` | Done |
| Approved decisions + open questions | `docs/ASSUMPTIONS.yaml` | Done |
| This status file | `docs/IMPLEMENTATION_STATUS.md` | Done |
| Frontend scaffold | `web/` (package.json, configs, app shell, components, i18n) | Done |
| Design tokens (colour, type, spacing, 44 px target, dark mode) | `web/app/globals.css` | Done |
| EN + HI dictionaries (complete for P0 strings) | `web/i18n/dictionaries.json` | Done |
| 360 px evidence | `docs/screens/p0-landing-360-{hi,en}.png` | Done |

**Commands run and actual results**

| # | Command | Result |
|---|---|---|
| 1 | `git status --short`, `git log --oneline --all`, `git ls-tree -r <branch>` ×6 | 2 commits; all 6 remote branches at `5729bbc`, documents only |
| 2 | `pg_isready` / `lsof -iTCP:5432` / `brew services list` | Postgres 17.10 accepting connections; `postgresql@16` in error state (pre-existing, untouched) |
| 3 | `curl registry.npmjs.org` | HTTP 200 |
| 4 | `npm install` (in `web/`) | 42 packages added; **2 advisories** (see Known defects) |
| 5 | `npm run build` | ✅ Compiled; 4 static pages; `/` First Load JS 106 kB |
| 6 | `npm run dev` + `curl /` | HTTP 200 in ~2 s |
| 7 | Playwright (system Chrome, viewport 360×800, production build) | Hindi default; `innerWidth=360`, `scrollWidth=360`; H1 at x=16 w=328; language toggle works; persists as `en` after reload; CTA targets 44 px tall |
| 8 | `npm run start` (production) | HTTP 200, ready in 239 ms |
| 9 | `git check-ignore` on 9 paths | `.DS_Store`, `node_modules`, `.next`, `.env`, `.env.local`, `*.onnx` ignored; `.env.example`, `package-lock.json`, screenshots tracked-eligible |
| 10 | `CI=1 npm run lint` | ❌ **Failed as expected** — `next lint` is deprecated and prompts for interactive ESLint setup; no config exists. Script removed (see deviation P0-D1) |

**Acceptance criteria (plan §16.2 P0 + owner instruction)**

| Criterion | Status | Evidence |
|---|---|---|
| Audit done; existing files preserved | ✅ | `docs/REPOSITORY_AUDIT.md`; Readme, plan, JPG untouched |
| `.gitignore` covers OS, secrets, venvs, caches, deps, artifacts | ✅ | Check #9 |
| `.env.example` has names + placeholders only | ✅ | Reviewed; no values that could authenticate |
| Status + assumptions + audit docs exist | ✅ | `docs/` |
| Four contract gaps recorded, not resolved | ✅ | G-01…G-04 in the audit and Q-01…Q-07 in assumptions |
| Frontend scaffolded with JSX, Tailwind, EN/HI | ✅ | `web/` |
| Renders at 360 px, verified in a real browser | ✅ | Check #7 + screenshots |
| External services checked; missing setup recorded | ✅ | Audit §5; none fabricated |

**Deviations taken in P0** (each reversible, each stated per ground rule 4)

- **P0-D1 — `lint` script removed rather than scaffolding ESLint mid-phase.** `next lint` is deprecated in Next 15.5 and requires an interactive first-run setup; in CI it exits 1. ESLint config belongs with CI (P1). The script is removed so no command falsely advertises a passing lint. **Removal criterion:** P1 adds an ESLint flat config and a working `npm run lint`.
- **P0-D2 — Token transport deferred.** The plan has no decision on JWT storage; recorded as Q-03, resolved in P1 before the auth UI.
- **P0-D3 — Screenshots produced by Playwright against the production build** rather than the Chrome CLI. The CLI capture at `--window-size=360,1400` clipped content (capture artifact — measured `scrollWidth` was exactly 360). Only the verified Playwright captures are kept.

**Known defects**

| ID | Severity | Description | Disposition |
|---|---|---|---|
| DEF-P0-01 | P2 (build-time) | `npm audit`: 2 advisories (1 high) in Next 15.5.28's bundled `postcss@8.4.31` — arbitrary `.map` file read during CSS processing. Not reachable at runtime in this app; build-time only. Clean fix requires Next 16 (breaking). | Accepted for P0. Tracked; revisit at hardening (plan P6). `npm audit fix --force` must not be run blindly. |
| DEF-P0-02 | P3 (environment) | Homebrew `postgresql@16` service in error state. | Pre-existing, unrelated to project. Not touched. |

**Unverified prerequisites (blocking later phases)**

| Prerequisite | Needed by | Status |
|---|---|---|
| Gemini API key + one successful smoke call | P1 LLM-01 (plan P0-03) | **Not provisioned.** Owner must create it and place it in a local `.env` only. Model ID must be read from the provider's current docs (Q-08), never guessed. |
| Backend dependencies (`uv`) | P1 | `uv 0.11.3` installed; no backend venv or lockfile yet |
| Alembic + SQLAlchemy + psycopg installed | P1 | Not installed |
| Project database `kisan_mitra_dev` | P1 (C-01) | Not created; Postgres 17 server is running |
| Containers / Docker | Deployment | Not installed (audit §4) |
| PlantVillage / PlantDoc | ML phase | Not downloaded |

---

## Next phase

### P1 — Contracts (owner-authorized acceptance criteria)

The plan groups P1 as C-01…C-07 (plan §16.2). Because execution is solo, P1 may be requested in sub-steps; **none of the acceptance criteria below may be skipped or softened.**

| ID | Deliverable | Acceptance criterion |
|---|---|---|
| C-01 | Database schema + Alembic migrations | `alembic upgrade head` run **twice** from an empty database exits 0 with no errors; schema matches the frozen §14.6 plus agreed additions for G-03 |
| C-02 | `InferenceResult` contract + stub adapter + `model_classes.json` | Stub returns a contract-valid `DiagnosisResult`; schema validation passes |
| C-03 | FastAPI skeleton (settings, error envelope, request IDs, health, OpenAPI) | `/healthz` returns 200 with component status; `/openapi.json` and `/docs` render |
| C-04 | Contract freeze | `GET /listings` (G-01), `/consultations` (G-02), missing tables (G-03), and the status enum (G-04) resolved and recorded **before** freezing; frozen OpenAPI committed under `contracts/` with a changelog line |
| C-05 | Auth (JWT + role guard) | T-SEC-01 passes locally: farmer A cannot read farmer B's data; admin is not self-registrable |
| C-06 | Data prep + leakage check + manifest | If requested with P1: split counts logged, no cross-split near-duplicates |
| C-07 | API client + auth UI + shell | Role-based redirect; token storage decision (Q-03) implemented |

**P1 hard prerequisites before it can start**

1. Owner authorizes P1 in writing.
2. For the LLM-dependent parts (not required for C-01…C-05): a Gemini API key available in a local `.env`; Q-08 answered from provider docs.
3. A decision on whether P1 is requested as one step or split (recommended split: **P1a = C-01/C-03/C-05**, **P1b = C-02/C-04/C-07**, with C-04 between them). If split, the contract cannot be frozen until C-02 exists.

**Not to be started in P1:** real model training, marketplace screens, assistant orchestrator, admin content — those are P2+ in the plan's order.

---

## Phase report index

| Phase | Status | Report delivered |
|---|---|---|
| P0 | Complete, pending review | 2026-10-17 (chat) |
| P1 | Not started | — |
