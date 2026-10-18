# Agent brief — Kisan Mitra NewFrontend

Read this before writing code. It is the contract for every feature agent.

## What exists already (do not rewrite without need)

- Stack: Next.js **16.4.2** App Router, React 19, TypeScript strict, plain CSS (no Tailwind).
- `src/app/globals.css` — design tokens (`--km-*`) and primitive classes: `.km-panel`, `.km-panel-head`,
  `.km-panel-title`, `.km-panel-body`, `.km-icon-tile`, `.km-btn` (+ `primary|secondary|ghost|danger`, `.sm`),
  `.km-icon-btn`, `.km-input/.km-select/.km-textarea`, `.km-label`, `.km-hint`, `.km-error`, `.km-badge`
  (+ `demo|sample|guidance|bad|good|info|neutral`), `.km-table`, `.km-caption`, `.km-footnote`, `.km-metric`,
  `.km-state` (+ `.error`), `.km-skeleton`, `.km-linkish`, `.km-sr-only`, `.km-scroll-x`.
- `src/app/shell.css` — sidebar/header shell, responsive collapse at 1199 px / 767 px.
- `src/features/dashboard/dashboard.css` — dashboard-only styles.
- `src/components/ui.tsx` — `Panel, Badge, DemoBadge, PageHeading, Button, ButtonLink, LoadingBlock,
  ErrorState, EmptyState, UnavailableState, Divider, DataRow, ChevronRow`.
- `src/components/icons.tsx` — outline icon set + `BrandMark`. Check it before adding an icon.
- `src/lib/api.ts` — typed contract + `api()`, `uploadAnalysis()`, `ApiError`, `describeError`, `homeFor`.
- `src/lib/useApi.ts` — `useApi<T>(path | null)` → `{data, error, loading, reload}` (abort on unmount).
- `src/lib/session.tsx` — `useSession()` and `RequireRole({roles, children: (user) => …})`, `PageSkeleton`.
- `src/lib/i18n.tsx` — `useI18n()` → `{lang, setLang, t}`; dictionaries in `src/messages/en.json|hi.json`.
- `src/lib/format.ts` — `inr, num, pct, shortDate, dayMonth, timeAgo, isoDate, cropLabel, CROP_OPTIONS,
  statusTone, analysisStatusLabel, stageLabel, STATES`.

## Rules

1. **Stay inside the files you own.** Shared files above are read-only for feature agents. If you need a new
   shared primitive, define it locally in your feature folder instead.
2. **No invented API.** Use only the endpoints listed below, exactly. If something the UI needs does not
   exist, render `UnavailableState` / `EmptyState` with honest copy and record it in your summary.
3. **Honest data.** Never display a sample number as live. Analysis values come from the API. Prices are
   labelled `Sample prices · not live` when `meta.source_status === "demo"` or any row `is_demo`. Demo
   imagery must carry a `DEMO DATA` badge.
4. **Language.** All user-facing copy goes through `t("yourKey")` with keys added to **both** messages files
   under a namespaced object (`health`, `assistant`, `prices`, `market`, `enquiries`, `schemes`, `updates`,
   `history`, `help`, `advice`, `auth`, `admin`). Never edit another feature's keys. English is the source
   of truth; Hindi must be a real translation (Devanagari), not transliteration.
5. **Roles.** Wrap page content in `<RequireRole roles={[...]}>`. Backend roles: `farmer`, `customer`, `admin`.
   Remember: `GET /market/prices`, `/schemes`, `/updates`, `/listings`, `/auth/me` need a signed-in user.
6. **Error/loading/empty states** for every async widget. Use `LoadingBlock`, `ErrorState` + `reload`,
   `EmptyState`. Use the `ApiError` messages via `describeError`.
7. **Accessibility.** Semantic landmarks, labelled controls, visible focus (global focus style exists),
   Escape closes popovers, tables have `<th scope="col">`, color is never the only signal, chart has a text
   summary / table alternative, `aria-live` for async status where useful.
8. **Design.** Light agriculture SaaS. Match the reference: white/pale-green tinted cards, 13px radius,
   fine borders, restrained shadows, 12–13px body type, green primary actions, compact density.
   No neon, no huge type, no emoji as icons (the leaf mark may use `BrandMark`).
9. **Next 16.** Client components use `"use client"`; no `use cache`, no server fetch of the authenticated
   API (cookie lives in the browser). Build with `npx tsc --noEmit`; never run `next build` or `next dev`
   (the orchestrator builds centrally).
10. **Files.** Feature pages live under `src/app/(app)/<route>/page.tsx`; feature code under
    `src/features/<feature>/`. Pages default-export a component. Route groups `(app)` already carry the shell.

## Verified API contract (prefix `/api/v1`)

Auth (httpOnly cookie `session`; `api()` sends it same-origin):
- `POST /auth/login` `{phone, password}` → `User` (401 wrong credentials)
- `POST /auth/register` `{name, phone, password, role: "farmer"|"customer", customer_type?, language, state, district}` → `User`
- `POST /auth/logout` → 204
- `GET /auth/me` → `User` (401 when signed out)
- `PATCH /me` `{name?, language?, state?, district?, lat?, lon?}` → `User`
- `GET /readyz` → `{db, model:{loaded,...}, llm_configured}`

