# Repository Audit — verified baseline

**Audited:** 2026-10-17, from a fresh checkout at commit `5729bbc`
**Auditor:** implementation session (sole developer)
**Method:** `git status`, `git log --all`, `git ls-tree -r` against every remote branch, directory listing, toolchain probes. Nothing below is inferred; each line is an observed result.

This audit supersedes §1.2 of `IMPLEMENTATION_PLAN.md` ("no repository"), which was written when the repository was not mounted. A repository does exist; it contains documents only.

---

## 1. Git state

| Item | Observed value |
|---|---|
| Working tree | `main`, clean except untracked `.DS_Store`, `.claude/`, `IMPLEMENTATION_PLAN.md` |
| HEAD | `5729bbc` — *Fix image link and upload image file* |
| History | 2 commits: `1d9527d` (initial Readme) → `5729bbc` (image fix + JPG upload) |
| Remote | `origin` → `https://github.com/jp7107/Team-VexelThorn-IIITD-.git` |
| Branches (remote) | `main`, `JyotiPrakash`, `Vanshika`, `dhruv`, `harshvardhan-singh`, `yash` |
| Branch contents | **All six remote branches point at `5729bbc` and contain exactly two files** (`Readme.md`, `PHOTO-2026-10-17-12-36-47.jpg`). No branch holds code. |
| Tags | none |
| Secrets in history | none found in the two commits; no `.env` was ever committed |

**Consequence:** every remote branch is safe to preserve untouched. P0 adds files on `main`; it does not merge, rebase, reset, or delete any branch.

## 2. File inventory at audit time

| Path | Tracked | Purpose | P0 action |
|---|---|---|---|
| `Readme.md` | yes | Theme card transcription, team name | Preserved untouched |
| `PHOTO-2026-10-17-12-36-47.jpg` | yes | Theme-card image referenced by Readme | Preserved untouched |
| `IMPLEMENTATION_PLAN.md` | **no** | Engineering source of truth | Preserved as-is; its tracking is left to the repository owner |
| `.DS_Store` | no | OS metadata | Now ignored by `.gitignore`; not deleted |
| `.claude/settings.json`, `.claude/settings.local.json` | no | Local harness configuration | `settings.local.json` added to `.gitignore`; `settings.json` left for the owner to decide |

## 3. The five audit questions from IMPLEMENTATION_PLAN.md §1.2

| # | Question | Answer |
|---|---|---|
| (a) | Frontend framework and version | **None present.** Proposed: Next.js App Router, JSX, Tailwind (§1.4, as approved). |
| (b) | What serves the API | **Nothing.** Proposed: FastAPI + Python 3.11 in `backend/`. |
| (c) | Database and schema | **None.** Postgres 17.10 runs locally (Homebrew, accepting connections on `localhost:5432`); no project database or migrations exist. |
| (d) | ML artifacts or notebooks | **None.** |
| (e) | Existing deployment | **None.** No `Dockerfile`, `vercel.json`, `render.yaml`, or CI workflow. |

**Nothing is classified `[EXISTING]`.** Every planned component remains `[PROPOSED]`, and there is no existing behaviour to preserve beyond the three files in §2.

## 4. Local toolchain observed

| Tool | Version | Relevance |
|---|---|---|
| macOS | 27.0.1 (darwin, arm64) | No CUDA; ML phase will use MPS/CPU + ONNX Runtime CPU (§8.4, approved D-06) |
| Node.js | v24.15.0 | Meets Next.js 15 requirement |
| npm | 10.8.2 | **Chosen package manager** (see §6) |
| Yarn | 1.22.22 | Present but unused |
| pnpm | not installed | — |
| Python | 3.11.15 (both `python3` and `python3.11`) | Matches plan §1.4 |
| uv | 0.11.3 | Available for backend dependency management in P1 |
| PostgreSQL | 17.10 (Homebrew service `postgresql@17`, started) | Local DB available |
| `postgresql@16` | Homebrew service in **error** state | Pre-existing, unrelated; do not fix in P0 |
| Docker / Colima | not installed | Deployment path must not assume local Docker |
| npm registry | reachable (`HTTP 200` from `registry.npmjs.org`) | Dependency install will work |
| Chrome (Google Chrome.app) | installed | Available as a headless render-check browser |

