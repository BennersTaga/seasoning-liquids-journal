# Seasoning Liquids Journal Prototype

This repository scaffolds a Next.js App Router project with Tailwind CSS and shadcn/ui. It exists as a host for an embedded Canvas prototype that can be shared across different entry points (`/office` and `/floor`).

## Getting started

```bash
npm install
```

### Available commands

- `npm run dev` – start the local development server.
- `npm run build` – create a production build.
- `npm run lint` – run ESLint checks.
- `npm run lint:fix` – auto-fix lint issues where possible.
- `npm run typecheck` – run TypeScript in no-emit mode to validate types.

## Local development workflow

1. Copy `.env.local.example` to `.env.local` and fill in the Apps Script endpoint details (see below).
2. Start the dev server with `npm run dev`.
3. Edit `src/app/(ui)/prototype/page.tsx` to paste your Canvas prototype integration.
4. Visit `http://localhost:3000/` and use the **Office** or **Floor** links to preview the embed in different routes.

## Environment variables

The front-end talks to Google Sheets via a Google Apps Script Web App.

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_BASE` | Base URL of the Apps Script deployment that fronts Google Sheets. |
| `NEXT_PUBLIC_API_KEY` | Optional API key header (`x-api-key`) for the Apps Script gateway. |

> Never commit a real `.env.local` file to the repository; use `.env.local.example` as a reference.

## Prototype host

The shared prototype host component lives at `src/app/(ui)/prototype/page.tsx`. Both `/office` and `/floor` import that component directly, so you only need to paste your embed once.

UI primitives (button, dialog, card, etc.) live in `src/components/ui` and are provided via shadcn/ui.

## Deployment on Vercel

1. Create a new project in Vercel and connect it to the GitHub repository that hosts this code.
2. Set the `NEXT_PUBLIC_API_BASE` and `NEXT_PUBLIC_API_KEY` environment variables inside the Vercel project settings.
3. Vercel will run `npm run build` (configured in `vercel.json`) to produce the production build.

## Next steps checklist

- Paste your Canvas prototype into `src/app/(ui)/prototype/page.tsx`.
- Create `.env.local` with the Google Apps Script URLs/keys.
- Run `npm run dev` for local previews.
- When ready, push your branch and open a GitHub Pull Request (avoid binary assets; SVG favicon is already included).
- Link the repo to Vercel and mirror the environment variables for production builds.
