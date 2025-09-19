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

1. Copy `.env.example` (or `.env.local.example`) to `.env.local` and fill in the Apps Script endpoint details (see below).
2. Start the dev server with `npm run dev`.
3. Edit `src/app/(ui)/prototype/page.tsx` to paste your Canvas prototype integration.
4. Visit `http://localhost:3000/` and use the **Office** or **Floor** links to preview the embed in different routes.

## Environment variables

The application reads master/order/storage data from Google Sheets via a Google Apps Script Web App that is accessed **only** through the Next.js server.

| Variable | Description |
| --- | --- |
| `GAS_BASE_URL` | Base URL of the Google Apps Script deployment that fronts Google Sheets. The Next.js API route proxies all requests to this endpoint. |
| `GAS_API_KEY` | API key stored in the GAS Script Properties. It is appended by the server bridge when forwarding requests. |

> Never commit a real `.env.local` file to the repository; use `.env.example` / `.env.local.example` as a reference.

## Backend (GAS bridge)

The server-side bridge (`/api/gas/*`) proxies GET/POST requests to the configured GAS deployment. Masters, orders, and storage data as well as action logging (保管, 使用, 廃棄, 分割) all flow through this bridge so that credentials never reach the browser.

## Prototype host

The shared prototype host component lives at `src/app/(ui)/prototype/page.tsx`. Both `/office` and `/floor` import that component directly, so you only need to paste your embed once.

UI primitives (button, dialog, card, etc.) live in `src/components/ui` and are provided via shadcn/ui.

## Deployment on Vercel

1. Create a new project in Vercel and connect it to the GitHub repository that hosts this code.
2. Set `GAS_BASE_URL` and `GAS_API_KEY` inside the Vercel project settings.
3. Vercel will run `npm run build` (configured in `vercel.json`) to produce the production build.

## Next steps checklist

- Paste your Canvas prototype into `src/app/(ui)/prototype/page.tsx`.
- Create `.env.local` with the Google Apps Script URLs/keys.
- Run `npm run dev` for local previews.
- When ready, push your branch and open a GitHub Pull Request (avoid binary assets; SVG favicon is already included).
- Link the repo to Vercel and mirror the environment variables for production builds.
