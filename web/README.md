# Kisan Mitra — frontend (`web/`)

Next.js 15 App Router, JavaScript/JSX, Tailwind CSS v4. Foundation only as of Phase P0: no API calls, no authentication, no diagnosis, no marketplace screens.

## Run locally

```bash
cd web
npm install          # first time only; writes package-lock.json
npm run dev          # http://localhost:3000
```

Build check (the command used by the P0 testing gate):

```bash
cd web && npm run build
```

## Layout

| Path | Purpose |
|---|---|
| `app/layout.jsx` | Root layout, metadata, viewport, Devanagari font, language provider |
| `app/page.jsx` | Landing page (server component, delegates to a client component) |
| `app/globals.css` | Design tokens (colour, type, spacing), light/dark, component primitives |
| `components/` | Client components: language provider, toggle, home content |
| `i18n/dictionaries.json` | Complete EN and HI strings |
| `i18n/index.js` | Dictionary lookup helpers |

## Design constraints carried from the implementation plan

- Usable at **360 px** with no horizontal scroll (§15.3, NFR-04).
- Tap targets ≥ **44 px**; every input labelled; visible focus ring (§19.1, NFR-11).
- **Hindi is the default** for the farmer surface; English is one tap away and the choice persists (§15.2, D-10).
- Nothing renders a fabricated value. Any future sample or demonstration data must carry a visible chip (§13.2, NFR-12).

## Environment

Copy `.env.local.example` to `.env.local`. Only `NEXT_PUBLIC_*` values reach the browser; never put a secret in this app.
