# Architecture Snapshot

## Repository Map

86 modules, 934 symbols, grouped by area. Every module is in `facts.jsonl`, or query_facts(kind="module").

| Area | Modules | Symbols | Languages |
|------|---------|---------|-----------|
| `frontend` | 78 | 664 | typescript |
| `backend` | 7 | 244 | python |
| `ml` | 1 | 26 | python |

Largest modules:
- `backend/app/routers` — 126 symbols (python)
- `frontend/.next/dev/server/chunks` — 118 symbols (typescript)
- `frontend/.next/dev/server/chunks/ssr` — 118 symbols (typescript)
- `frontend/.next/server/chunks` — 73 symbols (typescript)
- `frontend/.next/server/chunks/ssr` — 73 symbols (typescript)
- `frontend/components` — 55 symbols (typescript)
- `frontend/lib` — 51 symbols (typescript)
- `backend/app/assistant` — 47 symbols (python)
- `backend/app` — 29 symbols (python)
- `ml` — 26 symbols (python)
- `backend/app/core` — 20 symbols (python)
- `backend/app/ml` — 17 symbols (python)
- `frontend/app/admin` — 17 symbols (typescript)
- `frontend/.next/dev/types` — 14 symbols (typescript)
- `frontend/app/assistant` — 14 symbols (typescript)
- `frontend/.next/types` — 13 symbols (typescript)
- `frontend/app` — 8 symbols (typescript)
- `frontend/app/farmer` — 7 symbols (typescript)
- `frontend/app/farmer/diagnose` — 6 symbols (typescript)
- `frontend` — 5 symbols (typescript)

## Extraction Quality

- Files parsed: **308** / 25756 seen (13 file(s) + 14 directory tree(s) skipped by ignore globs)
- Parse errors: 0

## Architecture Pattern

**Architecture pattern: nextjs** (confidence: 92%)

Recognised nextjs from directory names: 72 of 78 typescript modules classified — 91% of this repository's 86 modules. Of 191 imports between ordered layers, 149 run inward and 42 against it (78% obey the order); the 42 are reported separately below.

Layer mapping:
- module "frontend/.next/dev/server/app" maps to layer "pages"
- module "frontend/.next/dev/server/app/admin" maps to layer "pages"
- module "frontend/.next/dev/server/app/assistant" maps to layer "pages"
- module "frontend/.next/dev/server/app/enquiries" maps to layer "pages"
- module "frontend/.next/dev/server/app/farmer" maps to layer "pages"
- module "frontend/.next/dev/server/app/farmer/analyses/[id]" maps to layer "pages"
- module "frontend/.next/dev/server/app/farmer/crops/[id]" maps to layer "pages"
- module "frontend/.next/dev/server/app/farmer/diagnose" maps to layer "pages"
- module "frontend/.next/dev/server/app/farmer/listings" maps to layer "pages"
- module "frontend/.next/dev/server/app/farmer/water" maps to layer "pages"
- module "frontend/.next/dev/server/app/help" maps to layer "pages"
- module "frontend/.next/dev/server/app/login" maps to layer "pages"
- … and 60 more (query_insights(explainer="layers") for all)

## How to Add a Feature

This code is laid out as **nextjs**. A dependency runs from an outer layer to an inner one, so a feature is built inward:

1. **pages** — e.g. `frontend/.next/dev/server/app`
2. **components** — e.g. `frontend/components`
3. **lib, types** — e.g. `frontend/lib`

## Entry Points

- **main**: `ml/baseline_b0.main` (ml/baseline_b0.py)
- **main**: `ml/export_onnx.main` (ml/export_onnx.py)
- **main**: `ml/prepare.main` (ml/prepare.py)
169 routes, 15 shown:
- **route** DELETE `/admin/kb/{article_id}` (backend/app/routers/content.py)
- **route** DELETE `/admin/schemes/{scheme_id}` (backend/app/routers/content.py)
- **route** DELETE `/admin/updates/{update_id}` (backend/app/routers/content.py)
- **route** DELETE `/me/crops/{crop_id}` (backend/app/routers/me.py)
- **route** GET `/_next/static/development/_devPagesManifest.json` (frontend/.next/dev/static/chunks/node_modules_next_dist_client_0tk8-26rtzlym._.js)
- **route** GET `/_next/static/development/_devPagesManifest.json` (frontend/.next/dev/static/chunks/node_modules_next_dist_client_16lnmlosr3ca7._.js)
- **route** GET `/_next/static/development/{}` (frontend/.next/dev/static/chunks/node_modules_next_dist_client_0tk8-26rtzlym._.js)
- **route** GET `/_next/static/development/{}` (frontend/.next/dev/static/chunks/node_modules_next_dist_client_16lnmlosr3ca7._.js)
- **route** GET `/_next/static/{}/{}` (frontend/.next/dev/static/chunks/node_modules_next_dist_client_0tk8-26rtzlym._.js)
- **route** GET `/_next/static/{}/{}` (frontend/.next/dev/static/chunks/node_modules_next_dist_client_16lnmlosr3ca7._.js)
- **route** GET `/` (frontend/app/layout.tsx)
- **route** GET `/` (frontend/app/page.tsx)
- **route** GET `/admin/listings` (backend/app/routers/content.py)
- **route** GET `/admin/schemes` (backend/app/routers/content.py)
- **route** GET `/admin/support/tickets` (backend/app/routers/support.py)
- … and 154 more (query_facts(kind="route") for all)

## Routes

169 routes, grouped by path prefix. query_facts(kind="route") for all of them.

