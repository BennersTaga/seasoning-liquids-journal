// src/app/api/gas/[...path]/route.ts
// Next.js App Router route handler that proxies Google Apps Script.
// Uses server-only env vars: GAS_BASE_URL and GAS_API_KEY.

export const dynamic = 'force-dynamic';

function must<T>(v: T | undefined, name: string): T {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// GET /api/gas/<path>?...   →  GET <GAS_BASE_URL>?path=<path>&key=<GAS_API_KEY>&...
export async function GET(req: Request, ctx: { params: { path?: string[] } }) {
  const base = must(process.env.GAS_BASE_URL, 'GAS_BASE_URL');
  const key  = must(process.env.GAS_API_KEY,  'GAS_API_KEY');

  const path = (ctx.params.path?.join('/') || '').trim();      // e.g. 'ping', 'masters'
  const url  = new URL(req.url);
  url.searchParams.delete('key');                               // ignore any client-provided key
  const qs   = url.searchParams.toString();

  const target = `${base}?path=${encodeURIComponent(path)}${qs ? `&${qs}` : ''}&key=${encodeURIComponent(key)}`;
  const r = await fetch(target, { cache: 'no-store' });

  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}

// POST /api/gas/<anything>  →  POST <GAS_BASE_URL>?key=<GAS_API_KEY>
export async function POST(req: Request) {
  const base = must(process.env.GAS_BASE_URL, 'GAS_BASE_URL');
  const key  = must(process.env.GAS_API_KEY,  'GAS_API_KEY');

  const body = await req.text();
  const r = await fetch(`${base}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}