## 5. External services and credentials required but not held

None of these can be verified without the owner providing credentials or creating accounts. **No connection is claimed as verified.**

| Service | Needed by | Status |
|---|---|---|
| Gemini API key | LLM phase (P1 smoke call, plan P0-03) | Not present. Must be provisioned by owner and entered in a local `.env` only. |
| S3-compatible bucket | Deployment phase | Not present. Local-disk driver is the development path (approved D-05). |
| Container host / frontend host | Deployment phase | Not present. |
| PlantVillage / PlantDoc dataset | ML phase | Not downloaded. |

## 6. Package manager decision

No lockfile, `package.json`, `requirements.txt`, or `.tool-versions` exists, so there is no prior convention to follow. **npm 10.8.2** is chosen because it ships with the installed Node 24 and needs no additional global tool. This is recorded in `docs/ASSUMPTIONS.yaml` (D-07). The backend will use `uv` in P1 unless a reason not to appears.

## 7. Contract and design gaps found while auditing the plan

These are defects in `IMPLEMENTATION_PLAN.md` as written. They are **recorded, not resolved**. Each is assigned to the phase that freezes the affected contract or schema.

| ID | Gap | Affects | Resolve in | Constraint |
|---|---|---|---|---|
| **G-01** | §14.5 has no `GET /listings` collection endpoint for discovery (FR-DISCOVER, Tier 1). Only `/listings/{id}` and `/listings/mine` exist. | API contract §14.5, frontend `/app/market` and `/shop` | P1 (contract freeze) | Must support `crop`, `district`, `q`, `status=active`, pagination `limit`/`cursor` per §14.1. Must not expose another farmer's private data. |
| **G-02** | §14.5 lists `GET /consultations`, which has no entity, table, or requirement origin anywhere in the plan. | API contract §14.5 | P1 (contract freeze) | Either drop it or state its purpose in one line with a diagram origin. **Do not invent a consultation model.** |
| **G-03** | §14.6 DDL omits tables the plan's own routes and paths require: `ratings` (§13.1, §14.5, MK-06), `support_requests` (§12.4, FR-SUPPORT), `conversations` / `assistant_messages` (§14.4 `GET /assistant/conversations/{id}`), and `assistant_tool_audit` beyond the generic `audit_log`. No unique constraint is given for `farmer_crops`, and no `updated_at` trigger for `listings`. | DB schema §14.6, Alembic migrations | P1 (C-01, before freeze) | Tier assignment stays as planned: `ratings` and `support_requests` are Tier 2; conversation persistence is required by the §14.4 contract. Constraint names and enums must match §14.6 style. |
| **G-04** | §14.3 calls `status` a "closed enum" with four values (`confident`, `uncertain`, `unsupported`, `unsupported_crop`), while §8.8 lists two further rows (`invalid_image`, `unavailable`) that are HTTP-level outcomes, not stored states. The contract does not say which are persisted and which are transport-only. | API contract §14.3, `diagnoses.Status` CHECK constraint §14.6 | P1 (contract freeze + C-01) | Must persist only statuses with a diagnosis row; transport failures return the §14.2 error envelope with the codes in §14.3. Ship the resulting ambiguity-free statement in `contracts/`. |

Additional notes recorded but not counted as gaps:

- **Token storage (Q-03):** the plan never states where the browser stores the JWT. It must be decided before the auth UI (C-07).
- **Login identifier (Q-04):** §14.2 uses phone+password; §2.1 says "phone + OTP or password fallback". The contract implements phone+password; OTP is Tier 3. No code change needed, documented only.
- **`ASSUMPTIONS.yaml` placement:** the plan names it as a companion file at repository root; the owner's instruction places it at `docs/ASSUMPTIONS.yaml`. The owner's instruction wins and is recorded in D-01 of that file.

## 8. Baseline verdict

The repository is a documents-only scaffold. P0 can proceed additively. **No regression suite exists**, so every test run in later phases starts from zero coverage rather than a known-green baseline.
