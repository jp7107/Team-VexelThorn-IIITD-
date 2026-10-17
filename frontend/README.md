# Frontend (Next.js 16)

Implements plan FE-01 and FE-02: app shell, Hindi/English, installable PWA manifest, landing, register, login, farmer onboarding (first crop), and a minimal farmer home. Buyer and admin homes are placeholders.

## Run locally

Start the backend first (see `backend/README.md`). Then from `frontend/`:

```bash
npm install
```
```bash
npm run dev
```

Open http://localhost:3000. API calls go to `/api/*`, which Next.js rewrites to `BACKEND_URL` (default `http://localhost:8000`), so the session cookie stays same-origin.

## Conventions

- Every user-facing string lives in `messages/en.json` and `messages/hi.json`. Use `useI18n().t("key")`. Hindi strings need a native-speaker review before demo day (plan §15.3).
- Hindi is the default language. The user's choice is stored in `localStorage` and set from their profile at login.
- Design tokens are in `app/globals.css`: indigo `ink`, `haldi` accent, `field` green, `danger`. Use the shared pieces in `components/ui.tsx` (`Screen`, `Button`, `Field`, `ChoiceTile`) so tap targets stay at least 44px.
- `useSession(["farmer"])` from `lib/session.ts` guards a page. It only handles routing; the backend enforces permissions.
- This Next.js version has `cacheComponents` on. Read `node_modules/next/dist/docs/` before using cookies, headers or caching APIs.