| Prefix | Routes | Methods | Example |
|--------|--------|---------|----------|
| `/api` | 87 | GET | `/api/data` |
| `/me` | 15 | DELETE, GET, PATCH, POST | `/me` |
| `/admin` | 14 | DELETE, GET, PATCH, POST, PUT | `/admin` |
| `/_next` | 6 | GET | `/_next/static/development/_devPagesManifest.json` |
| `/farmer` | 6 | GET | `/farmer` |
| `/listings` | 5 | GET, PATCH, POST | `/listings` |
| `/market` | 5 | GET | `/market` |
| `/analyses` | 4 | GET, POST | `/analyses` |
| `/auth` | 4 | GET, POST | `/auth/login` |
| `/schemes` | 4 | GET | `/schemes` |
| `/enquiries` | 3 | GET, PATCH, POST | `/enquiries` |
| `/` | 2 | GET | `/` |
| `/assistant` | 2 | GET, POST | `/assistant` |
| `/updates` | 2 | GET | `/updates` |
| `/farmers` | 1 | GET | `/farmers/{farmer_id}/ratings` |
| `/healthz` | 1 | GET | `/healthz` |
| `/help` | 1 | GET | `/help` |
| `/irrigation` | 1 | GET | `/irrigation/estimate` |
| `/kb` | 1 | GET | `/kb` |
| `/login` | 1 | GET | `/login` |
| `/onboarding` | 1 | GET | `/onboarding` |
| `/readyz` | 1 | GET | `/readyz` |
| `/register` | 1 | GET | `/register` |
| `/support` | 1 | POST | `/support/tickets` |

## Storage

| Name | Kind | Operation | File |
|------|------|-----------|------|
| `analyses` | table |  | `backend/app/models.py` |
| `assistant_audit` | table |  | `backend/app/models.py` |
| `crop_updates` | table |  | `backend/app/models.py` |
| `disease_classes` | table |  | `backend/app/models.py` |
| `enquiries` | table |  | `backend/app/models.py` |
| `farm_crops` | table |  | `backend/app/models.py` |
| `images` | table |  | `backend/app/models.py` |
| `kb_articles` | table |  | `backend/app/models.py` |
| `listings` | table |  | `backend/app/models.py` |
| `market_prices` | table |  | `backend/app/models.py` |
| `ml_models` | table |  | `backend/app/models.py` |
| `ratings` | table |  | `backend/app/models.py` |
| `reminders` | table |  | `backend/app/models.py` |
| `reports` | table |  | `backend/app/models.py` |
| `schemes` | table |  | `backend/app/models.py` |
| `support_tickets` | table |  | `backend/app/models.py` |
| `updates` | table |  | `backend/app/models.py` |
| `users` | table |  | `backend/app/models.py` |

## Dependency Rules

- `backend/alembic/versions` -> `backend/alembic`
- `backend/app/assistant` -> `backend/app/ml`
- `backend/app/routers` -> `backend/app/assistant`
- `backend/app/routers` -> `backend/app/core`
- `backend/app/routers` -> `backend/app/ml`
- `backend/app` -> `backend/app/core`
- `backend/app` -> `backend/app/routers`
- `backend` -> `backend/app/core`
- `backend` -> `backend/app/ml`
- `frontend/app/farmer/analyses` -> `frontend/lib`
- `frontend/app/farmer/crops` -> `frontend/lib`
- `frontend/app/farmer` -> `frontend/components`
- `frontend/app/farmer` -> `frontend/lib`
- `frontend/app/market` -> `frontend/components`
- `frontend/app/market` -> `frontend/lib`
- `frontend/app/schemes` -> `frontend/lib`
- `frontend/app` -> `frontend/components`
- `frontend/app` -> `frontend/lib`
- `frontend` -> `frontend/lib`
- `ml` -> `backend/app/ml`

## Critical Modules

| Module | Fan-In | Fan-Out | Criticality |
|--------|--------|---------|-------------|
| `frontend/lib` | 21 | 0 | high |
| `frontend/app` | 0 | 13 | high |
| `backend/app/routers` | 1 | 10 | high |
| `backend/app/core` | 9 | 0 | medium |
| `backend/app/ml` | 6 | 0 | medium |
| `backend/app/assistant` | 3 | 2 | medium |
| `frontend/components` | 5 | 0 | medium |
| `backend/app` | 0 | 4 | low |
| `frontend/app/farmer` | 0 | 4 | low |
| `frontend/app/market` | 0 | 4 | low |

## Risk Zones

41 findings, the 25 most confident shown. query_insights() for all.

- **Cyclic dependency detected (5 modules)** (confidence: 100%): The following modules form a dependency cycle: backend/app -> backend/app/assistant -> backend/app/core -> backend/app/ml -> backend/app/routers -> backend/app. This can cause initialization issues, make refactoring harder, and indicates tight coupling.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/admin" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/assistant" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/enquiries" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/farmer" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/farmer/analyses/[id]" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/farmer/crops/[id]" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/farmer/diagnose" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/farmer/listings" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/farmer/water" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/help" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/login" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/market" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/market/[id]" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/market/prices" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/onboarding" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/register" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/schemes" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/schemes/[id]" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/dev/types" (layer: types, level 0) imports module "frontend/app/updates" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/types" (layer: types, level 0) imports module "frontend/app" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/types" (layer: types, level 0) imports module "frontend/app/admin" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/types" (layer: types, level 0) imports module "frontend/app/assistant" (layer: pages, level 3). Inner layers should not depend on outer layers.
- **Layer violation: types -> pages (nextjs)** (confidence: 80%): Module "frontend/.next/types" (layer: types, level 0) imports module "frontend/app/enquiries" (layer: pages, level 3). Inner layers should not depend on outer layers.

---

*Generated at 2026-10-18T01:47:54Z in 6m27.0227965s. 2434 facts, 177 insights.*