Farmer:
- `GET /me/crops` → `Crop[]`; `POST /me/crops` `{crop_code, variety?, area_acres, sowing_date, stage, soil_type?}` → `Crop`
- `PATCH /me/crops/{id}`, `DELETE /me/crops/{id}`
- `GET /me/reminders?due=true` → `Reminder[]`; `POST /me/reminders` `{title, due_at (ISO with zone), farm_crop_id?}`;
  `PATCH /me/reminders/{id}` `{done: boolean}`
- `POST /analyses` multipart `image` (JPEG/PNG/WebP ≤5 MB), `crop_code`, `farm_crop_id?` → `Analysis`
  (503 when model unavailable; 415 unsupported format; 413 too large)
- `GET /analyses/{id}` → `Analysis`; `GET /me/analyses?limit=1..100` → `Analysis[]` (newest first)
- `POST /analyses/{id}/report` `{language}` → `Report` (idempotent; 201 first, 200 existing)
- `GET /analyses/{id}/report?language=en|hi` → `Report` (404 when not generated yet)

Assistant (any signed-in role):
- `POST /assistant/chat` `{messages: [{role:"user"|"assistant", content≤1000}] max 10, last must be user, language, analysis_id?}` → `ChatReply`

Marketplace:
- `GET /listings?crop_code&state&district&min_quintal&limit≤50&offset` → `Listing[]` (open only)
- `POST /listings` (farmer) `{crop_code, title, description?, quantity, unit, price_per_unit?, min_order_qty?, state?, district?}` → `Listing`
- `GET /me/listings` (farmer) → `Listing[]`; `PATCH /listings/{id}` (owner: title, description, quantity, price_per_unit, min_order_qty, status open|closed; admin: status hidden|open)
- `GET /listings/{id}` → `Listing`
- `POST /listings/{id}/enquiries` (customer) `{quantity, message?}` → `Enquiry`
- `GET /me/enquiries` (farmer: received; customer: sent) → `Enquiry[]`
- `PATCH /enquiries/{id}` `{status: accepted|declined|withdrawn}` (transitions: farmer pending→accepted|declined; customer pending→withdrawn)
- `POST /enquiries/{id}/rating` (customer, accepted, once) `{stars 1..5, comment?}`
- `GET /farmers/{farmer_id}/ratings` → `FarmerRatings`

Prices:
- `GET /market/prices?commodity=…&state?&district?&limit≤100` → `Prices` (`meta.source_status`: live|cached|demo|none; rows carry `arrival_date`, `modal_price`, `min_price`, `max_price`, `unit`, `source`, `is_demo`, `stale`)
- `GET /market/commodities` → `string[]`

Content:
- `GET /schemes?state=` → `Scheme[]` (published); `GET /schemes/{id}` → `Scheme`
- `GET /updates?limit≤50` → `FarmUpdate[]`
- `GET /kb?q=&crop_code=` → `KbArticle[]`

Admin:
- `GET /admin/schemes`, `POST /admin/schemes`, `PATCH /admin/schemes/{id}`, `DELETE /admin/schemes/{id}`
- `GET /admin/updates`, `POST /admin/updates`, `DELETE /admin/updates/{id}`
- `GET /admin/kb`, `POST /admin/kb`, `PUT /admin/kb/{id}`, `DELETE /admin/kb/{id}`
- `GET /admin/users?role=`, `GET /admin/listings?status=`

Error envelope: `{"error": {code, message, details, request_id}}` — `api()` already turns it into `ApiError`.

## Reference dashboard (visual source of truth)

1586×992 image at the repo root: `Kisan Mitra Smart Farming Dashboard.png`. Sidebar 252 px; header greeting
("Namaste, Ramesh 👋"), subtitle "Your farm, healthier and smarter.", location pill, bell, green
"Analyze a crop". Four KPI cards (Crop Health Checks 12 / Active Listings 3 / New Enquiries 5 / Market
Updates Today). Crop health panel with leaf photo, "Possible early blight", 82 % confidence bar, red
"AI prediction · not a confirmed diagnosis" strip, "View report", "Scan another leaf", advisory note.
"Today on your farm" (weather, irrigation, growth). "Mandi price snapshot" table with Crop/Price/Trend.
"Crop observations" chart. "Quick actions" 4 rows. "Government schemes & updates". "Marketplace" strip with
4 produce cards. Bottom "System flow (high level)" strip.

## Country realities to respect

- The backend has **no weather API** and **no notification/unread API**: show honest unavailable states.
- Listings have **no image field**: use a generated produce tile (CSS gradient + emoji/large initial) rather
  than pretending a photo is the listing's.
- A leaf diagnosis only applies to the 17 PlantVillage classes (tomato, potato, maize, pepper, etc.);
  `crop_code` is free text but the model's supported set is limited — read `Analysis.prediction` for truth.
- Do not publish official scheme claims that are not in the API. No hardcoded PM-KISAN dates.
